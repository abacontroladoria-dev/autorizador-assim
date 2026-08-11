import { getSupabaseClient } from '@/lib/supabase/client'
import type { SlotModalSubstituicao } from './controle-terapeutico.service'

const supabase = getSupabaseClient()

export type RegistroSubstituicao = {
  sessao_id: number
  paciente_id?: number | null
  paciente_nome?: string | null
  unidade_nome?: string | null
  terapia_real: string
  data_sessao: string
  horario_inicio?: string | null
  horario_fim?: string | null
  profissional_original_id?: number | null
  profissional_original_nome?: string | null
  profissional_substituto_id: number
  profissional_substituto_nome: string
  competencia: string
  motivo?: string | null
  usuario_responsavel?: string | null
  fora_da_especialidade?: boolean
  motivo_excecao?: string | null
}

export type CriteriaData = {
  continuidade: Map<number, Set<number>>  // paciente_id -> Set<profissional_id>
  cargaDia: Map<number, number>           // profissional_id -> total sessoes no dia
  substituicoesCompetencia: Map<number, number> // profissional_id -> total substituicoes no mes
}

export async function registrarSubstituicao(payload: RegistroSubstituicao): Promise<void> {
  try {
    const { error } = await supabase.from('substituicoes_historico').insert({
      sessao_id:                    payload.sessao_id,
      paciente_id:                  payload.paciente_id ?? null,
      paciente_nome:                payload.paciente_nome ?? null,
      unidade_nome:                 payload.unidade_nome ?? null,
      terapia_real:                 payload.terapia_real,
      data_sessao:                  payload.data_sessao,
      horario_inicio:               payload.horario_inicio ?? null,
      horario_fim:                  payload.horario_fim ?? null,
      profissional_original_id:     payload.profissional_original_id ?? null,
      profissional_original_nome:   payload.profissional_original_nome ?? null,
      profissional_substituto_id:   payload.profissional_substituto_id,
      profissional_substituto_nome: payload.profissional_substituto_nome,
      competencia:                  payload.competencia,
      motivo:                       payload.motivo ?? null,
      usuario_responsavel:          payload.usuario_responsavel ?? null,
      fora_da_especialidade:        payload.fora_da_especialidade ?? false,
      motivo_excecao:               payload.fora_da_especialidade ? (payload.motivo_excecao ?? null) : null,
    })
    if (error) console.error('[substituicoes] Erro ao registrar histórico:', error)
  } catch (err) {
    console.error('[substituicoes] Erro ao registrar histórico:', err)
  }
}

export async function buscarCriteriosRecomendacao(params: {
  pacienteIds: number[]
  data: string
  competencia: string
  profIds: number[]
}): Promise<CriteriaData> {
  const empty: CriteriaData = {
    continuidade: new Map(),
    cargaDia: new Map(),
    substituicoesCompetencia: new Map(),
  }

  if (params.profIds.length === 0) return empty

  const [cont, carga, subst] = await Promise.all([
    params.pacienteIds.length > 0
      ? supabase.rpc('fn_continuidade_semana', {
          p_paciente_ids:    params.pacienteIds,
          p_data:            params.data,
          profissional_ids:  params.profIds,
        })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc('fn_carga_dia', {
      profissional_ids: params.profIds,
      p_data:           params.data,
    }),
    supabase.rpc('fn_substituicoes_competencia', {
      profissional_ids: params.profIds,
      p_competencia:    params.competencia,
    }),
  ])

  if (cont.error)  console.error('[substituicoes] fn_continuidade_semana:', cont.error)
  if (carga.error) console.error('[substituicoes] fn_carga_dia:', carga.error)
  if (subst.error) console.error('[substituicoes] fn_substituicoes_competencia:', subst.error)

  const continuidade = new Map<number, Set<number>>()
  for (const row of (cont.data ?? []) as { profissional_id: number; paciente_id: number }[]) {
    if (!continuidade.has(row.paciente_id)) continuidade.set(row.paciente_id, new Set())
    continuidade.get(row.paciente_id)!.add(row.profissional_id)
  }

  const cargaDia = new Map<number, number>(
    ((carga.data ?? []) as { profissional_id: number; total: number }[]).map(
      (r) => [r.profissional_id, r.total]
    )
  )

  const substituicoesCompetencia = new Map<number, number>(
    ((subst.data ?? []) as { profissional_id: number; total: number }[]).map(
      (r) => [r.profissional_id, r.total]
    )
  )

  return { continuidade, cargaDia, substituicoesCompetencia }
}

/**
 * Retorna o profissional_id recomendado entre os livres, aplicando as regras:
 *
 *   Filtro primário: profissionais com a mesma Terapia Real da sessão.
 *   Fallback: se nenhum tiver a mesma terapia, usa todos os livres compatíveis.
 *
 *   Desempate (em ordem):
 *     1. Continuidade com o paciente na semana
 *     2. Menor carga de atendimentos no dia
 *     3. Menor quantidade de substituições na competência atual
 *     4. Ordem alfabética pelo nome
 */
export function calcularRecomendacaoAutomatica(
  livres: SlotModalSubstituicao[],
  sessaoTerapiaNome: string,
  pacienteId: number | null,
  criteria: CriteriaData
): number | null {
  if (livres.length === 0) return null

  // Deduplica por profissional_id mantendo o primeiro slot encontrado (da hora da sessão)
  const idsUnicos = [...new Set(livres.map((p) => p.profissional_id))]
  const todos = idsUnicos.map((id) => {
    const prof = livres.find((p) => p.profissional_id === id)!
    return { id, nome: prof.profissional_nome, terapia: prof.terapia_nome }
  })

  // Filtro primário: mesma terapia real. Fallback: todos os compatíveis.
  const mesmaTerapia = todos.filter((c) => c.terapia === sessaoTerapiaNome)
  const pool = mesmaTerapia.length > 0 ? mesmaTerapia : todos

  const profsContinuidade = pacienteId
    ? (criteria.continuidade.get(pacienteId) ?? new Set<number>())
    : new Set<number>()

  const ranked = pool
    .map((c) => ({
      ...c,
      c1: profsContinuidade.has(c.id) ? 0 : 1,
      c2: criteria.cargaDia.get(c.id) ?? 0,
      c3: criteria.substituicoesCompetencia.get(c.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.c1 !== b.c1) return a.c1 - b.c1
      if (a.c2 !== b.c2) return a.c2 - b.c2
      if (a.c3 !== b.c3) return a.c3 - b.c3
      return a.nome.localeCompare(b.nome, 'pt-BR')
    })

  return ranked[0]?.id ?? null
}
