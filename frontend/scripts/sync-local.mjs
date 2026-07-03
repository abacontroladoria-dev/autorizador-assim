// Comando único para sincronizar o mirror Docker local com a nuvem:
// 1. Gera o SQL de sync (sync-cloud-to-local.mjs).
// 2. Aplica o SQL no Postgres local (Docker).
// 3. Imprime um resumo (linhas por tabela) para confirmar visualmente que sincronizou.
//
// Qualquer investigação via SQL local (psql/docker exec) deve começar rodando este
// comando — o mirror só reflete a nuvem no momento em que ele roda.
import { execSync, execFileSync } from "child_process"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const container = "supabase_db_sistema-pulsar"
const sqlPath = "c:/Users/Maquina001/sistema-pulsar/supabase/sync_public_from_cloud.sql"

function containerRunning() {
  try {
    const out = execSync(`docker inspect -f "{{.State.Running}}" ${container}`, { stdio: ["ignore", "pipe", "ignore"] })
    return out.toString().trim() === "true"
  } catch {
    return false
  }
}

if (!containerRunning()) {
  console.error(`[sync-local] container ${container} não está rodando. Suba o Supabase local (supabase start) antes de sincronizar.`)
  process.exit(1)
}

console.log("[sync-local] 1/3 gerando SQL a partir da nuvem...")
execFileSync("node", [join(__dirname, "sync-cloud-to-local.mjs")], { stdio: "inherit" })

console.log("[sync-local] 2/3 aplicando SQL no Postgres local...")
// Sem ON_ERROR_STOP: cada tabela roda em sua própria transação (BEGIN..COMMIT), então
// um erro isolado numa tabela só aborta aquela transação — o psql segue para o BEGIN
// da próxima tabela em vez de parar a sincronização inteira.
execSync(`docker exec -i ${container} psql -U postgres -d postgres < "${sqlPath}"`, {
  stdio: "inherit",
  shell: true,
})

console.log("[sync-local] 3/3 resumo (linhas por tabela no mirror local):")
const countsSql = `
select relname as tabela, n_live_tup as linhas
from pg_stat_user_tables
where schemaname = 'public'
order by relname;
`
execSync(`docker exec -i ${container} psql -U postgres -d postgres -c "${countsSql.replace(/\n/g, " ")}"`, {
  stdio: "inherit",
  shell: true,
})

console.log("[sync-local] concluído.")
