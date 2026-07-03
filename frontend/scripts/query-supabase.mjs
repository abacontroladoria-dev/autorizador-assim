// Consulta ad-hoc de tabelas/views no Supabase, usando as credenciais de .env.local.
// Uso: node scripts/query-supabase.mjs <tabela_ou_view> [limite]
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv(path) {
  const env = {}
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnv(join(__dirname, "..", ".env.local"))
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_KEY

if (!url || !key) {
  console.error("URL ou chave do Supabase não encontrada em .env.local")
  process.exit(1)
}

const [, , tabela, limiteArg] = process.argv
if (!tabela) {
  console.error("Uso: node scripts/query-supabase.mjs <tabela_ou_view> [limite]")
  process.exit(1)
}
const limite = Number(limiteArg) || 20

const sb = createClient(url, key)
const { data, error } = await sb.from(tabela).select("*").limit(limite)

if (error) {
  console.error("Erro:", error.message)
  process.exit(1)
}

console.log(JSON.stringify(data, null, 2))
