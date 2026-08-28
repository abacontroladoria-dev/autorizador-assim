import { getSupabaseClient } from '@/lib/supabase/client'
import type { PepCatalogoItem, PepEvidencia, PepPlanejamentoSemestral, PepRegistroEntrega, PepStatusEntrega } from '@/types/pep'
import { registrarAuditoria } from '@/services/pepAuditoria.service'

export async function getCatalogoItens(): Promise<{ data: PepCatalogoItem[] | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('pep_catalogo_itens')
    .select('*')
    .eq('ativo', true)
    .order('classe', { ascending: false }) // recorrentes antes de semestrais
    .order('nome')
  if (error) {
    console.error('Erro getCatalogoItens:', error)
    return { data: null, error }
  }
  return { data: data as PepCatalogoItem[], error: null }
}

export async function getPlanejamentoSemestral(
  prestadorNome: string
): Promise<{ data: PepPlanejamentoSemestral[] | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('pep_planejamento_semestral')
    .select('*')
    .eq('prestador_nome', prestadorNome)
    .eq('ativo', true)
  if (error) {
    console.error('Erro getPlanejamentoSemestral:', error)
    return { data: null, error }
  }
  return { data: data as PepPlanejamentoSemestral[], error: null }
}

// Cadastra o planejamento de um item semestral para um paciente. Se já existir
// um planejamento ativo para o mesmo paciente/item, encadeia como reprogramação
// (mantém o histórico — Seção 9.7 do PRD).
export async function salvarPlanejamentoSemestral(input: {
  pacienteNome: string
  pacienteCpf?: string | null
  prestadorNome: string
  itemId: string
  competenciaPlanejada: string
  origem?: PepPlanejamentoSemestral['origem']
  planejamentoAnteriorId?: string | null
  motivo?: string | null
  evidencias?: PepEvidencia[]
}): Promise<{ data: PepPlanejamentoSemestral | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (input.planejamentoAnteriorId) {
    await supabase
      .from('pep_planejamento_semestral')
      .update({ ativo: false })
      .eq('id', input.planejamentoAnteriorId)
  }

  const { data, error } = await supabase
    .from('pep_planejamento_semestral')
    .insert({
      paciente_nome: input.pacienteNome,
      paciente_cpf: input.pacienteCpf ?? null,
      prestador_nome: input.prestadorNome,
      item_id: input.itemId,
      competencia_planejada: input.competenciaPlanejada,
      origem: input.origem ?? 'inicial',
      planejamento_anterior_id: input.planejamentoAnteriorId ?? null,
      motivo: input.motivo ?? null,
      evidencias: input.evidencias ?? [],
      criado_por: user?.id ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('Erro salvarPlanejamentoSemestral:', error)
    return { data: null, error }
  }

  // PRD Seção 11.4 — trilha de auditoria (usuário, competência, antes/depois).
  // O encadeamento em si (desativar o planejamento anterior) também é uma
  // alteração manual e fica registrado à parte.
  if (input.planejamentoAnteriorId) {
    await registrarAuditoria({
      tabela: 'planejamento_semestral',
      registroId: input.planejamentoAnteriorId,
      acao: 'editar',
      prestadorNome: input.prestadorNome,
      pacienteNome: input.pacienteNome,
      competencia: input.competenciaPlanejada,
      antes: { ativo: true },
      depois: { ativo: false },
      motivo: 'Substituído por reprogramação',
    })
  }
  await registrarAuditoria({
    tabela: 'planejamento_semestral',
    registroId: data.id,
    acao: 'criar',
    prestadorNome: input.prestadorNome,
    pacienteNome: input.pacienteNome,
    competencia: input.competenciaPlanejada,
    depois: data,
    motivo: input.motivo,
  })

  return { data: data as PepPlanejamentoSemestral, error: null }
}

// Exclui um planejamento (PRD Seção 11.4 — toda alteração manual exige
// motivo e fica em trilha de auditoria). Bloqueado pelo banco se outro
// planejamento referenciar este como "anterior" (preserva a cadeia de
// reprogramações históricas).
export async function excluirPlanejamentoSemestral(
  id: string,
  contexto: { prestadorNome: string; pacienteNome: string; competencia: string; motivo: string }
): Promise<{ ok: boolean; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data: existente } = await supabase
    .from('pep_planejamento_semestral')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('pep_planejamento_semestral').delete().eq('id', id)
  if (error) {
    console.error('Erro excluirPlanejamentoSemestral:', error)
    return { ok: false, error }
  }

  await registrarAuditoria({
    tabela: 'planejamento_semestral',
    registroId: id,
    acao: 'excluir',
    prestadorNome: contexto.prestadorNome,
    pacienteNome: contexto.pacienteNome,
    competencia: contexto.competencia,
    antes: existente ?? null,
    motivo: contexto.motivo,
  })
  return { ok: true, error: null }
}

export async function getRegistrosEntrega(
  prestadorNome: string,
  competencia: string
): Promise<{ data: PepRegistroEntrega[] | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('pep_registros_entrega')
    .select('*')
    .eq('prestador_nome', prestadorNome)
    .eq('competencia', competencia)
  if (error) {
    console.error('Erro getRegistrosEntrega:', error)
    return { data: null, error }
  }
  return { data: data as PepRegistroEntrega[], error: null }
}

// Marca um item como entregue/pendente (ou registra a quantidade entregue,
// para recorrentes) para um paciente (ou geral, quando pacienteNome é null)
// numa competência. Upsert por (paciente, item, competência) — ou
// (prestador, item, competência) para itens GERAL, conforme os índices
// únicos da migration. Evidência é sempre referência (caminho + nome no
// diretório da clínica), nunca upload — PRD Seção 6/12.3.
export async function upsertRegistroEntrega(input: {
  pacienteNome: string | null
  pacienteCpf?: string | null
  prestadorNome: string
  itemId: string
  competencia: string
  status: PepStatusEntrega
  quantidadeEntregue?: number | null
  evidencias?: PepEvidencia[]
  observacao?: string | null
  motivo?: string | null
}): Promise<{ data: PepRegistroEntrega | null; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // chave_conflito é coluna gerada (migration 20260810150000) — unifica os
  // dois casos (por paciente / GERAL) num único índice não-parcial, que é o
  // que o Postgres consegue inferir de um ON CONFLICT sem WHERE.
  const onConflict = 'chave_conflito,item_id,competencia'

  // Busca o estado anterior ANTES de sobrescrever — é o "antes" da trilha de
  // auditoria (Seção 11.4) e também decide se a ação é criação ou edição.
  let existenteQuery = supabase
    .from('pep_registros_entrega')
    .select('*')
    .eq('item_id', input.itemId)
    .eq('competencia', input.competencia)
  existenteQuery = input.pacienteNome
    ? existenteQuery.eq('paciente_nome', input.pacienteNome)
    : existenteQuery.is('paciente_nome', null).eq('prestador_nome', input.prestadorNome)
  const { data: existente } = await existenteQuery.maybeSingle()

  const { data, error } = await supabase
    .from('pep_registros_entrega')
    .upsert({
      paciente_nome: input.pacienteNome,
      paciente_cpf: input.pacienteCpf ?? null,
      prestador_nome: input.prestadorNome,
      item_id: input.itemId,
      competencia: input.competencia,
      status: input.status,
      quantidade_entregue: input.quantidadeEntregue ?? null,
      evidencias: input.evidencias ?? [],
      observacao: input.observacao ?? null,
      entregue_em: input.status === 'entregue' ? new Date().toISOString() : null,
      registrado_por: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict })
    .select()
    .single()

  if (error) {
    console.error('Erro upsertRegistroEntrega:', error)
    return { data: null, error }
  }

  await registrarAuditoria({
    tabela: 'registro_entrega',
    registroId: data.id,
    acao: existente ? 'editar' : 'criar',
    prestadorNome: input.prestadorNome,
    pacienteNome: input.pacienteNome,
    competencia: input.competencia,
    antes: existente ?? null,
    depois: data,
    motivo: input.motivo,
  })

  return { data: data as PepRegistroEntrega, error: null }
}

// Exclui um registro de entrega (PRD Seção 11.4 — alteração manual exige
// motivo e fica em trilha de auditoria).
export async function excluirRegistroEntrega(
  id: string,
  contexto: { prestadorNome: string; pacienteNome: string | null; competencia: string; motivo: string }
): Promise<{ ok: boolean; error: unknown }> {
  const supabase = getSupabaseClient()
  const { data: existente } = await supabase
    .from('pep_registros_entrega')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('pep_registros_entrega').delete().eq('id', id)
  if (error) {
    console.error('Erro excluirRegistroEntrega:', error)
    return { ok: false, error }
  }

  await registrarAuditoria({
    tabela: 'registro_entrega',
    registroId: id,
    acao: 'excluir',
    prestadorNome: contexto.prestadorNome,
    pacienteNome: contexto.pacienteNome,
    competencia: contexto.competencia,
    antes: existente ?? null,
    motivo: contexto.motivo,
  })
  return { ok: true, error: null }
}
