import type {
  AuditoriaAssimItem,
  AutorizacaoAssimSemana,
  CartaoGrade,
  LinhaGrade,
  PlacarTuss,
} from '../types'
import type { EstadoAutorizacao } from './LinhaAutorizacao'
import { diaDoTimestamp, horaDoTimestamp } from './datas'

/** A faixa dos atendimentos cujo horário a origem não informou. Sempre a última. */
const SEM_HORA = '—'

/**
 * As situações que são problema independentemente do relógio.
 *
 * As que dependem dele — sincronizando, retorno não confirmado — ficam de fora
 * de propósito: dentro do prazo elas se resolvem sozinhas e não pedem nada, e
 * quando vencem o `semCobertura` já as promove. É o que evita a tela gritar por
 * uma solicitação enviada há dez minutos.
 */
const SITUACOES_PENDENTES = new Set(['NAO_SOLICITADA', 'SOLICITACAO_CANCELADA', 'GLOSA'])

/**
 * Este cartão pede trabalho?
 *
 * Uma definição só, porque três consomem: o cartão decide se veste a espécie
 * expandida, o navegador do rodapé decide o que percorrer, e a grade decide onde
 * pousar o anel. Divergirem faria o rodapé prometer "3 pendências" e a grade
 * mostrar duas destacadas — que é o gênero de mentira que esta tela caça.
 */
export function cartaoPendente(c: CartaoGrade): boolean {
  if (c.tipo === 'sessao') return c.semCobertura || SITUACOES_PENDENTES.has(c.situacao ?? '')
  return c.estado === 'sem-vinculo' || c.excedente
}

/**
 * "14:34" → "14:00". Nula quando não há hora para arredondar.
 *
 * Por fatia de string, como todo horário nesta tela: `hora_inicial` é `time` e
 * `data_execucao` é `timestamp without time zone` guardando hora de São Paulo —
 * passar qualquer um dos dois por `new Date()` é o caminho que já fez dois
 * campos da mesma linha discordarem em 3h.
 */
function faixaDaHora(hora: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(hora)) return null
  return `${hora.slice(0, 2)}:00`
}

/**
 * A semana do paciente como agenda: HORÁRIOS nas linhas, dias úteis nas colunas.
 *
 * O eixo vertical era o TUSS até 2026-08-21, e a troca não foi estética. A
 * pergunta que se faz de frente para esta tela é "em que dia e hora o paciente
 * foi atendido, e qual é a situação daquela autorização?" — e com o TUSS nas
 * linhas o mesmo dia aparecia repartido em quatro linhas distantes, obrigando a
 * remontar a agenda de cabeça. A cota por TUSS, que era o que a grade antiga
 * mostrava, não se perdeu: ela vive nos chips do painel de filtros, onde
 * `PlacarTuss` já a calculava.
 *
 * A escala vertical é CONTÍNUA entre a primeira e a última hora que a semana de
 * fato tem (nunca 00:00–23:00 fixo): uma faixa vazia no meio do dia é
 * informação — mostra o intervalo entre o turno da manhã e o da tarde —, mas
 * faixas vazias além das pontas são só rolagem.
 *
 * As duas espécies de cartão convivem de propósito, e não medem a mesma coisa:
 *
 * - a SESSÃO é posicionada pela `data_atendimento` + `hora_inicial` — quando o
 *   paciente foi;
 * - a AUTORIZAÇÃO sem par é posicionada por `data_execucao`, que é o instante em
 *   que a ASSIM a registrou no portal e **não** a data do atendimento (ver
 *   `reference_data_execucao_assim`). Uma guia autorizada quarta às 14:34 pode
 *   cobrir a sessão de segunda às 09:20 — por isso o cartão diz "autorizada em",
 *   e por isso escolher a sessão que ela cobre continua sendo um ato manual, no
 *   modal de vínculo.
 *
 * Guia PAREADA não vira cartão próprio: ela já está impressa no cartão da sessão
 * que cobriu. Repeti-la faria a mesma autorização aparecer duas vezes na semana
 * e inflaria visualmente uma cota que está correta.
 *
 * Duração não é representada porque não existe: `get_auditoria_assim` devolve
 * `hora_inicial` e não devolve hora final. Desenhar um bloco de 40 ou 60 minutos
 * aqui seria afirmar em pixels uma coisa que o dado não diz.
 *
 * `marcas` traz as duas espécies de pendência que só existiam como AGREGADO no
 * placar — "faltando" e "sobrando". Elas chegam decididas de fora, do mesmo
 * hook que conta as cinco colunas da listagem, e não recalculadas aqui: duas
 * definições fariam o cartão marcado e o número do topo discordarem sobre a
 * mesma semana, que é o tipo de divergência que esta tela existe para caçar.
 */
export function montarGrade(
  sessoes: AuditoriaAssimItem[],
  autorizacoes: AutorizacaoAssimSemana[],
  estadoDaGuia: (guia: string) => EstadoAutorizacao,
  dias: string[],
  placar: PlacarTuss[],
  marcas: {
    /** A sessão já ocorreu e ninguém a liberou. */
    descoberta: (s: AuditoriaAssimItem) => boolean
    /** As guias que passaram da cota do TUSS. */
    excedentes: ReadonlySet<string>
  }
): LinhaGrade[] {
  const diasValidos = new Set(dias)
  const terapiaDoTuss = new Map(placar.map((p) => [p.codigo_tuss, p.terapias]))
  const nomeDaTerapia = (codigo: string | null) => terapiaDoTuss.get(codigo ?? '—') || null

  const lancados: { dia: string; faixa: string; cartao: CartaoGrade }[] = []

  for (const s of sessoes) {
    const dia = s.data_atendimento ?? ''
    if (!diasValidos.has(dia)) continue
    const hora = s.hora_inicial?.slice(0, 5) ?? SEM_HORA
    lancados.push({
      dia,
      faixa: faixaDaHora(hora) ?? SEM_HORA,
      cartao: {
        tipo: 'sessao',
        chave: s.bloco_id ?? `${dia}-${hora}-${s.codigo_tuss}`,
        hora,
        codigo_tuss: s.codigo_tuss,
        guia: s.guia,
        situacao: s.situacao,
        terapia: s.terapias || nomeDaTerapia(s.codigo_tuss),
        legenda: s.profissionais ?? s.observacao ?? null,
        semCobertura: marcas.descoberta(s),
        motivoBruto: s.descricao_erro ?? s.motivo_glosa,
        teve_token: s.teve_token,
        token: s.token,
      },
    })
  }

  for (const a of autorizacoes) {
    const estado = estadoDaGuia(a.guia)
    if (estado === 'pareada') continue
    const dia = diaDoTimestamp(a.data_execucao) ?? ''
    if (!diasValidos.has(dia)) continue
    const hora = horaDoTimestamp(a.data_execucao)
    lancados.push({
      dia,
      faixa: faixaDaHora(hora) ?? SEM_HORA,
      cartao: {
        tipo: 'autorizacao',
        chave: `guia-${a.guia}-${a.data_execucao ?? ''}`,
        hora,
        codigo_tuss: a.codigo_tuss,
        guia: a.guia,
        terapia: nomeDaTerapia(a.codigo_tuss),
        estado,
        excedente: marcas.excedentes.has(a.guia),
        status: a.status,
        descricao_erro: a.descricao_erro,
        teve_token: a.teve_token,
        token: a.token,
      },
    })
  }

  if (lancados.length === 0) return []

  const criar = (hora: string): LinhaGrade => ({
    hora,
    celulas: Object.fromEntries(dias.map((d) => [d, [] as CartaoGrade[]])),
  })

  const faixas = new Set(lancados.map((l) => l.faixa))
  const cheias = [...faixas].filter((f) => f !== SEM_HORA).map((f) => Number(f.slice(0, 2)))

  const linhas: LinhaGrade[] = []
  if (cheias.length > 0) {
    for (let h = Math.min(...cheias); h <= Math.max(...cheias); h += 1) {
      linhas.push(criar(`${String(h).padStart(2, '0')}:00`))
    }
  }
  // Atendimento sem horário existe (falta sintetizada, guia com `data_execucao`
  // truncada) e some da tela se não tiver faixa. Vai para o pé da escala, onde
  // não empurra a agenda real para baixo.
  if (faixas.has(SEM_HORA)) linhas.push(criar(SEM_HORA))

  const porFaixa = new Map(linhas.map((l) => [l.hora, l]))
  for (const { dia, faixa, cartao } of lancados) porFaixa.get(faixa)?.celulas[dia].push(cartao)

  // Dentro da célula, o minuto exato ordena — é o que faz dois atendimentos na
  // mesma faixa se lerem na ordem em que aconteceram.
  for (const linha of linhas) {
    for (const dia of dias) {
      linha.celulas[dia].sort((a, b) => a.hora.localeCompare(b.hora))
    }
  }

  return linhas
}
