// Espelha as tabelas do schema public do Cloud para o Postgres local (Docker), via REST
// (service role key), sem precisar da senha do Postgres. Não sincroniza `usuarios` /
// `usuarios_permissoes` para preservar o usuário admin local de dev.
import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync } from "fs"
import { execSync } from "child_process"

function loadEnv(path) {
  const env = {}
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnv("c:/Users/Maquina001/sistema-pulsar/frontend/.env.local.cloud.bak")
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const TABLES = [
  "acomp_conf", "acomp_pac_bundles", "acomp_prof_map", "agenda_orbita", "agenda_terapias",
  "agenda_tita", "agenda_tita_autorizacao_backup_20260508", "audit_logs", "auditoria_glosa_motivos",
  "autorizacoes", "autorizacoes_assim", "backup_fila_null_terapia", "chamada_paciente",
  "config_regras_terapias", "controle_disponibilidade_terapeutas", "controle_terapeutico",
  "crm_inconsistencias", "csv_grades_profissionais", "csv_reposicao_faltas", "fila_autorizacoes",
  "fila_autorizacoes_logs", "grade_profissionais_tita", "guia_terapias", "guias_processadas",
  "logs", "logs_execucao", "maquinas", "paciente_classificacao", "paciente_medico_vigente",
  "perfis", "permissoes", "pre_auditoria_snapshot", "saida_aceites", "sessions",
  "substituicoes_historico", "sync_controle", "sync_status", "terapeuta_eventos", "terapeutas",
  "terapias_controle", "tita_grade_profissionais", "vw_central_pacientes_backup_20260508",
  "worker_tokens",
]

function sqlLit(v) {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "object") return "'" + JSON.stringify(v).replace(/'/g, "''") + "'"
  return "'" + String(v).replace(/'/g, "''") + "'"
}

async function fetchAll(table) {
  let all = []
  const seen = new Set()
  let from = 0
  const pageSize = 1000
  while (true) {
    // Sem ORDER BY explícito, o Postgrest não garante a mesma ordem entre chamadas
    // sucessivas de .range() — isso pode repetir linhas entre páginas e gerar
    // violação de chave duplicada no INSERT local. Como as tabelas synced não têm
    // todas uma coluna "id" (algumas usam outra PK ou nenhuma), dedupe pelo
    // conteúdo da linha em vez de depender de um nome de coluna fixo.
    const { data, error } = await sb.from(table).select("*").range(from, from + pageSize - 1)
    if (error) {
      console.error(`[${table}] erro: ${error.message}`)
      return null
    }
    for (const row of data) {
      const key = JSON.stringify(row)
      if (!seen.has(key)) {
        seen.add(key)
        all.push(row)
      }
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

let totalRows = 0
const skipped = []
// Cada tabela vira sua própria transação: uma tabela com problema (schema divergente,
// FK inesperada, etc.) não deve derrubar a sincronização das demais.
let sql = ""

for (const table of TABLES) {
  const rows = await fetchAll(table)
  if (rows === null) {
    skipped.push(table)
    continue
  }
  sql += `BEGIN;\nSET session_replication_role = replica;\n`
  sql += `DELETE FROM public.${table};\n`
  if (rows.length > 0) {
    const cols = Object.keys(rows[0])
    sql += `INSERT INTO public.${table} (${cols.join(", ")}) VALUES\n`
    sql += rows.map(row => "  (" + cols.map(c => sqlLit(row[c])).join(", ") + ")").join(",\n")
    // ON CONFLICT DO NOTHING: rede de segurança contra linhas duplicadas vindas de
    // paginação (mesmo com .order(), tabelas sem coluna "id" caem de volta na
    // ordenação implícita do Postgres, que também não é garantida).
    sql += "\nON CONFLICT DO NOTHING;\n"
  }
  sql += `SET session_replication_role = DEFAULT;\nCOMMIT;\n`
  console.error(`[${table}] ${rows.length} linhas`)
  totalRows += rows.length
}

const outPath = "c:/Users/Maquina001/sistema-pulsar/supabase/sync_public_from_cloud.sql"
writeFileSync(outPath, sql)
console.error(`\nTotal: ${totalRows} linhas em ${TABLES.length - skipped.length} tabelas.`)
if (skipped.length) console.error(`Puladas (erro): ${skipped.join(", ")}`)
console.error(`Escrito em ${outPath}`)
