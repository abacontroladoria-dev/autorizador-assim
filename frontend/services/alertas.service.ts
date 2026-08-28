import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  Alerta,
  AlertaEvento,
  AlertasContadores,
  AlertaEntidadeRef,
  AlertaPrioridade,
  AlertaStatus,
} from '@/components/alertas/types'

const supabase = getSupabaseClient()

/**
 * Lista de alertas visíveis ao usuário. A RLS de public.alertas já filtra por
 * setor (recepção vê o dela) ou gestão (vê tudo) — não há filtro de setor aqui.
 * p_status='abertos' cobre aberto+em_andamento, que é o default das duas telas.
 */
export async function listarAlertas(
  modulo: string | null = null,
  status: string | null = 'abertos',
  limit = 100,
): Promise<Alerta[]> {
  const { data, error } = await supabase.rpc('get_alertas', {
    p_modulo: modulo,
    p_status: status,
    p_limit: limit,
  })

  if (error) {
    console.error('[alertas] Erro ao listar:', error.message)
    return []
  }
  return (data ?? []) as Alerta[]
}

/**
 * Contadores agregados — nunca as linhas.
 * modulo=null para o sino (global); 'assim' para os KPIs da aba Pendências.
 */
export async function buscarContadores(
  modulo: string | null = null,
): Promise<AlertasContadores> {
  const { data, error } = await supabase
    .rpc('get_alertas_contadores', { p_modulo: modulo })
    .single()

  if (error) {
    console.error('[alertas] Erro ao contar:', error.message)
    return {
      abertos: 0, em_andamento: 0, criticos: 0,
      total_pendente: 0, conferidas_hoje: 0,
    }
  }
  return data as AlertasContadores
}

/**
 * Histórico cronológico da ENTIDADE (não do alerta): atravessa todos os alertas
 * que aquele atendimento já teve. É o "histórico permanente" do requisito.
 */
export async function buscarHistorico(
  entidadeTipo: string,
  entidadeId: string,
): Promise<AlertaEvento[]> {
  const { data, error } = await supabase.rpc('get_alerta_historico', {
    p_entidade_tipo: entidadeTipo,
    p_entidade_id: entidadeId,
  })

  if (error) {
    console.error('[alertas] Erro ao buscar histórico:', error.message)
    return []
  }
  return (data ?? []) as AlertaEvento[]
}

/**
 * Cria alerta manual. A RPC valida o role (admin/diretoria/autorizacao) e força
 * origem='manual' — o cliente não escolhe a origem.
 */
export async function criarAlerta(payload: {
  modulo: string
  entidadeTipo: string
  entidadeId: string
  entidadeRef: AlertaEntidadeRef
  titulo: string
  descricao?: string | null
  setorDestino: string
  prioridade?: AlertaPrioridade
}): Promise<string> {
  const { data, error } = await supabase.rpc('fn_alerta_criar', {
    p_modulo: payload.modulo,
    p_entidade_tipo: payload.entidadeTipo,
    p_entidade_id: payload.entidadeId,
    p_entidade_ref: payload.entidadeRef,
    p_titulo: payload.titulo,
    p_descricao: payload.descricao ?? null,
    p_setor_destino: payload.setorDestino,
    p_prioridade: payload.prioridade ?? 'alta',
  })

  if (error) throw error
  return data as string
}

export async function comentarAlerta(alertaId: string, texto: string): Promise<void> {
  const { error } = await supabase.rpc('fn_alerta_comentar', {
    p_alerta_id: alertaId,
    p_texto: texto,
  })
  if (error) throw error
}

export async function alterarStatusAlerta(
  alertaId: string,
  status: AlertaStatus,
  texto?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('fn_alerta_status', {
    p_alerta_id: alertaId,
    p_status: status,
    p_texto: texto ?? null,
  })
  if (error) throw error
}
