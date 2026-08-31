import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

// Único sobrevivente do módulo /agenda (páginas removidas em 2026-08-17):
// alimenta a sugestão de terapia do AlocarSessaoModal, no cronograma de salas.
//
// Antes esta função (buscarOpcoesFiltro) buscava também pacientes (5000
// linhas) e terapeutas (3000 linhas) além de terapias/salas/unidades — só a
// lista de terapias era usada, mas toda abertura do modal pagava o tráfego
// das outras 4 consultas. Isolado aqui, é 1 consulta enxuta em vez de 5.
export async function listarTerapiasFiltro(): Promise<string[]> {
  const { data, error } = await supabase
    .from('agenda_tita_autorizacao_v2')
    .select('terapia_nome')
    .not('terapia_nome', 'is', null)
    .limit(200)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map(r => r.terapia_nome as string).filter(Boolean))]
}
