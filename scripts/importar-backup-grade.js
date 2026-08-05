#!/usr/bin/env node
// Fase 1.2 — Seed do histórico de csv_grades_profissionais a partir do backup XLS.
//
// Contexto: a TiTa apaga agendamentos passados quando o cadastro muda (desligar
// um terapeuta remove retroativamente todos os atendimentos dele). A tabela só
// cobre 2026-07-01 em diante — todo Jan–Jun/2026 nunca foi capturado, e o
// backup exportado da TiTa é a única fonte que ainda descreve esse período.
//
// Regra de autoridade (decisão de produto):
//   data <= 2026-08-04  →  exclusivamente o XLS
//   data >= 2026-08-05  →  exclusivamente a API csv_grade_profissionais
//
// Divisão de trabalho entre os dois scripts do seed — importa não confundir,
// senão a sobreposição entra duas vezes:
//
//   2026-01-01 → 2026-06-30   ESTE script. A tabela não tem NENHUMA linha aqui
//                             (min(data) = 2026-07-01), então é INSERT puro, sem
//                             risco de duplicar nada.
//   2026-07-01 → 2026-08-04   reconciliar-grade-sobreposicao.js. Ali as duas
//                             fontes coexistem: é preciso inserir só o que falta
//                             e inativar o que a TiTa removeu.
//   2026-08-05 → …            ninguém: é a API que manda.
//
// Precisa rodar ANTES da migration do trigger (20260805130200): ela bloqueia
// UPDATE/DELETE em data passada, e a reconciliação seguinte precisa de UPDATE.
// (INSERT em data passada continua permitido mesmo depois do trigger.)
//
// Uso:
//   node scripts/importar-backup-grade.js              # dry-run (não escreve nada)
//   node scripts/importar-backup-grade.js --apply      # grava
//   node scripts/importar-backup-grade.js --apply --resume-from=57

const path = require("path")
const {
  RAIZ, ARQUIVO, lerEnv, parsearBackup, contar, inserirLote,
} = require("./lib/backup-grade")

// Limite deste script: até onde a tabela está comprovadamente vazia.
const DATA_LIMITE = "2026-06-30"

const LOTE = 500

// Contagens medidas no arquivo — servem de go/no-go antes de gravar.
const ESPERADO_POR_MES = {
  "2026-01": 14361, "2026-02": 16461, "2026-03": 17878,
  "2026-04": 16623, "2026-05": 13867, "2026-06": 14607,
}
const ESPERADO_TOTAL = 93797

async function main() {
  const args      = process.argv.slice(2)
  const aplicar   = args.includes("--apply")
  const forcar    = args.includes("--force")
  const resumeArg = args.find(a => a.startsWith("--resume-from="))
  const resumeDe  = resumeArg ? Number(resumeArg.split("=")[1]) : 0

  console.log(`Lendo ${path.relative(RAIZ, ARQUIVO)} …`)
  const t0 = Date.now()
  const { linhas, stats } = parsearBackup({ ate: DATA_LIMITE })
  console.log(`Parseado em ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

  console.log("Descartes:")
  console.log(`  linhas <tr> lidas ........ ${stats.total}`)
  console.log(`  fora da unidade .......... ${stats.outraUnidade}  (homologação / vazias)`)
  console.log(`  data > ${DATA_LIMITE} ........ ${stats.foraDaJanela}  (sobreposição + janela da API)`)
  console.log(`  sem 16 células ........... ${stats.semDezesseisCelulas}`)
  console.log(`  data inválida ............ ${stats.dataInvalida}`)

  const porMes = {}
  for (const l of linhas) porMes[l.data.slice(0, 7)] = (porMes[l.data.slice(0, 7)] || 0) + 1

  console.log("\nA importar, por mês (esperado entre parênteses):")
  let divergiu = false
  for (const mes of Object.keys(ESPERADO_POR_MES)) {
    const obtido = porMes[mes] || 0
    const esp    = ESPERADO_POR_MES[mes]
    if (obtido !== esp) divergiu = true
    console.log(`  ${mes} .... ${String(obtido).padStart(6)}  (${esp})  ${obtido === esp ? "ok" : "<<< DIVERGE"}`)
  }
  const inesperados = Object.keys(porMes).filter(m => !(m in ESPERADO_POR_MES))
  if (inesperados.length) {
    divergiu = true
    console.log(`  meses inesperados: ${inesperados.join(", ")} <<< DIVERGE`)
  }
  if (linhas.length !== ESPERADO_TOTAL) divergiu = true
  console.log(`  TOTAL ... ${String(linhas.length).padStart(6)}  (${ESPERADO_TOTAL})  ${linhas.length === ESPERADO_TOTAL ? "ok" : "<<< DIVERGE"}`)

  const nulos = k => linhas.filter(l => l[k] === null || l[k] === undefined).length
  console.log(
    `\nNulos na chave natural: data=${nulos("data")} hora=${nulos("hora_inicial")} ` +
    `prof=${nulos("profissional_id")} pac=${nulos("paciente_id")} terapia=${nulos("terapia_id")}`,
  )

  if (divergiu) {
    console.log("\n⚠  As contagens não batem com o esperado. Confira o arquivo antes de gravar.")
    if (aplicar && !forcar) {
      console.error("Abortando (use --force para gravar mesmo assim).")
      process.exit(1)
    }
  }

  if (!aplicar) {
    console.log("\nDry-run — nada foi gravado. Use --apply para importar.")
    return
  }

  const cfg = lerEnv()

  // Guarda de idempotência: sem isto, rodar duas vezes duplicaria 93.797 linhas
  // de histórico — e o trigger de congelamento impede apagá-las depois.
  const jaImportado = await contar(cfg, `origem=eq.backup_xls&data=lte.${DATA_LIMITE}`)
  if (jaImportado > 0 && resumeDe === 0 && !forcar) {
    console.error(
      `\nAbortando: já existem ${jaImportado} linhas com origem='backup_xls' até ${DATA_LIMITE}.\n` +
      `Rodar de novo duplicaria o histórico. Use --resume-from=N para continuar uma\n` +
      `importação interrompida, ou --force se souber o que está fazendo.`,
    )
    process.exit(1)
  }

  // Segunda guarda: a janela tem de estar realmente vazia. Se a tabela já tiver
  // qualquer linha aqui (de qualquer origem), a premissa do INSERT puro caiu.
  const jaExistiam = await contar(cfg, `data=lte.${DATA_LIMITE}`)
  if (jaExistiam > 0 && resumeDe === 0 && !forcar) {
    console.error(
      `\nAbortando: a tabela já tem ${jaExistiam} linhas com data <= ${DATA_LIMITE}.\n` +
      `Este script assume a janela vazia (min(data) era 2026-07-01). Investigue antes.`,
    )
    process.exit(1)
  }

  const totalLotes = Math.ceil(linhas.length / LOTE)
  console.log(`\nGravando ${linhas.length} linhas em ${totalLotes} lotes de ${LOTE}…`)

  for (let i = resumeDe; i < totalLotes; i++) {
    const lote = linhas.slice(i * LOTE, (i + 1) * LOTE)
    try {
      await inserirLote(cfg, lote)
    } catch (e) {
      console.error(`\nFalhou no lote ${i} (linhas ${i * LOTE}–${i * LOTE + lote.length - 1}): ${e.message}`)
      console.error(`Para retomar daqui: node scripts/importar-backup-grade.js --apply --resume-from=${i}`)
      process.exit(1)
    }
    if ((i + 1) % 20 === 0 || i === totalLotes - 1) console.log(`  ${i + 1}/${totalLotes} lotes`)
  }

  console.log(`\nPronto. Linhas backup_xls até ${DATA_LIMITE}: ${await contar(cfg, `origem=eq.backup_xls&data=lte.${DATA_LIMITE}`)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
