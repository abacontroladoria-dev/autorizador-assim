import { getSupabaseClient } from '@/lib/supabase/client'
import { getFunctionUrl, getFunctionHeaders } from '@/lib/supabase/functions'
import type { ControleTerapeuticoStatus } from './central-terapeutas.service'

const supabase = getSupabaseClient()

export type AtualizarStatusPayload = {
  tita_agendamento_id: string | number
  status: ControleTerapeuticoStatus
  profissional_substituto_id?: string | number | null
  profissional_substituto_nome?: string | null
  observacao?: string | null
}

export type AtualizarStatusEmLotePayload = Omit<
  AtualizarStatusPayload,
  'tita_agendamento_id'
> & {
  tita_agendamento_ids: Array<string | number>
}

async function chamarUpsertControleTerapeutico(items: AtualizarStatusPayload[]) {
  const response = await fetch(getFunctionUrl('controle-terapeutico-upsert'), {
    method: 'POST',
    headers: await getFunctionHeaders(),
    body: JSON.stringify({ items }),
  })

  const result = await response.json().catch(() => null)

if (!response.ok) {

  console.error(
    'Erro no upsert:',
    JSON.stringify(
      {
        status: response.status,
        result,
        items,
      },
      null,
      2
    )
  )

  return null
}

  return result?.data || []
}

/**
 * Atualiza o status de um atendimento terapêutico
 * Status: presente, faltou, disponivel, indisponivel,
 * cobertura_planejada, cobertura_confirmada, pendente
 */
export async function atualizarStatusAtendimento(payload: AtualizarStatusPayload) {
  try {
    const data = await chamarUpsertControleTerapeutico([payload])

    return data?.[0] || null
  } catch (err) {
    console.error('Erro ao atualizar status:', err)
    return null
  }
}

/**
 * Atualiza o status de vários atendimentos do mesmo profissional/dia.
 * Usado para disponibilidade/indisponibilidade por terapeuta.
 */
export async function atualizarStatusAtendimentosEmLote(
  payload: AtualizarStatusEmLotePayload
) {
  try {
    const ids = payload.tita_agendamento_ids.filter(Boolean)

    if (ids.length === 0) {
      return []
    }

    return await chamarUpsertControleTerapeutico(
      ids.map((tita_agendamento_id) => ({
        tita_agendamento_id,
        status: payload.status,
        profissional_substituto_id: payload.profissional_substituto_id,
        profissional_substituto_nome: payload.profissional_substituto_nome,
        observacao: payload.observacao,
      }))
    )
  } catch (err) {
    console.error('Erro ao atualizar status em lote:', err)
    return null
  }
}

/**
 * Busca profissionais disponíveis para cobertura
 */
export async function listarProfissionaisDisponiveis(
  dataAtendimento: string,

  terapiaNome: string,

  horaInicial?: string,

  horaFinal?: string,

  unidadeId?: number
): Promise<Record<string, any>[]> {
  try {
    let query = supabase
	  .from('vw_profissionais_disponiveis')
	  .select('*')

	  .eq('data', dataAtendimento)

		.or(
		  `terapia_exibicao.eq.${terapiaNome.replace(/[",]/g, '').trim()},nome_terapia.eq.${terapiaNome.replace(/[",]/g, '').trim()}`
		)

	if (
	  horaInicial &&
	  horaFinal
	) {

	  query = query
		.lte(
		  'hora_inicial',
		  horaInicial
		)

		.gte(
		  'hora_final',
		  horaFinal
		)
	}

    if (unidadeId) {
	  query = query.eq(
		'id_unidade',
		unidadeId
	  )
	}

	query = query.order(
	  'hora_inicial',
	  { ascending: true }
	)

	const { data, error } = await query

    if (error) {
      console.error(
		  'Erro ao listar profissionais:',
		  JSON.stringify(error, null, 2)
		)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Erro ao listar profissionais:', err)
    return []
  }
}

/**
 * Sincroniza dados operacionais com o servidor
 * Atualiza controle_terapeutico, grade_profissionais_tita, etc
 */
export async function sincronizarDados() {
  try {
	  
    const response = await fetch(getFunctionUrl('sync'), {
      method: 'POST',
      headers: await getFunctionHeaders(),
      body: JSON.stringify({
        operacao: 'sincronizar_controle',
        timestamp: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.statusText}`)
    }

    const resultado = await response.json()
    return resultado
  } catch (err) {
    console.error('Erro ao sincronizar:', err)
    throw err
  }
}

/**
 * Busca dados de cobertura (grade de profissionais)
 */
export async function buscarGradeCobertura(
  dataAtendimento: string,
  idUnidade: number = 280
): Promise<Record<string, any>[]> {
  try {
    const { data, error } = await supabase
      .from('grade_profissionais_tita')
      .select('*')
      .eq('data', dataAtendimento)
      .eq('id_unidade', idUnidade)
      .order('profissional_nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar grade:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Erro ao buscar grade:', err)
    return []
  }
}

/**
 * Busca itens da agenda para cobertura
 */
export async function buscarItensAgenda(
  dataAtendimento: string,
  idUnidade: number = 280
): Promise<Record<string, any>[]> {
  try {
    const { data, error } = await supabase
      .from('agenda_tita')
      .select('*')
      .eq('data_atendimento', dataAtendimento)
      .eq('id_unidade', idUnidade)
      .order('hora_inicial', { ascending: true })

    if (error) {
      console.error('Erro ao buscar agenda:', error)
      return []
    }

    return data || []
  } catch (err) {
    console.error('Erro ao buscar agenda:', err)
    return []
  }
}

export type SlotModalSubstituicao = {
  profissional_id: number
  profissional_nome: string
  terapia_exibicao_nome: string
  unidade: string
  hora: string
  status_slot: string
  paciente_nome: string | null
  sala_nome: string | null
}

/**
 * Busca profissionais para o modal de substituição.
 * Combina os slots do dia (vw_modal_substituicao_terapeutas) com todos os terapeutas
 * que possuem a mesma terapia na semana (vw_terapeutas_semana), para que profissionais
 * que não trabalham hoje mas podem ter acordado uma troca também apareçam.
 */
export async function listarModalSubstituicao(params: {
  terapiaExibicaoNome: string
  unidade: string
}): Promise<SlotModalSubstituicao[]> {
  try {
    const [{ data: slotsHoje, error: erroHoje }, { data: semana, error: erroSemana }] =
      await Promise.all([
        supabase
          .from('vw_modal_substituicao_terapeutas')
          .select('profissional_id, profissional_nome, terapia_exibicao_nome, unidade, hora, status_slot, paciente_nome, sala_nome')
          .eq('terapia_exibicao_nome', params.terapiaExibicaoNome)
          .eq('unidade', params.unidade)
          .order('profissional_nome', { ascending: true })
          .order('hora', { ascending: true }),
        supabase
          .from('vw_terapeutas_semana')
          .select('profissional_id, profissional_nome, terapia_exibicao_nome, unidade')
          .eq('terapia_exibicao_nome', params.terapiaExibicaoNome)
          .eq('unidade', params.unidade),
      ])

    if (erroHoje) console.error('Erro ao listar slots do dia:', erroHoje)
    if (erroSemana) console.error('Erro ao listar terapeutas da semana:', erroSemana)

    const slots = (slotsHoje as SlotModalSubstituicao[]) || []

    const idsHoje = new Set(slots.map((s) => s.profissional_id))

    const slotsAdicionais: SlotModalSubstituicao[] = []
    const idsAdicionados = new Set<number>()

    for (const t of semana ?? []) {
      if (idsHoje.has(t.profissional_id) || idsAdicionados.has(t.profissional_id)) continue
      idsAdicionados.add(t.profissional_id)
      slotsAdicionais.push({
        profissional_id: t.profissional_id,
        profissional_nome: t.profissional_nome,
        terapia_exibicao_nome: t.terapia_exibicao_nome,
        unidade: t.unidade,
        hora: '',
        status_slot: 'sem_agenda_hoje',
        paciente_nome: null,
        sala_nome: null,
      })
    }

    return [...slots, ...slotsAdicionais].sort((a, b) =>
      a.profissional_nome.localeCompare(b.profissional_nome, 'pt-BR')
    )
  } catch (err) {
    console.error('Erro ao listar modal substituição:', err)
    return []
  }
}
