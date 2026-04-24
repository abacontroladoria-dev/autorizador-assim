import { getSupabaseClient } from "@/lib/supabase/client"

export async function criarAutorizacao(payload: any) {
const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('fila_autorizacoes')
	.insert({
	  agenda_id: payload.agenda_id, // 🔥 ESSENCIAL
	  paciente_nome: payload.paciente_nome,
	  matricula: payload.matricula,
	  data_horario: new Date().toISOString(),
	  data_atendimento: payload.data,
	  horario: payload.horario,
	  status: payload.status || 'executando',

	  empresa: payload.empresa || null,
	  dep: payload.dep || null,
	  crm: payload.crm || null,
	  nome_medico: payload.nome_medico || null,
	  tuss1: payload.tuss1 || null,

	  usuario_id: payload.usuario_id || null,
	  machine_id: payload.machine_id || null,
	})
    .select()
    .single()

  if (error) {
    console.log('ERRO:', error)

    if (error.message.includes('unique_agendamento')) {
      alert('Já existe autorização para esse paciente nesse horário')
    }

    return null
  }

  console.log('SALVOU:', data)
  return data
}

export async function listarAutorizacoes() {
const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('fila_autorizacoes')
	 .select(`
	  *,
	  agenda_orbita (
		terapia
	  )
	`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return data
}