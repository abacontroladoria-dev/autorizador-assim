import { getSupabaseClient }
from '@/lib/supabase/client'

const supabase =
  getSupabaseClient()

export async function listarCentralPacientes(
  data: string
) {

  const { data: response, error } =
    await supabase

      .from('vw_central_pacientes')

      .select('*')

      .eq(
        'data_atendimento',
        data
      )

      .order('horario', {
        ascending: true
      })

  if (error) {

	console.error(
	  'ERRO CENTRAL:',
	  JSON.stringify(error, null, 2)
	)

    return []
  }

  return response || []
}