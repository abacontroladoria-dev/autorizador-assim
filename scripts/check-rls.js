#!/usr/bin/env node
// Varre supabase/migrations/*.sql e falha se alguma tabela criada (CREATE
// TABLE) nunca recebe um ENABLE ROW LEVEL SECURITY em nenhuma migration.
//
// Motivação: em 2026-07-23 encontramos 5 tabelas com RLS habilitado mas com
// policy `using (true)` liberando qualquer authenticated — nesse caso o RLS
// existia, só a policy era permissiva demais, o que este script NÃO detecta
// (isso exige revisão humana/security-review). O que este script pega é o
// caso mais grave: uma tabela nova sem NENHUM `enable row level security`,
// o que deixaria os dados completamente sem RLS (leitura/escrita liberada
// por padrão do Postgres pra quem tiver a service key, e sem proteção
// nenhuma se alguém trocar o client pra usar a anon key direto).
//
// Não é um parser de SQL completo — é uma varredura por regex, suficiente
// pra pegar o padrão usado neste projeto (migrations de arquivo único por
// mudança, uma instrução por linha/statement).

const fs = require("fs")
const path = require("path")

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations")

// Tabelas que sabidamente não precisam de RLS (schemas gerenciados pela
// Supabase, tabelas de sistema, views materializadas sem dado sensível
// direto). Adicione aqui com um comentário explicando o motivo.
const IGNORE_TABLES = new Set([
  "public.spatial_ref_sys", // extensão postgis, se existir
])

function normalizeTableName(schema, table) {
  const s = (schema || "public").replace(/"/g, "").toLowerCase()
  const t = table.replace(/"/g, "").toLowerCase()
  return `${s}.${t}`
}

function scan() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort()

  const created = new Map() // table -> primeira migration onde foi criada
  const rlsEnabled = new Set()
  const dropped = new Set()

  // Nome qualificado aceitando as 3 formas usadas nas migrations:
  // schema.tabela / "schema"."tabela" / tabela (sem schema, sem aspas ou com aspas)
  const QUALIFIED_NAME = `(?:"?(\\w+)"?\\.)?"?(\\w+)"?`
  const createRe = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED_NAME}\\s*\\(`, "gi")
  const rlsRe = new RegExp(`alter\\s+table\\s+(?:only\\s+)?${QUALIFIED_NAME}\\s+enable\\s+row\\s+level\\s+security`, "gi")
  const dropRe = new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?${QUALIFIED_NAME}`, "gi")

  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")

    for (const m of content.matchAll(createRe)) {
      const name = normalizeTableName(m[1], m[2])
      if (!created.has(name)) created.set(name, file)
    }
    for (const m of content.matchAll(rlsRe)) {
      rlsEnabled.add(normalizeTableName(m[1], m[2]))
    }
    for (const m of content.matchAll(dropRe)) {
      dropped.add(normalizeTableName(m[1], m[2]))
    }
  }

  const missing = []
  for (const [table, file] of created.entries()) {
    if (IGNORE_TABLES.has(table)) continue
    if (dropped.has(table)) continue
    if (!rlsEnabled.has(table)) missing.push({ table, file })
  }

  return missing
}

const missing = scan()

if (missing.length > 0) {
  console.error("\n❌ Tabelas criadas sem 'enable row level security' em nenhuma migration:\n")
  for (const { table, file } of missing) {
    console.error(`  - ${table}  (criada em ${file})`)
  }
  console.error(
    "\nSe a tabela realmente não precisa de RLS (ex: tabela de sistema), " +
    "adicione-a em IGNORE_TABLES no topo de scripts/check-rls.js com um " +
    "comentário explicando o motivo. Caso contrário, adicione " +
    "`alter table ... enable row level security;` numa migration.\n"
  )
  process.exit(1)
} else {
  console.log("✅ Todas as tabelas criadas nas migrations têm RLS habilitado.")
  process.exit(0)
}
