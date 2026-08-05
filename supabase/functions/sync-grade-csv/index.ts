// Sincroniza csv_grades_profissionais a partir da API csv_grade_profissionais da
// TiTa. Roda pelo cron sync-grade-csv-daily (02:00 BRT), em fatias de 1 semana —
// ver fn_sync_grade_csv_em_lotes().
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
//   • a janela sincronizada nunca começa antes de hoje (clamp em resolverJanela);
//   • não existe DELETE em caminho nenhum — sessão que a TiTa deixou de devolver
//     vira ativo = false, motivo_inativacao = 'excluido';
//   • sessão cujo conteúdo mudou não é sobrescrita: a versão antiga vira
//     ativo = false, motivo_inativacao = 'alterado', e a nova entra como linha
//     nova. Mesmo versionamento de agenda_tita (20260530000000).
//
// Além disso, o trigger trg_congelar_grade_passada (20260805130200) rejeita
// UPDATE/DELETE em qualquer linha cuja data já passou. Ou seja: mesmo que algo
// aqui regrida, o banco não deixa o passado ser tocado.
//
// ─── Custo de escrita ─────────────────────────────────────────────────────────
//
// Linha cujo conteúdo não mudou não gera escrita nenhuma — nem um UPDATE de
// carimbo. Num dia normal a grande maioria das ~4 mil linhas por fatia está
// inalterada, então o sync escreve pouquíssimo. Isso é deliberado: esta tabela
// já apareceu no diagnóstico de Disk IO do projeto, e um UPDATE por linha por dia
// significaria dezenas de milhares de versões de linha (WAL) por execução.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const TITA_TOKEN                = Deno.env.get("TITA_TOKEN")!

const UNIDADE = 280
const PAGINA  = 1000
const LOTE    = 500

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

/**
 * Resolve a janela a sincronizar, sempre com piso em hoje. Data passada é
 * território congelado: mesmo que alguém peça explicitamente, não buscamos nem
 * escrevemos nada lá. Devolve null se a janela pedida estiver inteiramente no
 * passado (nada a fazer, e não é erro).
 */
function resolverJanela(body: { data_inicio?: string; data_fim?: string }) {
  const hoje  = hojeSP()
  const pedido = body.data_inicio && body.data_fim
    ? { inicio: body.data_inicio, fim: body.data_fim }
    : { inicio: hoje, fim: fimPadrao() }

  if (pedido.fim < hoje) return null
  return { inicio: pedido.inicio < hoje ? hoje : pedido.inicio, fim: pedido.fim, hoje }
}

// ─── Chave natural ────────────────────────────────────────────────────────────

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

/**
 * Identidade de uma linha da grade.
 *
 * Agendamento marcado tem tita_agendamento_id, que é único por ocorrência (não
 * por série recorrente — validado em 3.197 linhas reais, zero repetição), então
 * ele É a identidade.
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

// Campos que definem o "conteúdo" de uma linha. Se algum deles mudar, a versão
// antiga é inativada como 'alterado' e uma nova entra no lugar.
const CAMPOS_CONTEUDO: (keyof Linha)[] = [
  "paciente_id", "paciente_nome", "data", "dia_semana", "hora_inicial", "hora_final",
  "profissional_id", "profissional_nome", "profissional_cpf",
  "terapia_id", "terapia_nome", "terapia_exibicao_id", "terapia_exibicao_nome",
  "sala_id", "sala_nome", "sala_observacoes",
  "unidade_id", "unidade_nome", "convenio_nome", "status_agendamento",
]

function mudou(a: Linha, b: Linha): boolean {
  return CAMPOS_CONTEUDO.some(c => (a[c] ?? null) !== (b[c] ?? null))
}

// ─── Banco ────────────────────────────────────────────────────────────────────

const CAMPOS_SELECT = ["id", ...CAMPOS_CONTEUDO, "tita_agendamento_id"].join(", ")

async function carregarAtivas(sb: SupabaseClient, inicio: string, fim: string) {
  const todas: (Linha & { id: string })[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb
      .from("csv_grades_profissionais")
      .select(CAMPOS_SELECT)
      .gte("data", inicio)
      .lte("data", fim)
      .eq("ativo", true)
      .order("id")
      .range(de, de + PAGINA - 1)

    if (error) throw new Error(`select: ${error.message}`)
    const lote = (data ?? []) as unknown as (Linha & { id: string })[]
    todas.push(...lote)
    if (lote.length < PAGINA) return todas
  }
}

async function inserir(sb: SupabaseClient, linhas: Record<string, unknown>[]) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await sb.from("csv_grades_profissionais").insert(linhas.slice(i, i + LOTE))
    if (error) throw new Error(`insert: ${error.message}`)
  }
}

async function inativar(sb: SupabaseClient, ids: string[], motivo: "alterado" | "excluido") {
  for (let i = 0; i < ids.length; i += LOTE) {
    const { error } = await sb
      .from("csv_grades_profissionais")
      .update({ ativo: false, motivo_inativacao: motivo })
      .in("id", ids.slice(i, i + LOTE))
    if (error) throw new Error(`inativar(${motivo}): ${error.message}`)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const origin = req.headers.get("origin") || ""
  const cors   = getCorsHeaders(origin)

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405, cors)

  const body = await req.json().catch(() => ({})) as { data_inicio?: string; data_fim?: string }

  const janela = resolverJanela(body)
  if (!janela) {
    return json({ ok: true, ignorado: "janela inteiramente no passado", ...body }, 200, cors)
  }
  const { inicio: dataInicio, fim: dataFim } = janela

  // 1. Busca CSV na API TITA
  const resp = await fetch("https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": TITA_TOKEN },
    body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim, unidade: UNIDADE }),
  })

  if (!resp.ok) return json({ error: `TITA API retornou ${resp.status}` }, 502, cors)

  const csvText = await resp.text()
  const lines   = csvText.trim().split("\n")
  if (lines.length < 2) return json({ ok: true, total: 0, dataInicio, dataFim }, 200, cors)

  // 2. Parseia cabeçalhos (remove BOM)
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
  const iStatus  = col("status do agendamento") >= 0 ? col("status do agendamento") : col("status")

  const v = (vals: string[], i: number) => (i >= 0 ? vals[i]?.trim() ?? "" : "")

  // 3. Monta registros
  const recebidos: Linha[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i])
    if (vals.every(x => !x)) continue
    recebidos.push({
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
      status_agendamento:    v(vals, iStatus)  || null,
    })
  }

  // A TiTa pode devolver dias fora do range pedido; fora da janela não escrevemos,
  // e abaixo de hoje muito menos (o trigger rejeitaria, e é a regra do projeto).
  // Também cai aqui qualquer linha cuja data não pôde ser normalizada (toDate).
  const naJanela   = recebidos.filter(r => r.data && r.data >= dataInicio && r.data <= dataFim)
  const descartados = recebidos.length - naJanela.length

  // 4. Diff contra o que já está no banco
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const existentes = await carregarAtivas(sb, dataInicio, dataFim)

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

  // 5. Escreve. Ordem: inativa antes de inserir, para que uma consulta concorrente
  // nunca veja as duas versões da mesma sessão como ativas ao mesmo tempo —
  // duplicata inflaria silenciosamente qualquer contagem, enquanto uma lacuna
  // momentânea é evidente.
  //
  // Não há transação entre as duas chamadas. Se a execução morrer no meio, a
  // fatia fica com linhas inativadas e sem substituta até a próxima rodada, que
  // conserta sozinha (o registro volta a chegar da TiTa e não existe mais ativo
  // no banco, então é inserido). Nada é perdido de forma definitiva em nenhum
  // cenário — que era exatamente o risco do DELETE+INSERT anterior.
  if (idsAlterados.length)  await inativar(sb, idsAlterados, "alterado")
  if (idsExcluidos.length)  await inativar(sb, idsExcluidos, "excluido")
  if (aInserir.length)      await inserir(sb, aInserir)

  const resumo = {
    ok: true,
    dataInicio,
    dataFim,
    recebidos:   naJanela.length,
    descartados,                       // fora da janela ou com data ilegível
    existentes:  existentes.length,
    inseridos:   aInserir.length,
    alterados:   idsAlterados.length,
    excluidos:   idsExcluidos.length,
    inalterados: naJanela.length - aInserir.length,
  }
  console.log(`[sync-grade-csv] ${JSON.stringify(resumo)}`)
  return json(resumo, 200, cors)
})
