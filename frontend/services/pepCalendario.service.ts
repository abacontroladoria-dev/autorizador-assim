import { getSupabaseClient } from '@/lib/supabase/client'

export type PepCalendarioCompetencia = {
  competencia: string
  semanas_supervisao_estudo: number
  observacao: string | null
}

// PRD Seção 9.11: fora do calendário publicado, o padrão é mês cheio (4
// semanas) — Supervisão/Estudo esperam 4 unidades, peso unitário 7,5%.
export const SEMANAS_PADRAO = 4

export async function getCalendarioCompetencia(
  competencia: string
): Promise<{ data: PepCalendarioCompetencia | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('pep_calendario_competencias')
    .select('*')
    .eq('competencia', competencia)
    .maybeSingle()
  if (error) {
    console.error('Erro getCalendarioCompetencia:', error)
    return { data: null, error }
  }
  return { data: data as PepCalendarioCompetencia | null, error: null }
}

export async function salvarCalendarioCompetencia(input: {
  competencia: string
  semanasSupervisaoEstudo: number
  observacao?: string | null
}): Promise<{ error: unknown }> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('pep_calendario_competencias')
    .upsert({
      competencia: input.competencia,
      semanas_supervisao_estudo: input.semanasSupervisaoEstudo,
      observacao: input.observacao ?? null,
      atualizado_por: user?.id ?? null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'competencia' })
  if (error) console.error('Erro salvarCalendarioCompetencia:', error)
  return { error }
}
