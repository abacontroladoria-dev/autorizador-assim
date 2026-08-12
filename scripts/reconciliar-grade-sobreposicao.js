#!/usr/bin/env node
// Fase 1.3 — Reconciliação da janela em que as duas fontes coexistem:
// 2026-07-01 → 2026-08-04.
//
// Fora dessa janela é simples: antes dela a tabela está vazia (o
// importar-backup-grade.js faz INSERT puro), depois dela quem manda é a API.
// Aqui, não: a tabela já foi populada pela API enquanto esses dias eram futuros,
// e o backup XLS traz o retrato atual dos mesmos dias. Regra de autoridade
// definida: até 2026-08-04 o XLS é a autoridade sobre QUAIS agendamentos existem.
//
// Três movimentos, nesta ordem:
//
//   A) INSERT   linhas do XLS sem correspondente na tabela. São agendamentos
//               criados na TiTa DEPOIS de o dia já ter sido sincronizado — o sync
//               nunca voltou a olhar para trás, então nunca os viu. Medido: ~73.
//
//   B) INATIVAR linhas 'Agendado' da tabela sem correspondente no XLS. Nunca
//               DELETE — é justamente o apagamento silencioso que este projeto
//               existe para impedir. O motivo é classificado em dois casos:
//
//                 'alterado' → o mesmo paciente tem sessão no mesmo dia entre as
//                              linhas que estão ENTRANDO. A sessão não sumiu, ela
//                              mudou de horário/profissional/terapia, e a versão
//                              nova entra no lugar.
//                 'excluido' → não reaparece de forma nenhuma: sumiu da TiTa.
//
//               A classificação é heurística por necessidade: o XLS não traz
//               `tita_agendamento_id`, que seria a prova de identidade. Medido na
//               carga real: 12 dos 43 casos são alterações (8 trocas de terapeuta
//               em 2026-07-07, 3 mudanças de horário, 1 reatribuição para
//               profissional desligado) — todos com par óbvio do outro lado.
//               O limite conhecido: paciente que num mesmo dia teve uma sessão
//               cancelada E outra, sem relação, criada, é rotulado 'alterado'.
//               Isso afeta só o campo de auditoria; o conjunto ativo final é o
//               mesmo nos dois casos.
//
//   C) PRESERVAR tudo que não é 'Agendado' (slots 'Livre' e as 9 linhas
//               'Sem Agendamento', todas sem tita_agendamento_id). O XLS só
//               contém agendamentos marcados e não diz nada sobre esses slots,
//               então compará-los seria inventar informação.
//
// Precisa rodar ANTES da migration do trigger (20260805160200): o movimento B é
// UPDATE em data passada, que o trigger passa a bloquear.
//
// Uso:
//   node scripts/reconciliar-grade-sobreposicao.js           # dry-run
//   node scripts/reconciliar-grade-sobreposicao.js --apply

const {
  lerEnv, descreverDestino, parsearBackup, chaveNatural, selecionarTudo, inserirLote,
  atualizarPorIds, schemaFase1Pronto,
} = require("./lib/backup-grade")

const JANELA_DE  = "2026-07-01"
const JANELA_ATE = "2026-08-04"

const LOTE = 500

// Só linhas 'Agendado' entram na comparação. Ver comentário (C) no topo.
const STATUS_COMPARAVEL = "Agendado"

const CAMPOS_BASE  = "id,data,hora_inicial,profissional_id,paciente_id,terapia_id,status_agendamento,paciente_nome,profissional_nome,terapia_nome"
// ativo/origem só existem depois da migration 20260805160000. O dry-run roda sem
// elas para permitir conferir os números antes de mexer no schema de produção.
const CAMPOS_FASE1 = `${CAMPOS_BASE},ativo,origem`

/** Agrupa por chave natural. Devolve Map<chave, item[]> — nunca assume unicidade. */
function agrupar(itens) {
  const m = new Map()
  for (const i of itens) {
    const k = chaveNatural(i)
    const atual = m.get(k)
    if (atual) atual.push(i)
    else m.set(k, [i])
  }
  return m
}

function amostra(itens, n = 8) {
  return itens.slice(0, n).map(i =>
    `    ${i.data} ${String(i.hora_inicial).slice(0, 5)}  ${String(i.profissional_nome || "?").slice(0, 26).padEnd(26)} ` +
    `${String(i.paciente_nome || "?").slice(0, 28).padEnd(28)} ${String(i.terapia_nome || "?").slice(0, 22)}`,
  ).join("\n")
}

async function main() {
  const aplicar = process.argv.slice(2).includes("--apply")
  const cfg     = lerEnv()

  console.log(`Destino: ${descreverDestino(cfg)}`)
  console.log(`Janela de reconciliação: ${JANELA_DE} → ${JANELA_ATE}\n`)

  const { linhas: doXls } = parsearBackup({ de: JANELA_DE, ate: JANELA_ATE })
  console.log(`Backup XLS ................. ${doXls.length} agendamentos`)

  const schemaPronto = await schemaFase1Pronto(cfg)
  if (!schemaPronto) {
    console.log(
      "\n⚠  A migration 20260805160000 (colunas ativo/origem) ainda não foi aplicada.\n" +
      "   Seguindo em modo degradado: dá para conferir os números, mas não gravar.",
    )
    if (aplicar) {
      console.error("\nAbortando --apply: aplique a migration das colunas primeiro.")
      process.exitCode = 1
      return
    }
  }

  const naTabela = await selecionarTudo(
    cfg, schemaPronto ? CAMPOS_FASE1 : CAMPOS_BASE, `data=gte.${JANELA_DE}&data=lte.${JANELA_ATE}`,
  )
  const agendados = naTabela.filter(r => r.status_agendamento === STATUS_COMPARAVEL)
  const outros    = naTabela.filter(r => r.status_agendamento !== STATUS_COMPARAVEL)

  console.log(`Tabela (todas) ............. ${naTabela.length}`)
  console.log(`  'Agendado' (comparáveis) . ${agendados.length}`)
  console.log(`  preservadas intactas ..... ${outros.length}  (${[...new Set(outros.map(o => o.status_agendamento))].join(", ") || "—"})`)

  // Guarda de idempotência: rodar duas vezes duplicaria os inserts do movimento A,
  // e o trigger de congelamento impede apagá-los depois.
  const jaSemeadas = naTabela.filter(r => r.origem === "backup_xls")
  if (jaSemeadas.length > 0) {
    console.error(
      `\nAbortando: a janela já tem ${jaSemeadas.length} linhas com origem='backup_xls'.\n` +
      `Esta reconciliação já foi aplicada — rodar de novo duplicaria os inserts.`,
    )
    process.exitCode = 1
    return
  }

  const porChaveXls = agrupar(doXls)
  const porChaveTab = agrupar(agendados)

  // A) no XLS e não na tabela (contando as duplicidades legítimas)
  const aInserir = []
  for (const [k, doLado] of porChaveXls) {
    const naOutra = porChaveTab.get(k)?.length ?? 0
    if (doLado.length > naOutra) aInserir.push(...doLado.slice(naOutra))
  }

  // B) na tabela e não no XLS
  const aInativar = []
  for (const [k, doLado] of porChaveTab) {
    const naOutra = porChaveXls.get(k)?.length ?? 0
    if (doLado.length > naOutra) aInativar.push(...doLado.slice(naOutra))
  }

  // Classifica cada inativação: a sessão reaparece do outro lado (alteração) ou
  // sumiu de vez (exclusão)? Ver comentário (B) no topo.
  const entrandoPorPacienteDia = new Set(aInserir.map(r => `${r.data}|${r.paciente_id}`))
  const alterados = aInativar.filter(r =>  entrandoPorPacienteDia.has(`${r.data}|${r.paciente_id}`))
  const excluidos = aInativar.filter(r => !entrandoPorPacienteDia.has(`${r.data}|${r.paciente_id}`))

  console.log(`\nA) INSERT   — no XLS, ausentes na tabela ... ${aInserir.length}`)
  if (aInserir.length) console.log(amostra(aInserir))
  console.log(`\nB) INATIVAR — na tabela, ausentes no XLS ... ${aInativar.length}`)
  console.log(`   'alterado' (reaparece com outro horário/profissional/terapia) ... ${alterados.length}`)
  if (alterados.length) console.log(amostra(alterados))
  console.log(`   'excluido' (sumiu da TiTa) ...................................... ${excluidos.length}`)
  if (excluidos.length) console.log(amostra(excluidos))
  console.log(`\nC) PRESERVAR — intocadas .................. ${outros.length}`)

  const saldo = naTabela.length + aInserir.length
  console.log(
    `\nSaldo final da janela: ${saldo} linhas ` +
    `(${agendados.length - aInativar.length} ativas 'Agendado' + ${aInativar.length} inativas + ${outros.length} preservadas + ${aInserir.length} novas)`,
  )

  if (!aplicar) {
    console.log("\nDry-run — nada foi gravado. Confira as amostras acima e use --apply.")
    return
  }

  if (aInserir.length) {
    console.log(`\nInserindo ${aInserir.length} linhas…`)
    for (let i = 0; i < aInserir.length; i += LOTE) {
      await inserirLote(cfg, aInserir.slice(i, i + LOTE))
    }
  }

  if (alterados.length) {
    console.log(`Inativando ${alterados.length} linhas como 'alterado'…`)
    await atualizarPorIds(cfg, alterados.map(r => r.id), { ativo: false, motivo_inativacao: "alterado" })
  }

  if (excluidos.length) {
    console.log(`Inativando ${excluidos.length} linhas como 'excluido'…`)
    await atualizarPorIds(cfg, excluidos.map(r => r.id), { ativo: false, motivo_inativacao: "excluido" })
  }

  console.log("\nPronto.")
}

main().catch(e => { console.error(e); process.exit(1) })
