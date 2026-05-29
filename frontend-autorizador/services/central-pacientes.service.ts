import { getSupabaseClient }
from '@/lib/supabase/client'

const supabase =
  getSupabaseClient()

export async function listarCentralPacientes(
  data: string
): Promise<Record<string, any>[]> {

  const { data: response, error } =
    await supabase
      .rpc('listar_central_pacientes', { p_data: data })
      .order('horario', { ascending: true })

  if (error) {

	console.error(
	  'ERRO CENTRAL:',
	  JSON.stringify(error, null, 2)
	)

    return []
  }

  return response || []
}