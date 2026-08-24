'use client'

import { createElement, memo, type ReactNode } from 'react'
import {
  AlertCircle, AlertOctagon, Ban, CalendarClock, CheckCircle2, KeySquare, Link2,
  type LucideIcon,
} from 'lucide-react'
import { autorizacaoCancelada, autorizacaoLiberada } from '@/hooks/useAnaliseReincidencia'
import { iconeTerapia } from '@/lib/cronograma/iconeTerapia'
import { completarMotivoGlosa, lerMotivoGlosa } from '@/lib/glosa'
import { resolverConfig } from '../SituacaoBadge'
import type { CartaoGrade } from '../types'
import { SITUACOES_COBERTAS, SITUACOES_SEM_SESSAO } from './cobertura'
import { cartaoPendente } from './grade'
import { distanciaCurta, distanciaPorExtenso, type PapelNaSelecao } from './vinculo'

/**
 * Um atendimento dentro de uma célula da grade — e, desde 2026-08-24, em DUAS
 * espécies com silhuetas diferentes.
 *
 * O problema que isto resolve: antes todo cartão tinha o mesmo tamanho, as
 * mesmas cinco linhas e a mesma borda, e a única diferença entre "está tudo
 * certo" e "isto aqui está quebrado" era o matiz de um fundo `-50`. Com seis
 * matizes em jogo, a 11px, em caixas de 150px, numa grade de ~55 células, a cor
 * parou de discriminar: a semana virava uma colcha de retalhos onde as duas
 * pendências reais se escondiam entre vinte cartões saudáveis.
 *
 * A troca é de CANAL. O que separa as duas espécies agora é a silhueta, que o
 * olho resolve antes de processar cor:
 *
 * - **compacto** (a maioria — liberada, glosa já resolvida, falta, cancelada,
 *   sessão que ainda nem venceu): duas linhas, fundo branco, sem TUSS, sem guia
 *   e sem rótulo comprido. Uma sessão que está certa não precisa ser lida;
 *   precisa ocupar o slot para a semana continuar se lendo como semana. Os
 *   números seguem no `title` e no histórico — eles só servem quando algo está
 *   errado, porque guia se digita no portal da ASSIM para contestar.
 * - **pendente** (a minoria): corpo inteiro, barra lateral de 3px, o problema
 *   escrito por extenso e o botão quando há ação.
 *
 * Em produção quase todo par (paciente, TUSS) da semana fecha
 * `agendadas == autorizadas == liberadas`, então ~85% dos cartões colapsam e os
 * dois ou três que sobram viram os únicos objetos altos da tela.
 *
 * Nenhum matiz novo entrou, e o cartão só tem DUAS manchetes de problema:
 * "Glosa" (violeta, uma recusa que pede tratativa) e "Sem cobertura" (rose, "a
 * lacuna mais larga" do DESIGN.md — a sessão aconteceu e nada a cobre). Por que
 * a sessão está descoberta — não solicitada, solicitação cancelada, retorno não
 * confirmado, sincronizando — é pergunta da gaveta, que tem largura para
 * responder; numa célula de 11rem a resposta só cabe truncada.
 *
 * Nada abaixo de 11px, que é o piso do DESIGN.md §3. O rótulo de estado e a
 * linha do token estavam em 10px; o token virou glifo e as linhas que sobravam
 * foram fundidas, em vez de encolhidas.
 */

/** Rótulo curto do que a ASSIM devolveu numa guia que não casou com sessão. */
function rotuloAutorizacao(status: string | null): string {
  if (autorizacaoCancelada(status)) return 'Cancelada'
  if (autorizacaoLiberada(status)) return 'Outra semana'
  return 'Glosa'
}

/**
 * O ícone da especialidade, resolvido pelo nome da terapia.
 *
 * Componente próprio, e `createElement` em vez de `<Icone />`: a tabela devolve
 * um componente escolhido em tempo de render, e montá-lo como elemento JSX de
 * uma variável local é o que a regra `react-hooks/static-components` proíbe —
 * com razão no caso geral, ainda que aqui a referência venha de um mapa fixo.
 */
function IconeDaTerapia({ terapia }: { terapia: string }) {
  return createElement(iconeTerapia(terapia), {
    size: 11,
    className: 'mt-px shrink-0 text-slate-400',
    'aria-hidden': true,
  })
}

/**
 * O cabeçalho comum às duas espécies: a hora à esquerda, o estado à direita.
 *
 * A hora fica na mesma altura em todo cartão para que a coluna do dia possa ser
 * varrida de cima a baixo sem reler cada caixa — é o que sobrou do antigo
 * `Miolo`, e é a única parte dele que as duas espécies compartilham.
 */
function Cabecalho({
  hora,
  tinta,
  Icone,
  teveToken,
  token,
}: {
  hora: string
  tinta: string
  Icone: LucideIcon
  teveToken: boolean | null
  token: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span className="text-[13px] leading-tight font-semibold tabular-nums text-slate-900">
        {hora}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {/* Glifo, e não linha própria: o token é dado de conferência de filipeta,
            um eixo diferente do estado da autorização, e gastava a quinta linha
            do cartão a 10px para dizer o que um ícone com `title` já diz. */}
        {/* Âmbar, e não slate: a filipeta é o terceiro eixo do vocabulário
            (DESIGN.md), onde âmbar já significa "a conferir" — e em slate-400 o
            glifo de 11px sumia dentro do cartão. `-600` e não `-700` porque o
            que se pediu foi laranja visível, e o degrau -700 lê como ferrugem;
            como glifo ele responde ao piso de 3:1 de elemento não-textual, não
            ao de 4,5:1 de texto. */}
        {teveToken && (
          <KeySquare size={12} className="text-amber-600" aria-label={`filipeta ${token ?? ''}`} />
        )}
        <Icone size={13} strokeWidth={2.25} className={tinta} aria-hidden />
      </span>
    </div>
  )
}

/**
 * A tarja que o modo de vínculo acrescenta ao pé do cartão.
 *
 * Ela carrega a DISTÂNCIA — as horas entre a sessão e o instante em que a ASSIM
 * registrou a guia. É o critério da reconciliação, e no modal que este modo
 * aposentou ele era o dado mais escondido da tela: 11px cinza, encostado no
 * número da guia, no canto direito de uma linha de lista.
 *
 * Steel, e só steel, no cartão escolhível: "esta é a que você pode clicar" é
 * seleção, não estado clínico — o matiz semântico do cartão continua sendo do
 * cartão. A candidata já coberta veste slate e some do primeiro plano sem sair
 * da tela, porque é justamente ela que revela a guia extra.
 */
function Tarja({ papel, distancia }: { papel: PapelNaSelecao; distancia: number | null }) {
  if (papel === 'inerte') return null

  const conteudo: Record<'foco' | 'alvo' | 'coberta', { Icone: LucideIcon; texto: string }> = {
    foco: { Icone: Link2, texto: 'Esta guia' },
    alvo: { Icone: Link2, texto: 'Esta sessão' },
    coberta: { Icone: CheckCircle2, texto: 'já coberta' },
  }
  const { Icone, texto } = conteudo[papel]
  const alvo = papel === 'alvo'

  return (
    <p
      className={`mt-1.5 flex items-center justify-between gap-1.5 border-t pt-1 text-[11px] leading-tight font-semibold ${
        alvo ? 'border-brand text-brand-fg' : 'border-slate-200 text-slate-500'
      }`}
    >
      <span className="truncate tabular-nums">{distanciaCurta(distancia) ?? ''}</span>
      <span className="flex shrink-0 items-center gap-1">
        <Icone size={11} aria-hidden />
        {texto}
      </span>
    </p>
  )
}

/**
 * A espécie compacta: duas linhas e nada mais.
 *
 * A segunda linha diz as duas coisas de uma vez — a TERAPIA à esquerda e o
 * RÓTULO do estado à direita, embaixo do ícone que ele repete. O rótulo escrito
 * é o que a regra do vocabulário exige (cor nunca é o único sinal): um ✓ verde
 * sozinho pede que a pessoa saiba de cor que verde é "Liberada", e é justamente
 * a leitura de relance que o cartão compacto existe para servir.
 *
 * Antes só uma das duas aparecia, conforme o estado fosse ou não a notícia. Sai
 * mais barato mostrar as duas: a terapia trunca, o rótulo é curto e não encolhe.
 */
function Compacto({
  hora,
  terapia,
  rotulo,
  tinta,
  Icone,
  teveToken,
  token,
  titulo,
  onAbrir,
  desabilitado,
  inerte,
  tarja,
}: {
  hora: string
  terapia: string | null
  rotulo: string
  tinta: string
  Icone: LucideIcon
  teveToken: boolean | null
  token: string | null
  titulo: string
  /** Todo cartão abre o detalhe — ver a nota do componente. */
  onAbrir: () => void
  desabilitado?: boolean
  /** Modo de vínculo: este cartão não é candidato nem é a guia em foco. */
  inerte?: boolean
  tarja?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={desabilitado}
      title={titulo}
      className={`w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none ${
        inerte ? 'opacity-35' : ''
      } ${desabilitado ? '' : 'hover:border-slate-300 hover:bg-slate-50'}`}
    >
      <Cabecalho hora={hora} tinta={tinta} Icone={Icone} teveToken={teveToken} token={token} />
      <p className="mt-0.5 flex items-start justify-between gap-1.5 text-[11px] leading-tight">
        {terapia && (
          <span className="flex min-w-0 items-start gap-1 text-slate-600">
            <IconeDaTerapia terapia={terapia} />
            <span className="truncate">{terapia}</span>
          </span>
        )}
        <span className={`shrink-0 font-semibold ${tinta}`}>{rotulo}</span>
      </p>
      {tarja}
    </button>
  )
}

/**
 * O corpo da espécie pendente: o que está errado, em quê, e com qual número.
 *
 * A ordem é a da pergunta que se faz: quando (cabeçalho), em que terapia, o que
 * há de errado, e só então os identificadores — que existem para ser digitados
 * no portal da ASSIM, não para serem lidos de relance.
 */
function CorpoPendente({
  terapia,
  frase,
  tinta,
  codigo,
  guia,
  motivo,
}: {
  terapia: string | null
  frase: string
  tinta: string
  codigo: string | null
  guia: string | null
  motivo: string | null
}) {
  return (
    <>
      {/* Terapia à esquerda, estado à direita — a MESMA disposição do cartão
          compacto. O estado morava numa linha própria abaixo, e isso fazia o
          rótulo pular de altura conforme o cartão: no compacto ele estava no
          canto direito da segunda linha, no pendente duas linhas mais abaixo e
          à esquerda. Varrer uma coluna com o mesmo dado em dois lugares obriga
          a reler cada cartão. Agora o estado está sempre no mesmo canto, e é a
          terapia que trunca — ela sobrevive inteira no `title`. */}
      <p className="mt-0.5 flex items-start justify-between gap-1.5 text-[11px] leading-tight">
        {terapia && (
          <span className="flex min-w-0 items-start gap-1 font-medium text-slate-700">
            <IconeDaTerapia terapia={terapia} />
            <span className="truncate">{terapia}</span>
          </span>
        )}
        {/* A cor nunca é o único sinal: o problema vem escrito, no matiz dele. */}
        <span className={`shrink-0 text-right font-semibold ${tinta}`}>{frase}</span>
      </p>
      {/* Código e guia na MESMA linha: são os dois identificadores do mesmo
          atendimento, e a grade por horário não tem altura para dar a cada um. */}
      <p className="mt-1 font-mono text-[11px] leading-tight tabular-nums text-slate-600">
        {codigo ?? '—'}
        {guia && <span className="text-slate-400"> · </span>}
        {guia}
      </p>
      {motivo && (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-slate-500">{motivo}</p>
      )}
    </>
  )
}

/** A barra lateral de 3px — o mesmo dispositivo que `SituacaoBloco` já usa. */
function Espinha({ dot }: { dot: string }) {
  return <span aria-hidden className={`absolute inset-y-0 left-0 w-0.75 rounded-l-lg ${dot}`} />
}

/**
 * Todo cartão é um botão, e todo botão abre a MESMA coisa: o detalhe.
 *
 * Até 2026-08-24 só a guia órfã era clicável — ela levava direto à escolha da
 * sessão — e os outros vinte cartões da semana não faziam nada. Uma grade em que
 * um cartão em vinte responde ao clique ensina a não clicar em nenhum, e ainda
 * escondia num gesto exclusivo os dados que a pessoa precisava conferir (motivo
 * da recusa por extenso, quem solicitou, se a filipeta foi conferida).
 *
 * Agora o gesto é um só e as ações moram na gaveta, onde há espaço para dizer o
 * que cada uma faz. Ver `DetalheCartao`.
 */
const CartaoAtendimento = memo(function CartaoAtendimento({
  cartao,
  codigosGlosa,
  onAbrir,
  papel,
  distanciaSelecao,
}: {
  cartao: CartaoGrade
  codigosGlosa: Map<string, string>
  onAbrir: (cartao: CartaoGrade) => void
  /**
   * O papel deste cartão no modo de vínculo. Ausente = modo normal.
   *
   * Primitivos, e não um objeto `selecao`, porque este componente é `memo`: um
   * objeto recriado a cada render derrubaria a comparação rasa das ~55 células
   * mesmo fora do modo de vínculo, que é quando a grade rola.
   */
  papel?: PapelNaSelecao
  distanciaSelecao?: number | null
}) {
  // Duas coisas diferentes, e por isso duas variáveis. No modo de vínculo o
  // ÚNICO cartão que aceita clique é o alvo — abrir a gaveta de detalhe no meio
  // de uma escolha trocaria a pergunta debaixo da mão de quem está decidindo.
  // Mas só o cartão fora da janela ESMAECE: a candidata já coberta precisa
  // continuar legível, porque é ela que revela que a guia é extra.
  const desabilitado = papel !== undefined && papel !== 'alvo'
  const inerte = papel === 'inerte'
  const tarja = papel ? <Tarja papel={papel} distancia={distanciaSelecao ?? null} /> : null
  // No modo de vínculo o `title` responde à pergunta do modo, não à do cartão.
  const tituloSelecao =
    papel === 'alvo'
      ? (distanciaPorExtenso(distanciaSelecao ?? null) ?? 'vincular a guia a esta sessão')
      : papel === 'coberta'
        ? 'esta sessão já está coberta — não pode receber a guia'
        : papel === 'foco'
          ? 'a guia que está sendo vinculada'
          : papel === 'inerte'
            ? 'fora da janela de busca desta guia'
            : null

  if (cartao.tipo === 'sessao') {
    const config = resolverConfig(cartao.situacao ?? '—')
    const pendente = cartaoPendente(cartao)
    const titulo = [cartao.hora, cartao.terapia, cartao.legenda, config.label]
      .filter(Boolean)
      .join(' · ')

    if (!pendente) {
      /*
        A sessão que AINDA NÃO ACONTECEU não veste o vocabulário da auditoria.

        "Não Solicitada" é rótulo de auditoria e nasce vermelho, porque depois do
        atendimento não ter pedido autorização é a lacuna mais larga que existe.
        Antes do atendimento é o estado normal — a autorização se tira na hora —,
        e a tela pintava de rose a agenda inteira de quinta e sexta, dizendo que
        havia erro onde não havia nada ainda.

        Então enquanto não decorre, e enquanto ninguém liberou, o cartão diz o
        que de fato é: "Agendada", em slate. Nenhum matiz novo — slate já é
        "nenhum status registrado" no DESIGN.md — e nenhuma situação nova em
        SITUACAO_CONFIG: é só esta tela escolhendo não gritar cedo demais.
      */
      const aguardando =
        !cartao.decorrida &&
        !SITUACOES_SEM_SESSAO.has(cartao.situacao ?? '') &&
        (cartao.situacao ?? '') !== 'CANCELADA' &&
        !SITUACOES_COBERTAS.has(cartao.situacao ?? '')

      return (
        <Compacto
          hora={cartao.hora}
          terapia={cartao.terapia}
          rotulo={aguardando ? 'Agendada' : config.label}
          tinta={aguardando ? 'text-slate-500' : config.strong}
          Icone={aguardando ? CalendarClock : config.icon}
          teveToken={cartao.teve_token}
          token={cartao.token}
          titulo={tituloSelecao ?? (aguardando ? `${titulo} · ainda não aconteceu` : titulo)}
          onAbrir={() => onAbrir(cartao)}
          desabilitado={desabilitado}
          inerte={inerte}
          tarja={tarja}
        />
      )
    }

    /*
      Duas manchetes, e só duas: "Glosa" e "Sem cobertura".

      A frase era composta — "Não Solicitada · sem cobertura", "Glosa · sem
      cobertura" — e dizia o mesmo fato duas vezes num espaço onde não cabe
      nem uma. Quem lê a grade precisa saber SE está descoberta; POR QUE (não
      solicitada, solicitação cancelada, retorno não confirmado, sincronizando)
      é pergunta da gaveta, que tem largura para responder.

      Glosa é a exceção porque não é uma variedade de "descoberta": é uma
      recusa, o único estado aqui que pede tratativa em vez de solicitação, e
      por isso mantém o nome e o violeta.

      "Sem cobertura" veste ROSE, sempre, seja qual for a situação por baixo.
      Rose é "a lacuna mais larga" no DESIGN.md e é exatamente isso — a sessão
      aconteceu e nada a cobre. Sem esse alinhamento a mesma manchete sairia em
      três matizes conforme o estado que ela acabou de deixar de mostrar.
    */
    const descoberta = cartao.semCobertura && cartao.situacao !== 'GLOSA'
    const frase = descoberta ? 'Sem cobertura' : config.label
    const tinta = descoberta ? 'text-rose-700' : config.strong
    const superficie = descoberta ? 'border-rose-200 bg-rose-50' : config.surface
    const dot = descoberta ? 'bg-rose-500' : config.dot
    const Icone = descoberta ? AlertCircle : config.icon
    const motivo =
      completarMotivoGlosa(lerMotivoGlosa(cartao.motivoBruto), codigosGlosa)?.descricao ?? null

    return (
      <button
        type="button"
        onClick={() => onAbrir(cartao)}
        disabled={desabilitado}
        title={tituloSelecao ?? `${titulo}${cartao.semCobertura ? ' · sem cobertura' : ''}`}
        className={`relative w-full min-w-0 rounded-lg border py-2 pr-2 pl-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none ${superficie} ${
          inerte ? 'opacity-35' : ''
        } ${
          desabilitado ? '' : 'hover:brightness-97'
        }`}
      >
        <Espinha dot={dot} />
        <Cabecalho
          hora={cartao.hora}
          tinta={tinta}
          Icone={Icone}
          teveToken={cartao.teve_token}
          token={cartao.token}
        />
        <CorpoPendente
          terapia={cartao.terapia}
          frase={frase}
          tinta={tinta}
          codigo={cartao.codigo_tuss}
          guia={cartao.guia}
          motivo={motivo}
        />
        {tarja}
      </button>
    )
  }

  const cancelada = autorizacaoCancelada(cartao.status)
  const liberada = autorizacaoLiberada(cartao.status)
  const semVinculo = cartao.estado === 'sem-vinculo'
  // Estourar a cota é pendência mesmo quando a guia não está na fila de órfãs:
  // é o excedente que provoca a glosa 1601, e ele existia só como `+1` num chip
  // do placar — um número que a grade não tinha como apontar.
  const pendente = cartaoPendente(cartao)

  // Mesmo parser que a Conferência e a Central usam: numa recusa o `status`
  // vem "1601-REINCIDENCIA NO ATEN" (cortado em 25 caracteres) e o de-para
  // completa o que a ASSIM truncou.
  const motivo =
    liberada || cancelada
      ? null
      : (cartao.descricao_erro ??
        completarMotivoGlosa(lerMotivoGlosa(cartao.status), codigosGlosa)?.descricao ??
        null)

  // Cota divergente é âmbar pelo mesmo motivo que a chip do placar é âmbar
  // (DESIGN.md, o terceiro eixo): âmbar significa "esperando alguém olhar" nos
  // três eixos desta tela, e o excedente é exatamente isso.
  const tom = pendente
    ? 'border-amber-300 bg-amber-50'
    : cancelada || liberada
      ? 'border-slate-200 bg-slate-50'
      : 'border-violet-200 bg-violet-50'
  const tinta = pendente
    ? 'text-amber-700'
    : cancelada || liberada
      ? 'text-slate-600'
      : 'text-violet-700'
  const dot = pendente ? 'bg-amber-500' : 'bg-violet-500'
  const Icone = pendente ? Link2 : cancelada ? Ban : liberada ? CheckCircle2 : AlertOctagon

  const rotulo = semVinculo ? 'Sem vínculo' : rotuloAutorizacao(cartao.status)
  // Excedente que não está na fila SUBSTITUI o rótulo em vez de qualificá-lo:
  // "Outra semana · além do agendado" se contradiz — "outra semana" afirma que a
  // guia não encosta nesta semana, e "além do agendado" fala da cota desta
  // semana. Quando ela também é órfã, aí sim os dois fatos convivem: há o que
  // vincular E ela passou da cota.
  const frase = cartao.excedente
    ? semVinculo
      ? 'Sem vínculo · além do agendado'
      : 'Liberada além do agendado'
    : rotulo
  const tituloBase = `Guia ${cartao.guia}, autorizada às ${cartao.hora}`

  if (!pendente) {
    // Guia recusada que não está na fila e não estourou cota: a recusa continua
    // sendo o assunto, então ela vai no rótulo — mas sem gastar altura de
    // pendência, porque não há o que fazer a respeito nesta tela.
    return (
      <Compacto
        hora={cartao.hora}
        terapia={cartao.terapia}
        rotulo={rotulo}
        tinta={tinta}
        Icone={Icone}
        teveToken={cartao.teve_token}
        token={cartao.token}
        titulo={
          tituloSelecao ?? [tituloBase, cartao.terapia, motivo ?? rotulo].filter(Boolean).join(' · ')
        }
        onAbrir={() => onAbrir(cartao)}
        desabilitado={desabilitado}
        inerte={inerte}
        tarja={tarja}
      />
    )
  }

  const miolo = (
    <>
      <Espinha dot={dot} />
      <Cabecalho
        hora={cartao.hora}
        tinta={tinta}
        Icone={Icone}
        teveToken={cartao.teve_token}
        token={cartao.token}
      />
      <CorpoPendente
        terapia={cartao.terapia}
        frase={frase}
        tinta={tinta}
        codigo={cartao.codigo_tuss}
        guia={cartao.guia}
        motivo={motivo}
      />
      {tarja}
    </>
  )

  return (
    <button
      type="button"
      onClick={() => onAbrir(cartao)}
      disabled={desabilitado}
      title={
        tituloSelecao ??
        `${tituloBase} — ${
          semVinculo ? 'ver o que ela pode cobrir' : 'liberação além das sessões agendadas do TUSS'
        }`
      }
      className={`relative w-full min-w-0 rounded-lg border py-2 pr-2 pl-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none ${tom} ${
        inerte ? 'opacity-35' : ''
      } ${
        desabilitado ? '' : 'hover:brightness-97'
      }`}
    >
      {miolo}
    </button>
  )
})

export default CartaoAtendimento
