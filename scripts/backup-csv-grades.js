#!/usr/bin/env node
// Backup lógico de csv_grades_profissionais antes do deploy da Fase 1.
//
// Gera dois arquivos na raiz do repositório (ambos cobertos pelo .gitignore —
// `backup_*.sql` e `*.json` de dado real não podem ir pro histórico, o repo é
// público e a tabela tem nome de paciente e CPF de profissional):
//
//   backup_csv_grades_profissionais_<ts>.json   fidelidade exata, legível por máquina
//   backup_csv_grades_profissionais_<ts>.sql    restauração pronta para colar
//
//   node scripts/backup-csv-grades.js
//
// Sobre o esquema: se o backup for tirado ANTES das migrations, ele contém as 23
// colunas originais. Restaurando depois das migrations aplicadas, as colunas novas
// assumem os defaults (ativo = true, origem = 'tita_csv', motivo_inativacao e
// visto_em nulos) — que é exatamente o estado original de toda linha. Ou seja, o
// backup serve para restaurar em qualquer um dos dois momentos.

const fs   = require("fs")
const path = require("path")
const { lerEnv, TABELA, RAIZ } = require("./lib/backup-grade")

const PAGINA = 1000

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number")  return Number.isFinite(v) ? String(v) : "NULL"
  if (typeof v === "boolean") return v ? "true" : "false"
  return `'${String(v).replace(/'/g, "''")}'`
}

async function baixarTudo(cfg) {
  const todas = []
  for (let de = 0; ; de += PAGINA) {
    const r = await fetch(`${cfg.url}/rest/v1/${TABELA}?select=*&order=id`, {
      headers: {
        apikey: cfg.key, Authorization: `Bearer ${cfg.key}`,
        Range: `${de}-${de + PAGINA - 1}`, "Range-Unit": "items",
      },
    })
    if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const lote = await r.json()
    todas.push(...lote)
    if (todas.length % 10000 < PAGINA) process.stdout.write(`\r  ${todas.length} linhas…`)
    if (lote.length < PAGINA) { process.stdout.write(`\r  ${todas.length} linhas\n`); return todas }
  }
}

async function main() {
  const cfg = lerEnv()
  const ts  = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "_")

  console.log(`Baixando ${TABELA} de ${cfg.url.replace(/^https:\/\/([^.]{4}).*/, "https://$1***")} …`)
  const linhas = await baixarTudo(cfg)

  if (linhas.length === 0) throw new Error("A tabela voltou vazia — abortando para não gravar um backup falso.")

  const colunas = Object.keys(linhas[0])
  const porMes  = {}
  for (const l of linhas) porMes[String(l.data).slice(0, 7)] = (porMes[String(l.data).slice(0, 7)] || 0) + 1

  const baseNome = `backup_csv_grades_profissionais_${ts}`
  const caminhoJson = path.join(RAIZ, `${baseNome}.json`)
  const caminhoSql  = path.join(RAIZ, `${baseNome}.sql`)

  // ── JSON ────────────────────────────────────────────────────────────────────
  fs.writeFileSync(caminhoJson, JSON.stringify({
    tabela: TABELA,
    gerado_em: new Date().toISOString(),
    total: linhas.length,
    colunas,
    por_mes: porMes,
    linhas,
  }, null, 0), "utf8")

  // ── SQL ─────────────────────────────────────────────────────────────────────
  const out = []
  out.push(`-- Backup lógico de ${TABELA}`)
  out.push(`-- Gerado em ${new Date().toISOString()} — ${linhas.length} linhas, ${colunas.length} colunas`)
  out.push(`-- Distribuição por mês: ${Object.entries(porMes).sort().map(([m, n]) => `${m}=${n}`).join("  ")}`)
  out.push("--")
  out.push("-- COMO RESTAURAR")
  out.push("--")
  out.push("-- Cenário A — reverter só o que a Fase 1 importou (antes do trigger subir).")
  out.push("--   É o caminho normal se o relatório divergir no checkpoint entre os passos 4 e 5.")
  out.push("--   Não precisa deste arquivo:")
  out.push("--")
  out.push("--     DELETE FROM public.csv_grades_profissionais WHERE origem = 'backup_xls';")
  out.push("--     UPDATE public.csv_grades_profissionais")
  out.push("--        SET ativo = true, motivo_inativacao = NULL")
  out.push("--      WHERE motivo_inativacao IN ('alterado','excluido')")
  out.push("--        AND data BETWEEN '2026-07-01' AND '2026-08-04';")
  out.push("--")
  out.push("-- Cenário B — restauração total deste snapshot.")
  out.push("--   Rode a seção 1 (só se o trigger já existir), depois 2 e 3.")
  out.push("--   ATENÇÃO: a seção 2 apaga a tabela inteira. Confira que está no banco certo.")
  out.push("")
  out.push("-- ─── Seção 1: soltar o cadeado (só se a migration 130200 já foi aplicada) ───")
  out.push("-- DROP TRIGGER IF EXISTS trg_congelar_grade_passada ON public.csv_grades_profissionais;")
  out.push("")
  out.push("-- ─── Seção 2: limpar ───")
  out.push("-- BEGIN;")
  out.push("-- DELETE FROM public.csv_grades_profissionais;")
  out.push("")
  out.push("-- ─── Seção 3: recarregar (descomente o bloco inteiro) ───")
  out.push("")

  const listaCols = colunas.map(c => `"${c}"`).join(", ")
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500)
    out.push(`INSERT INTO public.${TABELA} (${listaCols}) VALUES`)
    out.push(lote.map(l => `  (${colunas.map(c => sqlLiteral(l[c])).join(", ")})`).join(",\n") + ";")
    out.push("")
  }

  out.push("-- COMMIT;")
  out.push("")
  out.push("-- ─── Seção 4: recolocar o cadeado, se a seção 1 foi usada ───")
  out.push("-- Reaplique a migration 20260805160200_trigger_congelar_grade_passada.sql.")
  fs.writeFileSync(caminhoSql, out.join("\n"), "utf8")

  const mb = f => (fs.statSync(f).size / 1024 / 1024).toFixed(1)
  console.log(`\nBackup gravado (fora do controle de versão, cobertos pelo .gitignore):`)
  console.log(`  ${path.basename(caminhoJson)}  ${mb(caminhoJson)} MB`)
  console.log(`  ${path.basename(caminhoSql)}  ${mb(caminhoSql)} MB`)
  console.log(`\n  ${linhas.length} linhas · ${colunas.length} colunas`)
  console.log(`  por mês: ${Object.entries(porMes).sort().map(([m, n]) => `${m}=${n}`).join("  ")}`)
}

main().catch(e => { console.error("\n" + e.message); process.exitCode = 1 })
