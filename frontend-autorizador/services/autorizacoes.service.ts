import { getSupabaseClient } from "@/lib/supabase/client"


type CriarAutorizacaoPayload = {

  agenda_id?: number

  paciente_id?: number

  paciente_nome?: string

  cpf?: string | null

  data_nascimento?: string | null

  matricula?: string

  data?: string

  horario?: string

  terapia_nome?: string
  
  terapia_exibicao_id?: number

  tuss1?: string

  status?: string

  empresa?: string

  dep?: string

  crm?: string

  nome_medico?: string

  usuario_id?: string

  machine_id?: string

  horario_autorizacao?: string
   
}

function semDadosPacienteComplementares(error: any) {
  const mensagem = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    mensagem.includes('cpf') ||
    mensagem.includes('data_nascimento')
  )
}

	
export async function criarAutorizacao(
  payload: CriarAutorizacaoPayload
) {

  const supabase =
    getSupabaseClient()

  const insertPayload = {

    // =========================
    // IDENTIFICAÇÃO
    // =========================

    agenda_id:
      null,

    paciente_id:
      payload.paciente_id || null,

    paciente_nome:
      payload.paciente_nome || null,

    cpf:
      payload.cpf || null,

    data_nascimento:
      payload.data_nascimento || null,

    matricula:
      payload.matricula || null,

    // =========================
    // ATENDIMENTO
    // =========================

    data_atendimento:
      payload.data || null,

    horario:
      payload.horario || null,

    terapia_nome:
      payload.terapia_nome || null,
	  
	terapia_exibicao_id:
	  payload.terapia_exibicao_id != null
		? Number(payload.terapia_exibicao_id)
		: null,

    tuss:
      payload.tuss1 || null,

    // =========================
    // STATUS
    // =========================

    status:
      payload.status || 'pendente',

    data_horario:

	  payload.data && payload.horario

		? `${payload.data}T${payload.horario}`

		: null,

    // =========================
    // CONVÊNIO / MÉDICO
    // =========================

    empresa:
      payload.empresa || null,

    dep:
      payload.dep || null,

    crm:
      payload.crm || null,

    nome_medico:
      payload.nome_medico || null,

    // =========================
    // EXECUÇÃO
    // =========================

    usuario_id:
      payload.usuario_id || null,

    machine_id:
      payload.machine_id || null,
  }

  console.log(
    'INSERT AUTORIZAÇÃO:',
    insertPayload
  )

  let {
    data,
    error
  } = await supabase
    .from('fila_autorizacoes')
    .insert([insertPayload])
    .select()
    .single()

  if (
    error &&
    semDadosPacienteComplementares(error)
  ) {
    const legacyPayload: Partial<typeof insertPayload> = {
      ...insertPayload
    }

    delete legacyPayload.cpf
    delete legacyPayload.data_nascimento

    const retry = await supabase
      .from('fila_autorizacoes')
      .insert([legacyPayload])
      .select()
      .single()

    data = retry.data
    error = retry.error
  }

	if (error) {

		console.error(
		  'ERRO COMPLETO:',
		  JSON.stringify(error, null, 2)
		)

	  return null
	}

	  console.log(
		'SALVOU:',
		data
	  )

	  return data
	}

export async function listarAutorizacoes(): Promise<Record<string, any>[]> {

  const supabase =
    getSupabaseClient()

  const {
    data,
    error
  } = await supabase

	.from('fila_autorizacoes')
	.select('*')
	.order('created_at', {
	  ascending: false
	})

  if (error) {

    console.error(
      'Erro ao buscar autorizações:',
      error
    )

    return []
  }

  return data || []
}
