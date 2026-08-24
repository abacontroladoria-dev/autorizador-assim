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
 * A única situação que é problema independentemente do relógio.
 *
 * Glosa é RESPOSTA da ASSIM: só existe depois de alguém ter pedido e ter sido
 * recusado, e uma recusa pede tratativa mesmo que a sessão ainda vá acontecer.
 *
 * Tudo o mais depende do relógio e por isso fica de fora. "Não solicitada" e
 * "solicitação cancelada" estavam aqui até 2026-08-24 e não deviam: numa sessão
 * que ainda nem aconteceu, não haver solicitação é o estado NORMAL — a
 * autorização se tira na hora do atendimento. A tela pintava de vermelho, e em
 * cartão alto, a agenda inteira de quinta e sexta. Quando essas situações
 * realmente viram problema — a sessão passou e ninguém cobriu — quem as promove
 * é o `semCobertura`, que já mede exatamente isso.
 */
const SITUACOES_PENDENTES = new Set(['GLOSA'])

/**
 * Este cartão pede trabalho?
 *
 * Uma definição só, porque três consomem: o cartão decide se veste a espécie
 * expandida, a faixa de semanas conta por ela, e o modal a usa para saber em que
 * semana abrir. Divergirem faria a faixa prometer "4 aqui" e a grade destacar
 * duas — que é o gênero de mentira que esta tela existe para caçar.
 */
export function cartaoPendente(c: CartaoGrade): boolean {
  if (c.tipo === 'sessao') return c.semCobertura || SITUACOES_PENDENTES.has(c.situacao ?? '')
  return c.estado === 'sem-vinculo' || c.excedente
}

/** Quanto dura uma sessão na clínica. É o passo da escala vertical. */
const DURACAO_SESSAO_MIN = 40

/**
 * A escala de 40 minutos da clínica: manhã 08:00–12:00, tarde 13:00–18:20.
 *
 * Declarada aqui e não importada de `lib/cronograma/constants.ts`
 * (`HORAS_GRID`): aquela lista dirige o ALGORITMO de cronograma e para às
 * 17:00, enquanto a tarde real vai até uma sessão que começa 17:40. Emprestá-la
 * jogaria toda sessão das 17:40 numa linha avulsa, e mexer nela para consertar
 * a exibição mudaria o que o algoritmo pode agendar. Duas listas com dois donos.
 *
 * O intervalo do almoço não é uma faixa vazia: ele simplesmente não existe na
 * escala, e a passagem de 11:20 para 13:00 aparece nos próprios rótulos.
 */
const FAIXAS = [
  '08:00', '08:40', '09:20', '10:00', '10:40', '11:20',
  '13:00', '13:40', '14:20', '15:00', '15:40', '16:20', '17:00', '17:40',
]

/**
 * Minutos desde a meia-noite. Nulo quando não é "HH:MM".
 *
 * Por fatia de string, como todo horário nesta tela: `hora_inicial` é `time` e
 * `data_execucao` é `timestamp without time zone` guardando hora de São Paulo —
 * passar qualquer um dos dois por `new Date()` é o caminho que já fez dois
 * campos da mesma linha discordarem em 3h.
 */
function emMinutos(hora: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hora)) return null
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
}

/**
 * A faixa de 40 minutos que contém este horário.
 *
 * Um horário só entra numa faixa se cair DENTRO dela (`[início, início+40)`) —
 * nunca "a maior faixa menor ou igual". A diferença aparece no almoço: com a
 * segunda regra, 12:30 cairia em 11:20 e seria lido como uma sessão das 11:20.
 *
 * O que não cabe em faixa nenhuma cai na hora cheia. Isso é para AUTORIZAÇÃO,
 * que é posicionada por `data_execucao` — o instante em que a ASSIM registrou,
 * que não tem por que respeitar a grade da clínica. Uma linha por minuto exato
 * encheria a escala de faixas de um cartão só; a hora cheia agrupa e continua
 * dizendo a verdade, porque nenhuma sessão pode ocupá-la.
 */
function faixaDe(hora: string): string {
  const minuto = emMinutos(hora)
  if (minuto === null) return SEM_HORA
  for (const faixa of FAIXAS) {
    const inicio = emMinutos(faixa)
    if (inicio !== null && minuto >= inicio && minuto < inicio + DURACAO_SESSAO_MIN) return faixa
  }
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
 * mostrava, chega aqui em `placar` e sai marcada nos cartões (`excedente`) — os
 * chips que a exibiam como número foram removidos a pedido em 2026-08-24.
 *
 * A escala vertical anda de 40 em 40 minutos, que é a duração de uma sessão
 * (ver `FAIXAS`). Era de hora em hora até 2026-08-24, e isso empilhava na mesma
 * linha duas sessões que aconteceram em horários diferentes — 09:20 e 09:40
 * viravam ambas "09:00", e a agenda deixava de dizer a que hora o paciente foi.
 *
 * Ela é CONTÍNUA entre a primeira e a última faixa que a semana de fato usa
 * (nunca a grade inteira fixa): uma faixa vazia no meio é informação — mostra o
 * buraco onde não houve atendimento —, mas faixas vazias além das pontas são só
 * rolagem.
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
    /** A sessão já ocorreu, coberta ou não. */
    decorrida: (s: AuditoriaAssimItem) => boolean
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
      faixa: faixaDe(hora),
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
        decorrida: marcas.decorrida(s),
        motivoBruto: s.descricao_erro ?? s.motivo_glosa,
        teve_token: s.teve_token,
        token: s.token,
        origem: s,
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
      faixa: faixaDe(hora),
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
        origem: a,
      },
    })
  }

  if (lancados.length === 0) return []

  const criar = (hora: string): LinhaGrade => ({
    hora,
    celulas: Object.fromEntries(dias.map((d) => [d, [] as CartaoGrade[]])),
  })

  const faixas = new Set(lancados.map((l) => l.faixa))

  // A escala é CONTÍNUA entre a primeira e a última faixa da clínica que a
  // semana de fato usa — as faixas vazias no meio são informação (o buraco onde
  // não houve atendimento), as de fora das pontas seriam só rolagem.
  //
  // As horas cheias que sobraram (autorização registrada fora da grade da
  // clínica) entram além dessa faixa, no lugar cronológico delas: elas existem,
  // e uma delas sumir levaria junto o cartão que a ocupava.
  const daClinica = FAIXAS.filter((f) => faixas.has(f))
  const escala = new Set<string>()
  if (daClinica.length > 0) {
    const de = FAIXAS.indexOf(daClinica[0])
    const ate = FAIXAS.indexOf(daClinica[daClinica.length - 1])
    for (let i = de; i <= ate; i += 1) escala.add(FAIXAS[i])
  }
  for (const f of faixas) {
    if (f !== SEM_HORA && !FAIXAS.includes(f)) escala.add(f)
  }

  const linhas: LinhaGrade[] = [...escala].sort((a, b) => a.localeCompare(b)).map(criar)
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
