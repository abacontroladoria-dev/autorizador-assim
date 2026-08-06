import { getSupabaseClient } from "@/lib/supabase/client"
import { pm, exU } from "@/lib/cronograma/helpers"
import { decodeEntidadesHtml } from "@/lib/cronograma/constants"
import type { CsvRow } from "@/types/cronograma"
import type { GradeComparativoRaw } from "@/lib/cronograma/comparativoSessoes"

const FIELDS = "id, paciente_nome, dia_semana, hora_inicial, hora_final, profissional_nome, terapia_nome, terapia_exibicao_nome, status_agendamento, convenio_nome, sala_nome, data, unidade_nome"
const PAGE = 1000

const FIELDS_COMPARATIVO = "paciente_id, paciente_nome, sala_nome, convenio_nome, status_agendamento, data, hora_inicial, terapia_id, terapia_nome, dia_semana, profissional_id, profissional_nome"

// Padrão de dupla codificação UTF-8 (mojibake): byte líder C2/C3 seguido de byte
// de continuação (80–BF). Ex.: "Araújo" gravado como "AraÃºjo".
const MOJIBAKE_RE = /[Â-Ã][-¿]/

// A sincronização da grade (Edge Function sync-grade-csv) grava texto com dupla
// codificação UTF-8. Isto repara na leitura. Só atua quando o padrão está presente,
// para não corromper texto já correto.
function fixMojibakeSemEntidades(s: string | null | undefined): string {
  const str = s ?? ""
  if (!str || !MOJIBAKE_RE.test(str)) return str
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      Uint8Array.from(str, c => c.charCodeAt(0) & 0xff),
    )
  } catch {
    return str
  }
}

/**
 * Repara texto vindo da sincronização da grade: dupla codificação UTF-8
 * (mojibake, ex.: "Araújo" gravado como "AraÃºjo") E entidades HTML cruas
 * (ex.: "D&#039;avila" — ver decodeEntidadesHtml em constants.ts). São dois
 * problemas independentes que podem aparecer juntos no mesmo nome.
 */
export function fixMojibake(s: string | null | undefined): string {
  return decodeEntidadesHtml(fixMojibakeSemEntidades(s))
}

export async function buscarGradeComoCSVRows(dataInicio: string, dataFim: string): Promise<CsvRow[]> {
  const sb = getSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []

  let from = 0
  while (true) {
    const { data, error } = await sb
      .from("csv_grades_profissionais")
      .select(FIELDS)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .eq("unidade_id", 280)
      // Obrigatório desde que a tabela passou a versionar em vez de apagar: o sync
      // não faz mais DELETE, ele marca a versão antiga com ativo=false e insere a
      // nova. Sem este filtro uma sessão remarcada volta duas vezes — a antiga e a
      // atual. Ver migration 20260805160000 e a Edge Function sync-grade-csv.
      .eq("ativo", true)
      .order("data")
      .order("hora_inicial")
      .order("id")          // desempate único — paginação estável, sem pular/duplicar linhas
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (all as any[]).map((r: Record<string, string | null>) => {
    const hi_str   = String(r.hora_inicial ?? "").slice(0, 5)
    const salaNome = fixMojibake(r.sala_nome)
    return {
      CsvGradeId:               r.id ?? undefined,
      "Nome Favorecido":        fixMojibake(r.paciente_nome),
      "Dia da Semana":          r.dia_semana            ?? "",
      "Hora Inicial":           hi_str,
      "Terapia":                fixMojibake(r.terapia_nome),
      "Terapia Exibição":       fixMojibake(r.terapia_exibicao_nome),
      "Profissional":           fixMojibake(r.profissional_nome),
      "Status do Agendamento":  r.status_agendamento    ?? "",
      "Convênio":               fixMojibake(r.convenio_nome),
      "Sala":                   salaNome,
      "Data":                   r.data                  ?? "",
      HI_str:                   hi_str,
      HI:                       pm(hi_str),
      Unidade:                  exU(salaNome),
    } as unknown as CsvRow
  })
}

/**
 * Busca sessões de csv_grades_profissionais pra comparativo entre períodos —
 * sem filtro de unidade (o Comparativo de Sessões precisa de TODAS as
 * unidades, ao contrário de buscarGradeComoCSVRows que serve o fluxo
 * operacional restrito à unidade 280) e já trazendo paciente_id, necessário
 * pra excluir pacientes fictícios/administrativos por ID (ver
 * PACIENTES_FICTICIOS_IDS em comparativoSessoes.ts).
 */
export async function buscarGradeComparativo(dataInicio: string, dataFim: string): Promise<GradeComparativoRaw[]> {
  const sb = getSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = []

  let from = 0
  while (true) {
    const { data, error } = await sb
      .from("csv_grades_profissionais")
      .select(FIELDS_COMPARATIVO)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .eq("ativo", true)    // versionamento — ver nota em buscarGradeComoCSVRows
      .order("data")
      .order("id")
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  return (all as Record<string, string | number | null>[]).map(r => ({
    paciente_id:        r.paciente_id === null || r.paciente_id === undefined ? null : Number(r.paciente_id),
    paciente_nome:       fixMojibake(r.paciente_nome as string | null),
    sala_nome:           fixMojibake(r.sala_nome as string | null),
    convenio_nome:       fixMojibake(r.convenio_nome as string | null),
    status_agendamento:  (r.status_agendamento as string | null) ?? "",
    data:                (r.data as string | null) ?? "",
    hora_inicial:        (r.hora_inicial as string | null) ?? null,
    terapia_id:          r.terapia_id === null || r.terapia_id === undefined ? null : Number(r.terapia_id),
    terapia_nome:        fixMojibake(r.terapia_nome as string | null),
    dia_semana:          (r.dia_semana as string | null) ?? null,
    profissional_id:     r.profissional_id === null || r.profissional_id === undefined ? null : Number(r.profissional_id),
    profissional_nome:   fixMojibake(r.profissional_nome as string | null),
  }))
}
