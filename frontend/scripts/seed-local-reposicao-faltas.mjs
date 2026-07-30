// Garante que csv_reposicao_faltas esteja populada no Postgres local (Docker) antes do dev subir.
// A tabela é alimentada em produção por uma Edge Function (sync-reposicao-faltas) que não roda
// localmente; aqui apenas recarregamos o snapshot em supabase/seed_csv_reposicao_faltas.sql
// quando a tabela local estiver vazia.
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const seedPath = join(__dirname, "..", "..", "supabase", "seed_csv_reposicao_faltas.sql")
const container = "supabase_db_sistema-pulsar"

function containerRunning() {
  try {
    const out = execSync(`docker inspect -f "{{.State.Running}}" ${container}`, { stdio: ["ignore", "pipe", "ignore"] })
    return out.toString().trim() === "true"
  } catch {
    return false
  }
}

if (!containerRunning()) {
  console.warn(`[seed-local-reposicao-faltas] container ${container} não está rodando, pulando seed.`)
  process.exit(0)
}

const countOut = execSync(
  `docker exec ${container} psql -U postgres -d postgres -tA -c "SELECT count(*) FROM public.csv_reposicao_faltas;"`
).toString().trim()

if (Number(countOut) > 0) {
  console.log(`[seed-local-reposicao-faltas] tabela já populada (${countOut} linhas), nada a fazer.`)
  process.exit(0)
}

if (!existsSync(seedPath)) {
  console.warn(`[seed-local-reposicao-faltas] seed não encontrado em ${seedPath}, pulando.`)
  process.exit(0)
}

console.log("[seed-local-reposicao-faltas] tabela vazia, carregando seed local...")
execSync(`docker exec -i ${container} psql -U postgres -d postgres < "${seedPath}"`, { stdio: "inherit", shell: true })
console.log("[seed-local-reposicao-faltas] seed carregado.")
