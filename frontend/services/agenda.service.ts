import { getSupabaseClient } from '@/lib/supabase/client'
import type { AgendaFilterOptions } from '@/types/agenda'

const supabase = getSupabaseClient()

// Único sobrevivente do módulo /agenda (páginas removidas em 2026-08-17):
// alimenta os selects do AlocarSessaoModal, no cronograma de salas.
export async function buscarOpcoesFiltro(): Promise<AgendaFilterOptions> {
  const [pacientesRes, terapeutasRes, terapiasRes, salasRes, unidadesRes] = await Promise.all([
    supabase.from('agenda_tita_autorizacao_v2').select('paciente_nome').not('paciente_nome', 'is', null).limit(5000),
    supabase.from('grade_profissionais_tita').select('nome_profissional').not('nome_profissional', 'is', null).limit(3000),
    supabase.from('agenda_tita_autorizacao_v2').select('terapia_nome').not('terapia_nome', 'is', null).limit(200),
    supabase.from('agenda_tita_autorizacao_v2').select('sala_nome').not('sala_nome', 'is', null).limit(200),
    supabase.from('agenda_tita_autorizacao_v2').select('clinica_nome').not('clinica_nome', 'is', null).limit(50),
  ])

  const unique = <T>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter(Boolean))] as T[]

  return {
    pacientes:  unique((pacientesRes.data  ?? []).map((r) => r.paciente_nome)),
    terapeutas: unique((terapeutasRes.data ?? []).map((r) => r.nome_profissional)),
    terapias:   unique((terapiasRes.data   ?? []).map((r) => r.terapia_nome)),
    salas:      unique((salasRes.data      ?? []).map((r) => r.sala_nome)),
    unidades:   unique((unidadesRes.data   ?? []).map((r) => r.clinica_nome)),
  }
}
