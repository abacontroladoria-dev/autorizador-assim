import { getSupabaseClient } from '@/lib/supabase/client'

const supabase = getSupabaseClient()

export type ControleTerapeuticoStatus =
  | 'pendente'
  | 'presente'
  | 'faltou'
  | 'disponivel'
  | 'indisponivel'
  | 'cobertura_planejada'
  | 'cobertura_confirmada'

export type AtendimentoTerapeutico = {
  tita_agendamento_id: string | number
  data_atendimento?: string | null
  paciente_nome?: string | null
  nome_paciente?: string | null
  profissional_id?: string | number | null
  profissional_nome?: string | null
  nome_profissional?: string | null
  nome_terapeuta?: string | null
  nome_terapia?: string | null
  terapia_nome?: string | null
  data?: string | null
  hora_inicial?: string | null
  hora_final?: string | null
  horario?: string | null
  sala?: string | null
  sala_nome?: string | null
  sala_operacional?: string | null
  unidade?: string | null
  nome_unidade?: string | null
  id_unidade?: string | number | null
  status?: ControleTerapeuticoStatus | string | null
  status_operacional?: ControleTerapeuticoStatus | string | null
  profissional_substituto_id?: string | number | null
  profissional_substituto_nome?: string | null
  observacao?: string | null
  terapia_exibicao?: string
  terapia_exibicao_nome?: string
  terapia_exibicao_id?: number
}

export async function listarCentralTerapeutica(data: string) {
  const { data: response, error } = await supabase
    .from('vw_central_terapeutica')
.select(`
  tita_agendamento_id,

  data_atendimento,

  paciente_nome,

  profissional_id,
  profissional_nome,

  terapia_id,
  terapia_nome,

  hora_inicial,
  hora_final,

  sala_nome,
  sala_operacional,

  unidade,

  status,

  profissional_substituto_id,
  profissional_substituto_nome,

  observacao
`)
    .eq('data_atendimento', data)
    .order('hora_inicial', {
      ascending: true,
    })

  if (error) {
    console.error(error)
    return []
  }

  return (response || []) as AtendimentoTerapeutico[]
}
