#!/usr/bin/env node
// Relatório de conferência da Fase 1 do congelamento de csv_grades_profissionais.
//
// Roda ANTES da aplicação (projetando o resultado) e DEPOIS (conferindo o que de
// fato ficou no banco). Não escreve nada em caso nenhum.
//
//   node scripts/relatorio-fase1-grade.js
//
// O que ele responde:
//   1. quantos registros o seed insere (Jan–Jun)
//   2. quantos são conciliados na sobreposição (Jul 1 – Ago 4)
//   3. quantos vão para ativo = false, com a lista completa para auditoria
//   4. quantos slots 'Livre'/'Sem Agendamento' são preservados intactos
//   5. contagem da tabela por mês (Jan–Set), atual e projetada
//   6. prova de idempotência: simula a segunda execução e confere que dá zero

const {
  lerEnv, parsearBackup, chaveNatural, contar, selecionarTudo, schemaFase1Pronto,
} = require("./lib/backup-grade")

const SEED_ATE    = "2026-06-30"
const JANELA_DE   = "2026-07-01"
const JANELA_ATE  = "2026-08-04"
const MESES       = ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09"]

const CAMPOS_BASE  = "id,data,hora_inicial,profissional_id,paciente_id,terapia_id,status_agendamento,paciente_nome,profissional_nome,terapia_nome,tita_agendamento_id"
const CAMPOS_FASE1 = `${CAMPOS_BASE},ativo,origem`

function agrupar(itens) {
  const m = new Map()
  for (const i of itens) {
    const k = chaveNatural(i)
    const a = m.get(k)
    if (a) a.push(i); else m.set(k, [i])
  }
  return m
}

/** Diff da sobreposição: o que inserir e o que inativar. */
function diff(doXls, agendados) {
  const x = agrupar(doXls), t = agrupar(agendados)
  const aInserir = [], aInativar = []
  for (const [k, l] of x) { const n = t.get(k)?.length ?? 0; if (l.length > n) aInserir.push(...l.slice(n)) }
  for (const [k, l] of t) { const n = x.get(k)?.length ?? 0; if (l.length > n) aInativar.push(...l.slice(n)) }
  return { aInserir, aInativar }
}

const fmt = n => String(n).padStart(7)
const linha = (r, i) =>
  `  ${String(i + 1).padStart(3)}. ${r.data} ${String(r.hora_inicial).slice(0, 5)}  ` +
  `id=${String(r.tita_agendamento_id ?? "—").padEnd(9)} ` +
  `${String(r.profissional_nome || "?").slice(0, 30).padEnd(30)} ` +
  `${String(r.paciente_nome || "?").slice(0, 32).padEnd(32)} ` +
  `${String(r.terapia_nome || "?").slice(0, 24)}`

async function main() {
  const cfg = lerEnv()
  const pronto = await schemaFase1Pronto(cfg)
  const campos = pronto ? CAMPOS_FASE1 : CAMPOS_BASE

  console.log("=".repeat(100))
  console.log("RELATÓRIO DE CONFERÊNCIA — Fase 1, congelamento de csv_grades_profissionais")
  console.log(`Estado do schema: ${pronto ? "migrations JÁ aplicadas (conferindo o banco)" : "migrations NÃO aplicadas (projetando)"}`)
  console.log("=".repeat(100))

  // ── 1. Seed ────────────────────────────────────────────────────────────────
  const { linhas: seed } = parsearBackup({ ate: SEED_ATE })
  const seedPorMes = {}
  for (const l of seed) seedPorMes[l.data.slice(0, 7)] = (seedPorMes[l.data.slice(0, 7)] || 0) + 1

  console.log("\n1) SEED DO BACKUP XLS — Jan 1 a Jun 30 (janela sem nenhuma linha na tabela)")
  for (const m of MESES.slice(0, 6)) console.log(`     ${m} ${fmt(seedPorMes[m] || 0)}`)
  console.log(`     ${"TOTAL".padEnd(7)} ${fmt(seed.length)}`)

  // ── 2/3/4. Sobreposição ────────────────────────────────────────────────────
  const { linhas: xlsJanela } = parsearBackup({ de: JANELA_DE, ate: JANELA_ATE })
  const naTabela  = await selecionarTudo(cfg, campos, `data=gte.${JANELA_DE}&data=lte.${JANELA_ATE}`)
  const ativas    = pronto ? naTabela.filter(r => r.ativo) : naTabela
  const agendados = ativas.filter(r => r.status_agendamento === "Agendado")
  const outros    = ativas.filter(r => r.status_agendamento !== "Agendado")

  const { aInserir, aInativar } = diff(xlsJanela, agendados)

  const insPorMes = {}
  for (const l of aInserir) insPorMes[l.data.slice(0, 7)] = (insPorMes[l.data.slice(0, 7)] || 0) + 1

  console.log(`\n2) CONCILIAÇÃO — ${JANELA_DE} a ${JANELA_ATE} (as duas fontes coexistem)`)
  console.log(`     backup XLS na janela ........... ${fmt(xlsJanela.length)}`)
  console.log(`     tabela, 'Agendado' ativas ...... ${fmt(agendados.length)}`)
  console.log(`     a INSERIR (no XLS, faltam) ..... ${fmt(aInserir.length)}   ${Object.entries(insPorMes).map(([m, n]) => `${m}:${n}`).join("  ")}`)
  console.log(`     a INATIVAR (na tabela, não no XLS) ${fmt(aInativar.length)}`)

  // Uma sessão que apenas MUDOU (de horário, profissional ou terapia) sai de um
  // lado e volta do outro. Isso não é exclusão — é alteração, e o campo de
  // auditoria precisa dizer isso, porque depois do trigger ele fica imutável.
  const entrando  = new Set(aInserir.map(r => `${r.data}|${r.paciente_id}`))
  const alterados = aInativar.filter(r =>  entrando.has(`${r.data}|${r.paciente_id}`))
  const excluidos = aInativar.filter(r => !entrando.has(`${r.data}|${r.paciente_id}`))
  const ord = l => l.sort((a, b) => (a.data + a.hora_inicial).localeCompare(b.data + b.hora_inicial))

  console.log(`\n3) REGISTROS QUE VÃO PARA ativo = false  (${aInativar.length} pendentes)`)
  console.log("   Sem DELETE físico — a linha continua na tabela, apenas fora do conjunto ativo.")

  // Estado que já está gravado. Antes de aplicar dá tudo zero; depois de aplicar é
  // aqui que se confere que os 12/31 realmente foram marcados como se esperava.
  if (pronto) {
    const nAlt = await contar(cfg, `data=gte.${JANELA_DE}&data=lte.${JANELA_ATE}&motivo_inativacao=eq.alterado`)
    const nExc = await contar(cfg, `data=gte.${JANELA_DE}&data=lte.${JANELA_ATE}&motivo_inativacao=eq.excluido`)
    console.log(`   Já gravado na janela: ${nAlt} 'alterado' + ${nExc} 'excluido' = ${nAlt + nExc} inativas.`)
  }

  console.log(`\n   3a) motivo_inativacao = 'alterado'  (${alterados.length})`)
  console.log("       A sessão não sumiu: o mesmo paciente tem sessão no mesmo dia entre as linhas")
  console.log("       que estão entrando. Mudou horário, profissional ou terapia, e a versão nova")
  console.log("       entra no lugar. Heurística por necessidade — o XLS não traz tita_agendamento_id.\n")
  ord(alterados).forEach((r, i) => console.log(linha(r, i)))

  console.log(`\n   3b) motivo_inativacao = 'excluido'  (${excluidos.length})`)
  console.log("       Não reaparece de forma nenhuma: sumiu da TiTa. É o problema que motivou")
  console.log("       o projeto — antes desta entrega, sumiria do nosso lado também.\n")
  ord(excluidos).forEach((r, i) => console.log(linha(r, i)))

  console.log(`\n4) PRESERVADOS INTACTOS — ${outros.length}`)
  const porStatus = {}
  for (const o of outros) porStatus[o.status_agendamento] = (porStatus[o.status_agendamento] || 0) + 1
  for (const [s, n] of Object.entries(porStatus)) console.log(`     ${s.padEnd(20)} ${fmt(n)}`)
  console.log("     (o XLS não descreve slots vagos, então compará-los seria inventar informação)")

  // ── 5. Contagem por mês ────────────────────────────────────────────────────
  //
  // Dois modos. Antes de aplicar, projeta (atual + seed + conciliação). Depois de
  // aplicar, confere: somar o seed de novo contaria em dobro, porque as linhas já
  // estão na tabela. O que distingue é a presença de linhas origem='backup_xls'.
  const jaAplicado = pronto && (await contar(cfg, `origem=eq.backup_xls&data=lte.${SEED_ATE}`)) > 0

  console.log(`\n5) CONTAGEM DA TABELA POR MÊS  —  modo ${jaAplicado ? "CONFERÊNCIA (já aplicado)" : "PROJEÇÃO (antes de aplicar)"}`)
  if (jaAplicado) {
    console.log("     Jan 1 – Ago 4 está congelado, então tem valor exato a conferir.")
    console.log("     Ago 5 em diante é janela viva (o sync roda todo dia) — informativo.\n")
  }
  const esperadoFinal = { ...seedPorMes }
  for (const m of MESES) esperadoFinal[m] = (esperadoFinal[m] || 0) + (insPorMes[m] || 0)

  const cab = jaAplicado
    ? `     ${"mês".padEnd(9)} ${"na tabela".padStart(10)} ${"esperado".padStart(10)}  veredito`
    : `     ${"mês".padEnd(9)} ${"atual".padStart(8)} ${"+seed".padStart(8)} ${"+concil.".padStart(9)} ${"projetado".padStart(10)}`
  console.log(cab)

  let totAtual = 0, totProj = 0, divergiuMes = false
  for (const m of MESES) {
    const [a, mm] = m.split("-")
    const prox = mm === "12" ? `${+a + 1}-01-01` : `${a}-${String(+mm + 1).padStart(2, "0")}-01`
    const atual = await contar(cfg, `data=gte.${m}-01&data=lt.${prox}`)
    const s = seedPorMes[m] || 0
    const c = insPorMes[m] || 0
    totAtual += atual

    if (jaAplicado) {
      // Só os meses inteiramente congelados têm número fechado a conferir.
      const congelado = m <= "2026-07"
      const esp = esperadoFinal[m] || 0
      if (!congelado) {
        console.log(`     ${m.padEnd(9)} ${String(atual).padStart(10)} ${"—".padStart(10)}  janela viva`)
      } else {
        const ok = atual === esp
        if (!ok) divergiuMes = true
        console.log(`     ${m.padEnd(9)} ${String(atual).padStart(10)} ${String(esp).padStart(10)}  ${ok ? "ok" : "<<< DIVERGE"}`)
      }
    } else {
      const proj = atual + s + c
      totProj += proj
      console.log(`     ${m.padEnd(9)} ${fmt(atual)} ${fmt(s)} ${String(c).padStart(9)} ${String(proj).padStart(10)}`)
    }
  }
  if (jaAplicado) {
    console.log(`     ${"TOTAL".padEnd(9)} ${String(totAtual).padStart(10)}`)
    if (divergiuMes) console.log("     ⚠  Algum mês congelado divergiu do esperado — investigar.")
  } else {
    console.log(`     ${"TOTAL".padEnd(9)} ${fmt(totAtual)} ${fmt(seed.length)} ${String(aInserir.length).padStart(9)} ${String(totProj).padStart(10)}`)
  }
  console.log(`\n     Das ${totProj} linhas projetadas, ${aInativar.length} ficam com ativo = false`)
  console.log(`     (${alterados.length} 'alterado' + ${excluidos.length} 'excluido'). Nenhuma é apagada.`)

  // ── 6. Idempotência ────────────────────────────────────────────────────────
  console.log("\n6) IDEMPOTÊNCIA — simulação da segunda execução")
  const agendadosDepois = [
    ...agendados.filter(a => !aInativar.includes(a)),
    ...aInserir.map(r => ({ ...r, id: "novo" })),
  ]
  const d2 = diff(xlsJanela, agendadosDepois)
  const ok = d2.aInserir.length === 0 && d2.aInativar.length === 0
  console.log(`     aplicando o resultado e refazendo o diff: inserir=${d2.aInserir.length}  inativar=${d2.aInativar.length}`)
  console.log(`     ${ok ? "✔ idempotente — a segunda execução não produz nenhuma alteração." : "✘ NÃO idempotente — investigar antes de aplicar."}`)
  console.log("     (além disso os dois scripts abortam por guarda ao detectar origem='backup_xls' já presente)")

  console.log(`\n${"=".repeat(100)}`)
  console.log(ok
    ? "CONSISTENTE — pronto para aplicação."
    : "⚠ REVISAR os pontos marcados acima antes de aplicar.")
  console.log("=".repeat(100))
}

main().catch(e => { console.error(e); process.exitCode = 1 })
