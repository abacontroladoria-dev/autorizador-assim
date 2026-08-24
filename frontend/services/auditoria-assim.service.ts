import { getSupabaseClient } from '@/lib/supabase/client'
import { UNIDADE_CONSERTAR, mapearUnidade } from '@/lib/cronograma/comparativoSessoes'
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
 * Teto de páginas. 20 × 1000 = 20 mil autorizações numa semana — uma ordem de
 * grandeza acima do volume medido da clínica inteira. Existir é o que impede
 * um laço infinito se o servidor passar a devolver página cheia para sempre.
 */
const TETO_PAGINAS = 20

/**
 * Largura de cada consulta ao intervalo, em dias — não o intervalo inteiro
 * de uma vez.
 *
 * Medido em 2026-08-24: pedir o mês inteiro (~26 dias) numa consulta só a
 * `agenda_tita` (que filtra por `ilike convenio_nome`, sem índice) e a
 * `autorizacoes_assim` estourou `statement_timeout` (57014) — a listagem
 * mensal da Reconciliação passou a pedir um intervalo bem maior que a
 * semana original, que sempre coube dentro do timeout. Em janelas deste
 * tamanho, sequenciais, cada consulta corre no mesmo orçamento que a semana
 * original já corria em produção.
 */
const JANELA_CONSULTA_DIAS = 6

/** "2026-08-03" + 6 → "2026-08-09". Sem `new Date(string)` sobre o resultado:
 *  evita a armadilha de fuso já documentada em `lib/cronograma/comparativoSessoes.ts`. */
function somarDiasIso(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  const d = new Date(ano, (mes ?? 1) - 1, (dia ?? 1) + dias)
  const a = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${a}-${m}-${dd}`
}

const COLUNAS_AUTORIZACAO =
  'guia, matricula, paciente_nome, data_execucao, status, codigo_tuss, codigo_erro, descricao_erro, teve_token, token'

/**
 * Todas as autorizações que a ASSIM registrou numa semana — inclusive as que não
 * casam com sessão nenhuma.
 *
 * Por que ler a tabela direto em vez de usar a RPC da auditoria: a auditoria é
 * dirigida pela sessão (LEFT JOIN com a agenda_tita à esquerda), então a
 * autorização EXCEDENTE não aparece nela. E é a excedente que estoura a cota
 * semanal e provoca a glosa 1601. `autorizacoes_assim` tem policy
 * "authenticated read", então o navegador lê sem RPC nova.
 *
 * `carteirinhas = null` traz a semana da clínica inteira. É o modo que a
 * listagem de pacientes com pendências usa: sem ele, dizer quantas guias cada
 * paciente tem sobrando exigiria uma requisição por paciente — cem requisições
 * para desenhar uma tabela. Com ele, a mesma carga serve a listagem e o modal, e
 * abrir um paciente não busca nada.
 *
 * Quatro detalhes que não são estilo:
 *
 * - Colunas explícitas, nunca `select('*')`: sob privilégio por coluna o `*`
 *   responde 403.
 * - `matricula` guarda a carteirinha pontuada (`empresa.matricula.dep`), que é o
 *   mesmo texto que a RPC devolve como `carteirinha`.
 * - `data_execucao` é `timestamp without time zone` guardando hora de São Paulo,
 *   então os limites vão como texto naive — nada de `toISOString()`, que
 *   converteria para UTC e deslocaria a janela em 3h.
 * - Paginação com ordenação total (`data_execucao, matricula, guia`): a guia
 *   sozinha não é chave — ela recicla —, e uma ordenação instável faria páginas
 *   consecutivas repetirem e pularem linhas em silêncio.
 */
export async function listarAutorizacoesAssimSemana(
  carteirinhas: string[] | null,
  inicio: string,
  fimExclusivo: string
): Promise<AutorizacaoAssimSemana[]> {
  if (carteirinhas !== null && carteirinhas.length === 0) return []

  const itens: AutorizacaoAssimSemana[] = []
  let janelaInicio = inicio

  // Uma janela de poucos dias por vez — ver `JANELA_CONSULTA_DIAS`. Sequencial,
  // não em paralelo: é o mesmo intervalo, só fatiado, então rodar tudo de uma
  // vez só trocaria uma consulta lenta por várias simultâneas na mesma tabela.
  while (janelaInicio < fimExclusivo) {
    const janelaFimExclusivo = (() => {
      const bruto = somarDiasIso(janelaInicio, JANELA_CONSULTA_DIAS)
      return bruto < fimExclusivo ? bruto : fimExclusivo
    })()

    for (let pagina = 0; pagina < TETO_PAGINAS; pagina++) {
      let consulta = supabase
        .from('autorizacoes_assim')
        .select(COLUNAS_AUTORIZACAO)
        .gte('data_execucao', `${janelaInicio}T00:00:00`)
        .lt('data_execucao', `${janelaFimExclusivo}T00:00:00`)
        .order('data_execucao')
        .order('matricula')
        .order('guia')
        .range(pagina * TETO_POSTGREST, (pagina + 1) * TETO_POSTGREST - 1)

      if (carteirinhas) consulta = consulta.in('matricula', carteirinhas)

      const { data: result, error } = await consulta

      if (error) {
        console.error('Erro ao buscar autorizações do período:', error.message, error.details)
        throw error
      }

      const lote = (result ?? []) as AutorizacaoAssimSemana[]
      itens.push(...lote)
      // Página incompleta = acabou esta janela. É o único sinal confiável: o
      // PostgREST não devolve o total sem `count`, e pedi-lo custaria um
      // COUNT(*) por janela.
      if (lote.length < TETO_POSTGREST) break
      if (pagina === TETO_PAGINAS - 1) {
        console.error(
          `listarAutorizacoesAssimSemana: teto de ${TETO_PAGINAS} páginas atingido em ${janelaInicio}–${janelaFimExclusivo} — o período pode estar incompleto.`
        )
      }
    }

    janelaInicio = janelaFimExclusivo
  }

  return itens
}

/**
 * A unidade clínica de cada paciente no período, inferida da sala agendada.
 *
 * Nem `get_auditoria_assim` nem `autorizacoes_assim` carregam sala ou unidade —
 * a unidade nunca foi um dado da autorização, é um dado da agenda. Em vez de
 * alargar a RPC (que é dependência de ESCRITA de `fn_alertas_avaliar_assim`, e
 * mexer nela muda quais alertas nascem), esta função lê as duas colunas que
 * faltam direto de `agenda_tita` e reusa o `mapearUnidade` do comparativo de
 * sessões — o mesmo de-para sala→unidade que o resto do sistema já aplica.
 *
 * `ativo = true` não é zelo: sem ele a linha reagendada continua respondendo, e
 * o paciente aparece em duas unidades ao mesmo tempo.
 *
 * Falha em silêncio devolvendo mapa vazio. A unidade é um recorte da listagem,
 * não a razão dela existir: derrubar a tela inteira porque uma coluna acessória
 * não veio seria pior que exibir "—" nela.
 */
export async function listarUnidadesPorPaciente(
  inicio: string,
  fim: string
): Promise<Map<string, string>> {
  const contagem = new Map<string, Map<string, number>>()

  try {
    let janelaInicio = inicio
    // Uma janela de poucos dias por vez — ver `JANELA_CONSULTA_DIAS`. O
    // `ilike` em `convenio_nome` não tem índice, então pedir o intervalo
    // inteiro de uma vez é o que estourava `statement_timeout` num mês.
    while (janelaInicio <= fim) {
      const janelaFim = (() => {
        const bruto = somarDiasIso(janelaInicio, JANELA_CONSULTA_DIAS - 1)
        return bruto > fim ? fim : bruto
      })()

      for (let pagina = 0; pagina < TETO_PAGINAS; pagina++) {
        const { data, error } = await supabase
          .from('agenda_tita')
          .select('paciente_id, sala_nome')
          .eq('ativo', true)
          .ilike('convenio_nome', '%assim%')
          .gte('data_atendimento', janelaInicio)
          .lte('data_atendimento', janelaFim)
          .order('paciente_id')
          .order('sala_nome')
          .range(pagina * TETO_POSTGREST, (pagina + 1) * TETO_POSTGREST - 1)

        if (error) throw error

        const lote = (data ?? []) as { paciente_id: number | string | null; sala_nome: string | null }[]
        for (const linha of lote) {
          if (linha.paciente_id == null) continue
          const unidade = mapearUnidade(linha.sala_nome)
          // "Consertar Unidade no Sistema" é falha de cadastro na origem, não uma
          // unidade: vira ausência, e a listagem mostra "—".
          if (unidade === UNIDADE_CONSERTAR) continue
          const chave = String(linha.paciente_id)
          const porUnidade = contagem.get(chave) ?? new Map<string, number>()
          porUnidade.set(unidade, (porUnidade.get(unidade) ?? 0) + 1)
          contagem.set(chave, porUnidade)
        }

        if (lote.length < TETO_POSTGREST) break
      }

      janelaInicio = somarDiasIso(janelaFim, 1)
    }
  } catch (e) {
    console.error('Erro ao inferir unidades do período:', e)
    return new Map()
  }

  // Paciente que circula entre unidades fica com a que mais o recebeu na semana
  // — é a resposta útil para "onde procuro esta pessoa".
  const resultado = new Map<string, string>()
  for (const [paciente, porUnidade] of contagem) {
    const melhor = [...porUnidade.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    if (melhor) resultado.set(paciente, melhor[0])
  }
  return resultado
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
