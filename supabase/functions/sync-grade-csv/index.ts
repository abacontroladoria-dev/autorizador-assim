// Sincroniza csv_grades_profissionais a partir da API csv_grade_profissionais da
// TiTa. Dois modos, dois crons, duas responsabilidades que não se misturam:
//
//   modo "grade"    (padrão)  hoje → fim do mês seguinte, em fatias de 1 semana.
//                             Cuida da IDENTIDADE da sessão: insere o que é novo,
//                             versiona o que mudou, inativa o que sumiu.
//                             Cron sync-grade-csv-daily, 02:00 BRT.
//
//   modo "execucao"           hoje-45 → hoje, em fatias de 1 semana.
//                             Cuida do que se SABE sobre a sessão: status real e
//                             evolução. Só faz UPDATE das colunas de execução, em
//                             linha que já existe. Nunca insere, nunca inativa.
//                             Cron sync-grade-execucao-daily, 04:00 BRT.
//
// ─── Por que isto NÃO faz DELETE ──────────────────────────────────────────────
//
// Até 2026-08-05 esta function fazia DELETE do período + INSERT do que a TiTa
// devolvesse. O problema: a TiTa apaga agendamentos passados quando o cadastro
// muda — desligar um terapeuta remove retroativamente todos os atendimentos que
// ele já fez. Com DELETE+INSERT, bastava uma releitura de data passada para o
// histórico sumir do nosso lado também.
//
// Agora:
//   • a janela do modo "grade" nunca começa antes de hoje;
//   • não existe DELETE em caminho nenhum — sessão que a TiTa deixou de devolver
//     vira ativo = false, motivo_inativacao = 'excluido';
//   • sessão cujo conteúdo mudou não é sobrescrita: a versão antiga vira
//     ativo = false, motivo_inativacao = 'alterado', e a nova entra como linha
//     nova. Mesmo versionamento de agenda_tita (20260530000000).
//
// Além disso, o trigger trg_congelar_grade_passada (20260806100100) rejeita, em
// linha cuja data já passou, qualquer UPDATE que toque a identidade — e todo
// DELETE. Mesmo que algo aqui regrida, o banco não deixa o passado ser reescrito.
//
// ─── Por que o modo "execucao" existe ─────────────────────────────────────────
//
// A informação que decide o pagamento chega DEPOIS da sessão. Medido em junho de
// 2026 (7.981 evoluções): 75,8% no mesmo dia, p95 = 6 dias, p99 = 12, máximo 41.
// Uma janela de 45 dias cobriu 100% da cauda observada; 10 dias teriam perdido
// ~141 evoluções por mês. Como a linha já congelou quando a evolução nasce, o
// trigger precisou passar a distinguir identidade de execução — e é por isso que
// esta passada só pode escrever no segundo grupo.
//
// ─── Custo de escrita ─────────────────────────────────────────────────────────
//
// Nos dois modos, linha cujo conteúdo não mudou não gera escrita nenhuma — nem um
// UPDATE de carimbo. Isso é deliberado: esta tabela já apareceu no diagnóstico de
// Disk IO do projeto, e reescrever ~14 mil linhas por dia só para reconfirmar os
// mesmos valores geraria WAL à toa.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN                = Deno.env.get("TITA_TOKEN")!

const UNIDADE = 280
const PAGINA  = 1000
const LOTE    = 500

/** Janela retroativa padrão do modo "execucao". Ver nota sobre o atraso medido. */
const DIAS_RECAPTURA = 45

type Modo = "grade" | "execucao"

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://127.0.0.1:3000",
  "https://orbitaautomacao.com.br",
]

function getCorsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
  return allowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      }
    : { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
}

function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  })
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (c === "," && !inQuotes) {
      result.push(current.trim()); current = ""
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

function toInt(s: string): number | null {
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

function toTime(s: string): string | null {
  if (!s) return null
  // "08:00" ou "08:00:00"
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:00` : null
}

/**
 * Normaliza a data para ISO (YYYY-MM-DD).
 *
 * A versão anterior desta function gravava o valor cru do CSV direto na coluna
 * `date` e deixava o Postgres interpretar — funcionava, mas aqui a data passou a
 * ser COMPARADA em JavaScript (no recorte da janela e no diff contra o banco), e
 * comparação de string só é válida em ISO. Se a TiTa mudasse para dd/mm/aaaa,
 * sem esta normalização toda linha pareceria alterada e o sync inativaria e
 * reinseriria a grade inteira todos os dias. Aceita os dois formatos de
 * propósito, para não depender do que a API devolve hoje.
 */
function toDate(s: string): string | null {
  const t = (s || "").trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const br = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
  // Formato desconhecido: devolve null em vez de arriscar gravar lixo numa
  // coluna date — a linha é descartada pelo filtro de janela e aparece na
  // contagem de descartados.
  return null
}

/**
 * Normaliza instante para ISO com fuso.
 *
 * A TiTa manda "2026-06-08 08:37:17" — horário de São Paulo, sem fuso declarado.
 * Sem anexar o offset, o Postgres interpretaria como UTC e toda tratativa
 * apareceria 3 horas adiantada. O -03:00 é constante: o Brasil não observa
 * horário de verão desde 2019.
 *
 * Aceita dd/mm/aaaa também, pela mesma razão defensiva de toDate(). Foi um
 * regex ancorado demais que fez o CCO gravar NULL em 2.862 de 2.862 tratativas
 * (cco-shared/logger.ts trata só `^\d{4}-\d{2}-\d{2}$`, e a hora no fim derruba
 * o casamento) — o erro custou dois meses de dado perdido, não vale repetir.
 */
function toTimestamp(s: string): string | null {
  const t = (s || "").trim()
  if (!t) return null

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (iso) {
    const [, a, m, d, hh, mm, ss] = iso
    return `${a}-${m}-${d}T${(hh ?? "00").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}-03:00`
  }

  const br = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (br) {
    const [, d, m, a, hh, mm, ss] = br
    return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${(hh ?? "00").padStart(2, "0")}:${mm ?? "00"}:${ss ?? "00"}-03:00`
  }

  return null
}

/** "Sim"/"Não" da TiTa. Vazio vira null — "não capturado" não é "não evoluiu". */
function toBool(s: string): boolean | null {
  const t = (s || "").trim().toLowerCase()
  if (!t) return null
  if (["sim", "s", "1", "true"].includes(t)) return true
  if (["não", "nao", "n", "0", "false"].includes(t)) return false
  return null
}

// ─── Janela ───────────────────────────────────────────────────────────────────

/** Data corrente em São Paulo — mesma referência do trigger de congelamento. */
function hojeSP(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
    .toISOString().slice(0, 10)
}

function fimPadrao(): string {
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  return new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0).toISOString().slice(0, 10)
}

function diasAntes(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10)
}

/**
 * Resolve a janela a sincronizar. Os dois modos têm limites opostos, e é isso
 * que os mantém sem se atropelar:
 *
 *   grade    — piso em hoje. Data passada é território congelado: mesmo que
 *              alguém peça explicitamente, não buscamos nem escrevemos lá.
 *              Devolve null se a janela pedida for inteiramente passada.
 *
 *   execucao — teto em hoje. O futuro não tem execução para registrar, e as
 *              linhas futuras já nascem com essas colunas preenchidas pelo modo
 *              grade. Devolve null se a janela pedida for inteiramente futura.
 */
function resolverJanela(body: { data_inicio?: string; data_fim?: string }, modo: Modo) {
  const hoje = hojeSP()

  if (modo === "execucao") {
    const pedido = body.data_inicio && body.data_fim
      ? { inicio: body.data_inicio, fim: body.data_fim }
      : { inicio: diasAntes(hoje, DIAS_RECAPTURA), fim: hoje }

    if (pedido.inicio > hoje) return null
    return { inicio: pedido.inicio, fim: pedido.fim > hoje ? hoje : pedido.fim, hoje }
  }

  const pedido = body.data_inicio && body.data_fim
    ? { inicio: body.data_inicio, fim: body.data_fim }
    : { inicio: hoje, fim: fimPadrao() }

  if (pedido.fim < hoje) return null
  return { inicio: pedido.inicio < hoje ? hoje : pedido.inicio, fim: pedido.fim, hoje }
}

// ─── Registro ─────────────────────────────────────────────────────────────────

/** Identidade da sessão: quem, quando, com quem, onde. Congelada no passado. */
interface Linha {
  tita_agendamento_id:   number | null
  paciente_id:           number | null
  paciente_nome:         string | null
  data:                  string | null
  dia_semana:            string | null
  hora_inicial:          string | null
  hora_final:            string | null
  profissional_id:       number | null
  profissional_nome:     string | null
  profissional_cpf:      string | null
  terapia_id:            number | null
  terapia_nome:          string | null
  terapia_exibicao_id:   number | null
  terapia_exibicao_nome: string | null
  sala_id:               number | null
  sala_nome:             string | null
  sala_observacoes:      string | null
  unidade_id:            number | null
  unidade_nome:          string | null
  convenio_nome:         string | null
  status_agendamento:    string | null
}

/** O que se sabe sobre a execução. Pode avançar mesmo em linha já congelada. */
interface Execucao {
  status_execucao:             string | null
  justificativa:               string | null
  possui_tratativa:            boolean | null
  tratativa_profissional_id:   number | null
  tratativa_profissional_nome: string | null
  tratativa_criada_em:         string | null
  tratativa_origem:            string | null
  evolucao_vinculo:            string | null
  criado_em_tita:              string | null
  excluido_em_tita:            string | null
}

type Registro = Linha & Execucao

/**
 * Identidade de uma linha da grade.
 *
 * Agendamento marcado tem tita_agendamento_id, que é único por ocorrência (não
 * por série recorrente — validado em 14.244 linhas de junho/2026: 14.238 ids
 * distintos, e os 6 repetidos são linhas idênticas duplicadas), então ele É a
 * identidade.
 *
 * Slot 'Livre' vem sem id (validado: 100% das linhas sem id são 'Livre'), e aí a
 * identidade é a coordenada física do slot — que também não colide.
 */
function chave(r: Pick<Linha, "tita_agendamento_id" | "data" | "hora_inicial" | "profissional_id" | "terapia_id" | "sala_id">): string {
  if (r.tita_agendamento_id !== null && r.tita_agendamento_id !== undefined) {
    return `A:${r.tita_agendamento_id}`
  }
  return `L:${r.data}|${r.hora_inicial}|${r.profissional_id}|${r.terapia_id}|${r.sala_id}`
}

/**
 * Campos que definem o "conteúdo" de uma linha para efeito de versionamento. Se
 * algum deles mudar, a versão antiga é inativada como 'alterado' e uma nova entra.
 *
 * As colunas de execução ficam DE FORA de propósito, e isso é importante: se
 * estivessem aqui, toda evolução registrada inativaria a sessão e criaria uma
 * versão nova da linha — a mesma sessão apareceria duas vezes no histórico só
 * porque alguém escreveu a evolução dela. Execução não é uma nova versão da
 * sessão; é informação nova sobre a mesma sessão, e por isso é UPDATE (modo
 * "execucao"), não versionamento.
 */
const CAMPOS_CONTEUDO: (keyof Linha)[] = [
  "paciente_id", "paciente_nome", "data", "dia_semana", "hora_inicial", "hora_final",
  "profissional_id", "profissional_nome", "profissional_cpf",
  "terapia_id", "terapia_nome", "terapia_exibicao_id", "terapia_exibicao_nome",
  "sala_id", "sala_nome", "sala_observacoes",
  "unidade_id", "unidade_nome", "convenio_nome", "status_agendamento",
]

const CAMPOS_EXECUCAO: (keyof Execucao)[] = [
  "status_execucao", "justificativa", "possui_tratativa",
  "tratativa_profissional_id", "tratativa_profissional_nome", "tratativa_criada_em",
  "tratativa_origem", "evolucao_vinculo", "criado_em_tita", "excluido_em_tita",
]

/** Os três campos de instante voltam do banco noutro offset; comparar texto acusaria diferença sempre. */
const CAMPOS_INSTANTE = new Set<keyof Execucao>([
  "tratativa_criada_em", "criado_em_tita", "excluido_em_tita",
])

function mudou(a: Linha, b: Linha): boolean {
  return CAMPOS_CONTEUDO.some(c => (a[c] ?? null) !== (b[c] ?? null))
}

/**
 * Compara o bloco de execução.
 *
 * Os timestamps precisam de comparação por instante, não por string: gravamos
 * "2026-06-08T08:37:17-03:00" e o PostgREST devolve "2026-06-08T11:37:17+00:00".
 * São o mesmo momento; comparados como texto, divergiriam todo dia e o sync
 * reescreveria a tabela inteira a cada execução — exatamente o custo de WAL que
 * este desenho existe para evitar.
 */
function mudouExecucao(atual: Partial<Execucao>, novo: Execucao): boolean {
  return CAMPOS_EXECUCAO.some(c => {
    const a = atual[c] ?? null
    const b = novo[c] ?? null
    if (CAMPOS_INSTANTE.has(c)) {
      if (a === null || b === null) return a !== b
      return new Date(a as string).getTime() !== new Date(b as string).getTime()
    }
    return a !== b
  })
}

// ─── Banco ────────────────────────────────────────────────────────────────────

/**
 * Repete uma chamada que falhou por motivo transitório.
 *
 * Uma execução faz mais de uma dezena de idas ao PostgREST (a paginação do
 * select, mais um POST por lote da RPC). Medido em produção em 2026-08-06: sem
 * isto, um blip em qualquer uma delas derrubava a fatia inteira — três das nove
 * fatias do backfill falharam na primeira tentativa e passaram na seguinte, sem
 * nada ter mudado.
 *
 * Erro de rede e 5xx/429 são retentados; 4xx não, porque significa pedido
 * errado e repetir só multiplica o mesmo erro.
 */
async function comRetentativa<T>(rotulo: string, fn: () => Promise<T>, tentativas = 4): Promise<T> {
  let ultimo: unknown
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn()
    } catch (e) {
      ultimo = e
      const msg = e instanceof Error ? e.message : String(e)
      if (/\b4\d\d\b/.test(msg) && !/\b(408|429)\b/.test(msg)) throw e
      if (i === tentativas - 1) break
      const espera = 500 * Math.pow(2, i)
      console.warn(`[sync-grade-csv] ${rotulo}: tentativa ${i + 1} falhou (${msg}); repetindo em ${espera}ms`)
      await new Promise(r => setTimeout(r, espera))
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo))
}

const CAMPOS_SELECT = ["id", ...CAMPOS_CONTEUDO, "tita_agendamento_id"].join(", ")
const CAMPOS_SELECT_EXECUCAO = ["id", "tita_agendamento_id", ...CAMPOS_EXECUCAO].join(", ")

async function carregarAtivas<T>(
  sb: SupabaseClient, inicio: string, fim: string, campos: string,
): Promise<T[]> {
  const todas: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const lote = await comRetentativa(`select ${de}`, async () => {
      const { data, error } = await sb
        .from("csv_grades_profissionais")
        .select(campos)
        .gte("data", inicio)
        .lte("data", fim)
        .eq("ativo", true)
        .order("id")
        .range(de, de + PAGINA - 1)

      if (error) throw new Error(`select: ${error.message}`)
      return (data ?? []) as unknown as T[]
    })
    todas.push(...lote)
    if (lote.length < PAGINA) return todas
  }
}

async function inserir(sb: SupabaseClient, linhas: Record<string, unknown>[]) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    await comRetentativa(`insert lote ${i / LOTE}`, async () => {
      const { error } = await sb.from("csv_grades_profissionais").insert(linhas.slice(i, i + LOTE))
      if (error) throw new Error(`insert: ${error.message}`)
    })
  }
}

async function inativar(sb: SupabaseClient, ids: string[], motivo: "alterado" | "excluido") {
  for (let i = 0; i < ids.length; i += LOTE) {
    await comRetentativa(`inativar(${motivo}) lote ${i / LOTE}`, async () => {
      const { error } = await sb
        .from("csv_grades_profissionais")
        .update({ ativo: false, motivo_inativacao: motivo })
        .in("id", ids.slice(i, i + LOTE))
      if (error) throw new Error(`inativar(${motivo}): ${error.message}`)
    })
  }
}

async function aplicarExecucao(sb: SupabaseClient, linhas: Record<string, unknown>[]): Promise<number> {
  let total = 0
  for (let i = 0; i < linhas.length; i += LOTE) {
    total += await comRetentativa(`execucao lote ${i / LOTE}`, async () => {
      const { data, error } = await sb.rpc("fn_aplicar_execucao_grade", {
        p_linhas: linhas.slice(i, i + LOTE),
      })
      if (error) throw new Error(`fn_aplicar_execucao_grade: ${error.message}`)
      return (data as number) ?? 0
    })
  }
  return total
}

// ─── TiTa ─────────────────────────────────────────────────────────────────────

async function buscarRegistros(dataInicio: string, dataFim: string): Promise<Registro[] | null> {
  const resp = await fetch("https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN },
    body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim, unidade: UNIDADE }),
  })

  if (!resp.ok) throw new Error(`TITA API retornou ${resp.status}`)

  const csvText = await resp.text()
  const lines   = csvText.trim().split("\n")
  if (lines.length < 2) return null

  // Cabeçalhos em minúsculas, com acento e sem BOM — é assim que a TiTa manda.
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿/, "").trim().toLowerCase())
  const col     = (name: string) => headers.indexOf(name)

  const iAgId    = col("id agendamento")
  const iPacId   = col("id favorecido")
  const iPacNome = col("nome favorecido")
  const iData    = col("data")
  const iDiaSem  = col("dia da semana")
  const iHoraIni = col("hora inicial")
  const iHoraFim = col("hora final")
  const iProfId  = col("id profissional")
  const iProfNom = col("profissional")
  const iProfCpf = col("cpf do profissional")
  const iTerID   = col("id terapia")
  const iTerNom  = col("terapia")
  const iTerExId = col("id terapia exibição")
  const iTerExNm = col("terapia exibição")
  const iSalaId  = col("id sala")
  const iSalaNom = col("sala")
  const iSalaObs = col("observações da sala")
  const iUniId   = col("id unidade")
  const iUniNom  = col("nome unidade")
  const iConv    = col("convênio")

  // Duas colunas de status, e a diferença importa: "status do agendamento" diz se
  // o horário está ocupado (Agendado/Livre); "status" diz o que aconteceu
  // (Realizado/Cancelado/Em Conflito/Planejado-Pendente). O fallback abaixo
  // preserva o comportamento antigo caso a primeira suma da API.
  const iStatusAg   = col("status do agendamento") >= 0 ? col("status do agendamento") : col("status")
  const iStatusExec = col("status")
  const iJust       = col("justificativa")
  const iPossuiTrat = col("possui tratativa")
  const iTratProfId = col("id profissional tratativa")
  const iTratProfNm = col("nome profissional tratativa")
  const iTratCriac  = col("criação tratativa")
  const iTratOrig   = col("origem tratativa")
  const iVinculo    = col("vínculo da evolução")
  const iCriadoEm   = col("agendamento criado em")
  const iExcluidoEm = col("agendamento excluído em")

  const v = (vals: string[], i: number) => (i >= 0 ? vals[i]?.trim() ?? "" : "")

  const registros: Registro[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    if (vals.every(x => !x)) continue
    registros.push({
      tita_agendamento_id:   toInt(v(vals, iAgId)),
      paciente_id:           toInt(v(vals, iPacId)),
      paciente_nome:         v(vals, iPacNome) || null,
      data:                  toDate(v(vals, iData)),
      dia_semana:            v(vals, iDiaSem)  || null,
      hora_inicial:          toTime(v(vals, iHoraIni)),
      hora_final:            toTime(v(vals, iHoraFim)),
      profissional_id:       toInt(v(vals, iProfId)),
      profissional_nome:     v(vals, iProfNom) || null,
      profissional_cpf:      v(vals, iProfCpf) || null,
      terapia_id:            toInt(v(vals, iTerID)),
      terapia_nome:          v(vals, iTerNom)  || null,
      terapia_exibicao_id:   toInt(v(vals, iTerExId)),
      terapia_exibicao_nome: v(vals, iTerExNm) || null,
      sala_id:               toInt(v(vals, iSalaId)),
      sala_nome:             v(vals, iSalaNom) || null,
      sala_observacoes:      v(vals, iSalaObs) || null,
      unidade_id:            toInt(v(vals, iUniId)),
      unidade_nome:          v(vals, iUniNom)  || null,
      convenio_nome:         v(vals, iConv)    || null,
      status_agendamento:    v(vals, iStatusAg) || null,

      status_execucao:             v(vals, iStatusExec) || null,
      justificativa:               v(vals, iJust)       || null,
      possui_tratativa:            toBool(v(vals, iPossuiTrat)),
      tratativa_profissional_id:   toInt(v(vals, iTratProfId)),
      tratativa_profissional_nome: v(vals, iTratProfNm) || null,
      tratativa_criada_em:         toTimestamp(v(vals, iTratCriac)),
      tratativa_origem:            v(vals, iTratOrig)   || null,
      evolucao_vinculo:            v(vals, iVinculo)    || null,
      criado_em_tita:              toTimestamp(v(vals, iCriadoEm)),
      excluido_em_tita:            toTimestamp(v(vals, iExcluidoEm)),
    })
  }
  return registros
}

// ─── Modo "grade" ─────────────────────────────────────────────────────────────

async function sincronizarGrade(
  sb: SupabaseClient, recebidos: Registro[], dataInicio: string, dataFim: string,
) {
  // A TiTa pode devolver dias fora do range pedido; fora da janela não escrevemos,
  // e abaixo de hoje muito menos (o trigger rejeitaria, e é a regra do projeto).
  // Também cai aqui qualquer linha cuja data não pôde ser normalizada (toDate).
  const naJanela    = recebidos.filter(r => r.data && r.data >= dataInicio && r.data <= dataFim)
  const descartados = recebidos.length - naJanela.length

  const existentes = await carregarAtivas<Linha & { id: string }>(sb, dataInicio, dataFim, CAMPOS_SELECT)

  const porChaveExistente = new Map<string, Linha & { id: string }>()
  for (const e of existentes) porChaveExistente.set(chave(e), e)

  const aInserir: Record<string, unknown>[] = []
  const idsAlterados: string[] = []
  const vistos = new Set<string>()
  const agora  = new Date().toISOString()

  for (const r of naJanela) {
    const k = chave(r)
    // Linha repetida dentro do mesmo CSV: já tratada nesta rodada.
    if (vistos.has(k)) continue
    vistos.add(k)

    const atual = porChaveExistente.get(k)
    if (!atual) {
      aInserir.push({ ...r, ativo: true, origem: "tita_csv", visto_em: agora })
      continue
    }
    if (mudou(atual, r)) {
      idsAlterados.push(atual.id)
      aInserir.push({ ...r, ativo: true, origem: "tita_csv", visto_em: agora })
    }
    // idêntica → nenhuma escrita
  }

  // O que estava ativo na janela e não veio mais da TiTa foi removido lá.
  //
  // Sessão remarcada para outra data cai aqui como 'excluido' nesta fatia e é
  // reinserida como linha nova na fatia da data de destino — a chave (o
  // tita_agendamento_id) sobrevive à mudança, mas as duas fatias são chamadas
  // independentes e não se enxergam. O saldo é correto (uma versão inativa, uma
  // ativa); só o motivo fica 'excluido' em vez de 'alterado'.
  const idsExcluidos = existentes.filter(e => !vistos.has(chave(e))).map(e => e.id)

  // Ordem: inativa antes de inserir, para que uma consulta concorrente nunca veja
  // as duas versões da mesma sessão como ativas ao mesmo tempo — duplicata
  // inflaria silenciosamente qualquer contagem, enquanto uma lacuna momentânea é
  // evidente.
  //
  // Não há transação entre as chamadas. Se a execução morrer no meio, a fatia
  // fica com linhas inativadas e sem substituta até a próxima rodada, que
  // conserta sozinha (o registro volta a chegar da TiTa e não existe mais ativo
  // no banco, então é inserido). Nada é perdido de forma definitiva em nenhum
  // cenário — que era exatamente o risco do DELETE+INSERT anterior.
  if (idsAlterados.length) await inativar(sb, idsAlterados, "alterado")
  if (idsExcluidos.length) await inativar(sb, idsExcluidos, "excluido")
  if (aInserir.length)     await inserir(sb, aInserir)

  return {
    modo: "grade" as const,
    recebidos:   naJanela.length,
    descartados,
    existentes:  existentes.length,
    inseridos:   aInserir.length,
    alterados:   idsAlterados.length,
    excluidos:   idsExcluidos.length,
    inalterados: naJanela.length - aInserir.length,
  }
}

// ─── Modo "execucao" ──────────────────────────────────────────────────────────

async function sincronizarExecucao(
  sb: SupabaseClient, recebidos: Registro[], dataInicio: string, dataFim: string,
) {
  const naJanela = recebidos.filter(r => r.data && r.data >= dataInicio && r.data <= dataFim)

  // Casamento por tita_agendamento_id. Slot 'Livre' não tem id e nunca tem
  // tratativa, então fica fora dos dois lados sem perda.
  const porId = new Map<number, Registro>()
  for (const r of naJanela) {
    if (r.tita_agendamento_id !== null) porId.set(r.tita_agendamento_id, r)
  }

  type LinhaExec = Execucao & { id: string; tita_agendamento_id: number | null }
  const existentes = await carregarAtivas<LinhaExec>(sb, dataInicio, dataFim, CAMPOS_SELECT_EXECUCAO)

  const aAtualizar: Record<string, unknown>[] = []
  let semId = 0
  let semCorrespondencia = 0

  for (const e of existentes) {
    // Linha sem tita_agendamento_id é cega para esta passada. Na prática são as
    // linhas semeadas do backup XLS (origem='backup_xls'), que nunca tiveram id:
    // medido em produção, tita_csv preenche 100% dos 'Agendado' e backup_xls 0%.
    // Fica contabilizado à parte de propósito — é a métrica que diz quanto da
    // janela esta passada consegue enxergar, e some sozinha conforme a janela de
    // 45 dias avança para além do período semeado.
    if (e.tita_agendamento_id === null) { semId++; continue }
    const novo = porId.get(e.tita_agendamento_id)
    if (!novo) {
      // A TiTa não devolveu esta linha. Não limpamos nada: valor capturado antes
      // continua valendo. Zerar aqui apagaria evolução já registrada só porque a
      // sessão saiu da agenda — que é o oposto do que este sistema existe para
      // fazer.
      semCorrespondencia++
      continue
    }
    if (!mudouExecucao(e, novo)) continue

    aAtualizar.push({
      id: e.id,
      status_execucao:             novo.status_execucao,
      justificativa:               novo.justificativa,
      possui_tratativa:            novo.possui_tratativa,
      tratativa_profissional_id:   novo.tratativa_profissional_id,
      tratativa_profissional_nome: novo.tratativa_profissional_nome,
      tratativa_criada_em:         novo.tratativa_criada_em,
      tratativa_origem:            novo.tratativa_origem,
      evolucao_vinculo:            novo.evolucao_vinculo,
      criado_em_tita:              novo.criado_em_tita,
      excluido_em_tita:            novo.excluido_em_tita,
    })
  }

  const atualizadas = aAtualizar.length ? await aplicarExecucao(sb, aAtualizar) : 0

  return {
    modo: "execucao" as const,
    recebidos:  naJanela.length,
    existentes: existentes.length,
    atualizadas,
    inalteradas: existentes.length - aAtualizar.length - semCorrespondencia - semId,
    semCorrespondencia,   // tem id, mas a TiTa não devolveu a linha nesta janela
    semId,                // linha semeada do XLS: esta passada não a alcança
    comTratativa: naJanela.filter(r => r.possui_tratativa === true).length,
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const cors   = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405, cors)

  const body = await req.json().catch(() => ({})) as {
    data_inicio?: string; data_fim?: string; modo?: string
  }

  const modo: Modo = body.modo === "execucao" ? "execucao" : "grade"

  const janela = resolverJanela(body, modo)
  if (!janela) {
    return json({
      ok: true,
      ignorado: modo === "execucao"
        ? "janela inteiramente no futuro"
        : "janela inteiramente no passado",
      modo, ...body,
    }, 200, cors)
  }
  const { inicio: dataInicio, fim: dataFim } = janela

  let recebidos: Registro[] | null
  try {
    recebidos = await buscarRegistros(dataInicio, dataFim)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502, cors)
  }
  if (recebidos === null) {
    return json({ ok: true, modo, total: 0, dataInicio, dataFim }, 200, cors)
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Sem este catch, qualquer exceção do merge escapa do serve() e o runtime
  // devolve um "Internal Server Error" pelado, sem corpo e sem causa. Foi o que
  // aconteceu em 3 das 9 fatias do backfill de 2026-08-06: o cron não teria como
  // distinguir isso de um problema de plataforma, e a fatia ficaria pela metade
  // em silêncio. Agora a causa vem no corpo da resposta.
  try {
    const resultado = modo === "execucao"
      ? await sincronizarExecucao(sb, recebidos, dataInicio, dataFim)
      : await sincronizarGrade(sb, recebidos, dataInicio, dataFim)

    const resumo = { ok: true, dataInicio, dataFim, ...resultado }
    console.log(`[sync-grade-csv] ${JSON.stringify(resumo)}`)
    return json(resumo, 200, cors)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[sync-grade-csv] FALHA modo=${modo} ${dataInicio}..${dataFim}: ${msg}`)
    return json({ ok: false, erro: msg, modo, dataInicio, dataFim }, 500, cors)
  }
})
