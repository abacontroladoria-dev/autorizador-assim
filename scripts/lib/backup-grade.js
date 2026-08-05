// Parsing do backup da grade + acesso ao Supabase, compartilhado pelos dois
// scripts do seed do histórico (importar-backup-grade.js e
// reconciliar-grade-sobreposicao.js).
//
// Node puro, sem dependências — mesmo padrão de scripts/check-rls.js.

const fs   = require("fs")
const path = require("path")

const RAIZ      = path.join(__dirname, "..", "..")
const ARQUIVO   = path.join(RAIZ, "backup_agendamentos", "agendamentos_profissionais_20260101_20260831.xls")
const ENV_LOCAL = path.join(RAIZ, "frontend", ".env.local")

// A tabela é 100% unidade_id 280. O backup foi exportado sem filtro de unidade e
// traz também linhas de homologação, que não podem entrar.
const UNIDADE_NOME = "CLÍNICA UNIVERSO ABA"
const UNIDADE_ID   = 280

const TABELA = "csv_grades_profissionais"

// ─── Env ──────────────────────────────────────────────────────────────────────

/**
 * Resolve a conexão. As variáveis de ambiente têm precedência sobre
 * frontend/.env.local, para permitir apontar um script destes ao stack local
 * (`supabase start`) sem editar o arquivo que a aplicação usa:
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... node scripts/...
 *
 * Sem isso o único destino possível é produção, o que é ruim para um script
 * cuja gravação é irreversível depois que o trigger de congelamento sobe.
 */
function lerEnv() {
  let url = process.env.SUPABASE_URL || ""
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  let fonte = "variáveis de ambiente"

  if (!url || !key) {
    if (!fs.existsSync(ENV_LOCAL)) throw new Error(`Não encontrei ${ENV_LOCAL}`)
    const env = {}
    for (const linha of fs.readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      let valor = m[2].trim()
      if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
        valor = valor.slice(1, -1)
      }
      env[m[1]] = valor
    }
    url = url || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || ""
    key = key || env.SUPABASE_SERVICE_ROLE_KEY || ""
    fonte = "frontend/.env.local"
  }

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL ausente (env ou frontend/.env.local)")
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente (env ou frontend/.env.local)")
  return { url: url.replace(/\/+$/, ""), key, fonte }
}

/** Rótulo do destino, para o script poder dizer onde vai escrever antes de escrever. */
function descreverDestino(cfg) {
  const local = /127\.0\.0\.1|localhost/.test(cfg.url)
  const host  = cfg.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  return `${local ? "LOCAL" : "PRODUÇÃO"}  ${host}  (via ${cfg.fonte})`
}

// ─── Parsing do "XLS" ─────────────────────────────────────────────────────────
// O arquivo tem extensão .xls mas é uma tabela HTML (47 MB, UTF-8 válido), do
// tipo que o Excel abre por conveniência. Não usar leitor de planilha.

// Só há uma entidade no arquivo inteiro (&#039;, 1406 ocorrências), mas decodificar
// o caso geral custa nada e evita surpresa se o export mudar.
function decodificarEntidades(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")   // por último, senão desfaz as substituições acima
}

const CELULA_RE = /<td[^>]*>([\s\S]*?)<\/td>/g

function extrairCelulas(bloco) {
  const out = []
  CELULA_RE.lastIndex = 0
  let m
  while ((m = CELULA_RE.exec(bloco)) !== null) {
    out.push(decodificarEntidades(m[1].replace(/<[^>]*>/g, "")).trim())
  }
  return out
}

/** "05/01/2026" → "2026-01-05". Devolve null se não casar o formato. */
function dataParaIso(br) {
  const m = String(br).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** "08:00" ou "08:00:00" → "08:00:00". Mesma normalização de sync-grade-csv. */
function paraHora(s) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:00` : null
}

function paraInt(s) {
  const n = parseInt(String(s || "").replace(/\D/g, ""), 10)
  return Number.isNaN(n) ? null : n
}

// Índices das colunas do backup. A ordem é fixa no export e foi conferida linha a
// linha (123.442 linhas, todas com exatamente 16 células).
const COL = {
  PROF_ID: 0, PROF_NOME: 1, DIA_SEMANA: 2, DATA: 3, HORA_INI: 4, HORA_FIM: 5,
  CRIADO_EM: 6,   // descartado na Fase 1
  CELULAR: 7,     // descartado — PII sem consumidor, e a tabela é legível por qualquer authenticated
  PAC_NOME: 8, PAC_ID: 9,
  CONV_ID: 10,    // descartado na Fase 1 (a API não devolve esse campo)
  CONV_NOME: 11, TERAPIA_ID: 12, TERAPIA_NOME: 13, UNIDADE: 14, SALA: 15,
}

/**
 * Lê o backup e devolve as linhas prontas para inserção, no intervalo [de, ate]
 * (ambos inclusive, ISO). Só linhas da unidade da clínica.
 */
function parsearBackup({ de, ate }) {
  const bruto = fs.readFileSync(ARQUIVO, "utf8")
  const corpo = bruto.slice(bruto.indexOf("<tbody>"))

  const linhas = []
  const stats  = { total: 0, semDezesseisCelulas: 0, outraUnidade: 0, foraDaJanela: 0, dataInvalida: 0 }

  // split em vez de regex global: sobre 47 MB é bem mais rápido e não arrisca
  // backtracking do quantificador lazy.
  for (const bloco of corpo.split("<tr>")) {
    if (!bloco.includes("<td")) continue
    const c = extrairCelulas(bloco)
    stats.total++

    if (c.length !== 16)                 { stats.semDezesseisCelulas++; continue }
    if (c[COL.UNIDADE] !== UNIDADE_NOME) { stats.outraUnidade++;        continue }

    const data = dataParaIso(c[COL.DATA])
    if (!data)                           { stats.dataInvalida++;        continue }
    if ((de && data < de) || (ate && data > ate)) { stats.foraDaJanela++; continue }

    linhas.push({
      tita_agendamento_id:   null,   // o backup não traz o ID do agendamento
      paciente_id:           paraInt(c[COL.PAC_ID]),
      paciente_nome:         c[COL.PAC_NOME] || null,
      data,
      dia_semana:            c[COL.DIA_SEMANA] || null,
      hora_inicial:          paraHora(c[COL.HORA_INI]),
      hora_final:            paraHora(c[COL.HORA_FIM]),
      profissional_id:       paraInt(c[COL.PROF_ID]),
      profissional_nome:     c[COL.PROF_NOME] || null,
      profissional_cpf:      null,   // ausente no backup
      terapia_id:            paraInt(c[COL.TERAPIA_ID]),
      terapia_nome:          c[COL.TERAPIA_NOME] || null,
      terapia_exibicao_id:   null,   // ausente no backup — enriquecimento é Fase 2
      terapia_exibicao_nome: null,
      sala_id:               null,   // ausente no backup (só o nome da sala vem)
      sala_nome:             c[COL.SALA] || null,
      sala_observacoes:      null,
      unidade_id:            UNIDADE_ID,
      unidade_nome:          UNIDADE_NOME,
      convenio_nome:         c[COL.CONV_NOME] || null,
      // O backup não tem coluna de status, e ele só contém agendamentos marcados
      // (nenhum slot livre: 0 linhas com Favorecido vazio). Validado: agosto tem
      // 13.676 linhas no backup e a tabela tinha exatamente 13.676 'Agendado'.
      status_agendamento:    "Agendado",
      ativo:                 true,
      origem:                "backup_xls",
    })
  }

  return { linhas, stats }
}

/**
 * Chave natural usada para casar uma linha do backup com uma linha da tabela.
 * Medida no backup: 13 grupos duplicados em 110.067 linhas (0,01%) — 12 são pares
 * byte-idênticos e 1 difere só pela sala. Por isso os scripts trabalham com
 * CONTAGEM por chave, nunca assumindo unicidade.
 */
function chaveNatural(r) {
  return [r.data, r.hora_inicial, r.profissional_id, r.paciente_id, r.terapia_id].join("|")
}

// ─── PostgREST ────────────────────────────────────────────────────────────────

function cabecalhos({ key }, extra = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra }
}

async function contar(cfg, filtro) {
  const r = await fetch(`${cfg.url}/rest/v1/${TABELA}?select=id&${filtro}`, {
    method: "HEAD",
    headers: cabecalhos(cfg, { Prefer: "count=exact", Range: "0-0" }),
  })
  if (!r.ok && r.status !== 206 && r.status !== 200) {
    throw new Error(`HTTP ${r.status} ao contar: ${(await r.text()).slice(0, 300)}`)
  }
  return Number((r.headers.get("content-range") || "").split("/")[1] || 0)
}

/** Pagina o SELECT inteiro (PostgREST devolve no máximo 1000 linhas por chamada). */
async function selecionarTudo(cfg, campos, filtro, pagina = 1000) {
  const out = []
  for (let de = 0; ; de += pagina) {
    const r = await fetch(`${cfg.url}/rest/v1/${TABELA}?select=${campos}&${filtro}&order=id`, {
      headers: cabecalhos(cfg, { Range: `${de}-${de + pagina - 1}`, "Range-Unit": "items" }),
    })
    if (!r.ok && r.status !== 206) {
      const corpo = await r.text()
      const e = new Error(`HTTP ${r.status} ao selecionar: ${corpo.slice(0, 300)}`)
      // 42703 = undefined_column. Quem chama usa isto para detectar que a migration
      // das colunas novas ainda não foi aplicada e cair num modo degradado.
      if (corpo.includes("42703")) e.colunaInexistente = true
      throw e
    }
    const lote = await r.json()
    out.push(...lote)
    if (lote.length < pagina) return out
  }
}

/**
 * Verifica se as colunas da Fase 1.1 (ativo/motivo_inativacao/origem/visto_em) já
 * existem na tabela. Permite que o dry-run rode antes da migration ser aplicada.
 */
async function schemaFase1Pronto(cfg) {
  const r = await fetch(`${cfg.url}/rest/v1/${TABELA}?select=ativo,origem&limit=1`, {
    headers: cabecalhos(cfg),
  })
  return r.ok
}

async function inserirLote(cfg, lote) {
  const r = await fetch(`${cfg.url}/rest/v1/${TABELA}`, {
    method: "POST",
    headers: cabecalhos(cfg, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(lote),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 400)}`)
}

/** PATCH por lista de ids (in.(...)), em blocos para não estourar a URL. */
async function atualizarPorIds(cfg, ids, patch, bloco = 100) {
  for (let i = 0; i < ids.length; i += bloco) {
    const fatia = ids.slice(i, i + bloco)
    const r = await fetch(`${cfg.url}/rest/v1/${TABELA}?id=in.(${fatia.join(",")})`, {
      method: "PATCH",
      headers: cabecalhos(cfg, { "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status} ao atualizar: ${(await r.text()).slice(0, 400)}`)
  }
}

module.exports = {
  RAIZ, ARQUIVO, TABELA, UNIDADE_ID, UNIDADE_NOME,
  lerEnv, descreverDestino, parsearBackup, chaveNatural,
  contar, selecionarTudo, inserirLote, atualizarPorIds, schemaFase1Pronto,
}
