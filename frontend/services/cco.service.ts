import { getSupabaseClient } from '@/lib/supabase/client'

export interface CCOAtendimentoRow {
  session_key:             string
  paciente_nome:           string
  data_sessao:             string
  hora_inicio:             string
  hora_fim:                string | null
  terapia:                 string | null
  profissional:            string | null
  possui_tratativa:        boolean
  profissional_tratativa:  string | null
  data_tratativa:          string | null
  tipos_ocorrencia:        string[]
  profissional_substituto: string | null
  authorization_status:    string | null
}

const supabase = getSupabaseClient()

export async function listarAtendimentosCCO(
  dataInicio: string,
  dataFim:    string,
): Promise<CCOAtendimentoRow[]> {
  const { data, error } = await supabase.rpc('get_cco_atendimentos', {
    p_data_inicio: dataInicio,
    p_data_fim:    dataFim,
  })

  if (error) {
    console.error('[CCO] Erro ao buscar atendimentos:', error.message, {
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return []
  }

  const rows = (data || []) as CCOAtendimentoRow[]
  console.info(`[CCO] ${rows.length} registros retornados para ${dataInicio} → ${dataFim}`)
  return rows
}
