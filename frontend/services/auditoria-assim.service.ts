import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  AuditoriaAssimItem,
  AutorizacaoAssimSemana,
  KpisAuditoriaAssim,
  TokenMensalItem,
} from '@/components/auditoria-assim/types'

const supabase = getSupabaseClient()

export async function listarAuditoriaAssim(data: string): Promise<AuditoriaAssimItem[]> {
  const { data: result, error } = await supabase
    .rpc('get_auditoria_assim', { p_data: data })

  if (error) {
    console.error('Erro ao buscar auditoria ASSIM:', error)
    return []
  }

  return (result || []) as AuditoriaAssimItem[]
}

export async function listarFaltasAuditoria(data: string): Promise<AuditoriaAssimItem[]> {
  const { data: result, error } = await supabase
    .rpc('get_faltas_auditoria_assim', { p_data: data })

  if (error) {
    console.error('Erro ao buscar faltas auditoria ASSIM:', error)
    return []
  }

  return (result || []).map((f: { paciente_id: string; paciente_nome: string; data_atendimento: string; hora_inicial: string; tuss: string; terapia_nome: string; tipo_falta: string; profissional_nome: string | null }) => {
    const isTerapeuta = f.tipo_falta?.toLowerCase().includes('terapeuta')
    const bloco_id = `falta_${f.paciente_id}_${f.data_atendimento}_${f.hora_inicial}_${f.tuss}`
    return {
      bloco_id,
      paciente_id: String(f.paciente_id),
      paciente_nome: f.paciente_nome,
      // A RPC de faltas não devolve carteirinha; quem precisa dela (a Análise de
      // Reincidência) a pega das sessões do próprio paciente, que a têm.
      carteirinha: null,
      data_atendimento: f.data_atendimento,
      hora_inicial: f.hora_inicial,
      codigo_tuss: f.tuss,
      terapias: f.terapia_nome,
      situacao: isTerapeuta ? 'FALTA_TERAPEUTA' : 'FALTA',
      prioridade: 7,
      convenio_nome: null,
      profissionais: null,
      quantidade_sessoes: null,
      guia: null,
      status_assim: null,
      codigo_erro: null,
      descricao_erro: null,
      data_execucao: null,
      dias_atraso: null,
      possui_autorizacao: null,
      possui_solicitacao: null,
      observacao: isTerapeuta
        ? (f.profissional_nome ?? 'Falta do terapeuta')
        : 'Falta do paciente',
      motivo_glosa: null,
      teve_token: null,
      token: null,
      criado_por: null,
      forma_autorizacao: null,
      horario_autorizacao: null,
      observacao_manual: null,
      observacao_manual_atualizado_em: null,
      observacao_manual_atualizado_por_nome: null,
      token_conferido: null,
      token_conferido_em: null,
      token_conferido_por_nome: null,
    }
  })
}

export async function salvarMotivoGlosa(bloco_id: string, motivo_glosa: string): Promise<void> {
  const { error } = await supabase
    .from('auditoria_glosa_motivos')
    .upsert({ bloco_id, motivo_glosa, atualizado_em: new Date().toISOString() }, { onConflict: 'bloco_id' })
  if (error) throw error
}

type NotaManual = {
  bloco_id: string
  texto: string
  atualizado_em: string
  atualizado_por_nome: string | null
}

type TokenConferencia = {
  bloco_id: string
  conferido: boolean
  conferido_em: string | null
  conferido_por_nome: string | null
}

export async function buscarNotasEConferencias(blocoIds: string[]): Promise<{
  notas: Map<string, NotaManual>
  conferencias: Map<string, TokenConferencia>
}> {
  const notas = new Map<string, NotaManual>()
  const conferencias = new Map<string, TokenConferencia>()

  if (blocoIds.length === 0) return { notas, conferencias }

  const [notasResult, conferenciasResult] = await Promise.all([
    supabase
      .from('auditoria_atendimento_notas')
      .select('bloco_id, texto, atualizado_em, atualizado_por_nome')
      .in('bloco_id', blocoIds),
    supabase
      .from('auditoria_token_conferencias')
      .select('bloco_id, conferido, conferido_em, conferido_por_nome')
      .in('bloco_id', blocoIds),
  ])

  if (notasResult.error) {
    console.error('Erro ao buscar observações de auditoria:', notasResult.error.message, notasResult.error.details)
  } else {
    for (const nota of notasResult.data ?? []) notas.set(nota.bloco_id, nota)
  }

  if (conferenciasResult.error) {
    console.error('Erro ao buscar conferências de token:', conferenciasResult.error.message, conferenciasResult.error.details)
  } else {
    for (const conf of conferenciasResult.data ?? []) conferencias.set(conf.bloco_id, conf)
  }

  return { notas, conferencias }
}

async function nomeUsuarioLogado(): Promise<{ id: string | null; nome: string | null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return { id: null, nome: null }
  const { data } = await supabase.from('usuarios').select('nome').eq('id', user.id).maybeSingle()
  return { id: user.id, nome: data?.nome ?? null }
}

export async function salvarObservacaoManual(bloco_id: string, texto: string): Promise<void> {
  const { data: antes } = await supabase
    .from('auditoria_atendimento_notas')
    .select('bloco_id')
    .eq('bloco_id', bloco_id)
    .maybeSingle()
  const { id, nome } = await nomeUsuarioLogado()

  const { error } = await supabase
    .from('auditoria_atendimento_notas')
    .upsert(
      {
        bloco_id,
        texto: texto.trim(),
        atualizado_por: id,
        atualizado_por_nome: nome,
        atualizado_em: new Date().toISOString(),
        ...(antes ? {} : { criado_por: id }),
      },
      { onConflict: 'bloco_id' }
    )
  if (error) throw error
}

export async function marcarTokenConferido(bloco_id: string, conferido: boolean): Promise<void> {
  const { id, nome } = await nomeUsuarioLogado()

  const { error } = await supabase
    .from('auditoria_token_conferencias')
    .upsert(
      {
        bloco_id,
        conferido,
        conferido_em: conferido ? new Date().toISOString() : null,
        conferido_por: conferido ? id : null,
        conferido_por_nome: conferido ? nome : null,
      },
      { onConflict: 'bloco_id' }
    )
  if (error) throw error
}

export async function listarTokensMensal(mes: string): Promise<TokenMensalItem[]> {
  const { data: result, error } = await supabase
    .rpc('get_tokens_mensal', { p_mes: mes })

  if (error) {
    console.error('Erro ao buscar tokens do mês:', error.message, error.details)
    throw error
  }

  const itens = (result || []) as Omit<TokenMensalItem, 'token_conferido' | 'token_conferido_em' | 'token_conferido_por_nome'>[]
  const blocoIds = itens.map((item) => item.bloco_id).filter((id): id is string => !!id)
  const { conferencias } = await buscarNotasEConferencias(blocoIds)

  return itens.map((item) => {
    const conferencia = item.bloco_id ? conferencias.get(item.bloco_id) : undefined
    return {
      ...item,
      token_conferido: conferencia?.conferido ?? false,
      token_conferido_em: conferencia?.conferido_em ?? null,
      token_conferido_por_nome: conferencia?.conferido_por_nome ?? null,
    }
  })
}

/** Teto de linhas que o PostgREST pode aplicar por resposta. */
const TETO_POSTGREST = 1000

/**
 * Todas as autorizações que a ASSIM registrou para uma carteirinha numa semana —
 * inclusive as que não casam com sessão nenhuma.
 *
 * Por que ler a tabela direto em vez de usar a RPC da auditoria: a auditoria é
 * dirigida pela sessão (LEFT JOIN com a agenda_tita à esquerda), então a
 * autorização EXCEDENTE não aparece nela. E é a excedente que estoura a cota
 * semanal e provoca a glosa 1601. `autorizacoes_assim` tem policy
 * "authenticated read", então o navegador lê sem RPC nova.
 *
 * Três detalhes que não são estilo:
 *
 * - Colunas explícitas, nunca `select('*')`: sob privilégio por coluna o `*`
 *   responde 403.
 * - `matricula` guarda a carteirinha pontuada (`empresa.matricula.dep`), que é o
 *   mesmo texto que a RPC devolve como `carteirinha`.
 * - `data_execucao` é `timestamp without time zone` guardando hora de São Paulo,
 *   então os limites vão como texto naive — nada de `toISOString()`, que
 *   converteria para UTC e deslocaria a janela em 3h.
 */
export async function listarAutorizacoesAssimSemana(
  carteirinhas: string[],
  inicio: string,
  fimExclusivo: string
): Promise<AutorizacaoAssimSemana[]> {
  if (carteirinhas.length === 0) return []

  const { data: result, error } = await supabase
    .from('autorizacoes_assim')
    .select('guia, matricula, paciente_nome, data_execucao, status, codigo_tuss, codigo_erro, descricao_erro, teve_token, token')
    .in('matricula', carteirinhas)
    .gte('data_execucao', `${inicio}T00:00:00`)
    .lt('data_execucao', `${fimExclusivo}T00:00:00`)
    .order('data_execucao')

  if (error) {
    console.error('Erro ao buscar autorizações da semana:', error.message, error.details)
    throw error
  }

  const itens = (result ?? []) as AutorizacaoAssimSemana[]
  // Uma semana de um paciente são dezenas de linhas. Encostar no teto significa
  // que a resposta veio cortada, e um corte silencioso aqui faria a análise
  // mentir por baixo — exatamente no número que ela existe para conferir.
  if (itens.length >= TETO_POSTGREST) {
    console.error(
      `listarAutorizacoesAssimSemana: ${itens.length} linhas — a resposta pode ter sido truncada pelo PostgREST.`
    )
  }

  return itens
}

export async function buscarKpisAuditoriaAssim(data: string): Promise<KpisAuditoriaAssim | null> {
  const { data: result, error } = await supabase
    .rpc('get_kpis_auditoria_assim', { p_data: data })
    .single()

  if (error) {
    console.error('Erro ao buscar KPIs auditoria ASSIM:', error)
    return null
  }

  return result as KpisAuditoriaAssim
}
