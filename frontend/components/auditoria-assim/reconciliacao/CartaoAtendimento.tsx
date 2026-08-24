'use client'

import { createElement, memo } from 'react'
import { AlertOctagon, Ban, CheckCircle2, KeySquare, Link2, type LucideIcon } from 'lucide-react'
import { autorizacaoCancelada, autorizacaoLiberada } from '@/hooks/useAnaliseReincidencia'
import { iconeTerapia } from '@/lib/cronograma/iconeTerapia'
import { completarMotivoGlosa, lerMotivoGlosa } from '@/lib/glosa'
import { resolverConfig } from '../SituacaoBadge'
import type { CartaoGrade } from '../types'
import { cartaoPendente } from './grade'

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
 * Nenhum matiz novo entrou. "Sem cobertura" não ganha cor própria: é qualificador
 * da `situacao` que a sessão já tem, e sai escrito no matiz dela — do contrário
 * seria um sétimo significado brigando com a Status Lock Rule do DESIGN.md.
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
}: {
  hora: string
  terapia: string | null
  rotulo: string
  tinta: string
  Icone: LucideIcon
  teveToken: boolean | null
  token: string | null
  titulo: string
}) {
  return (
    <div className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5" title={titulo}>
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
    </div>
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
      {terapia && (
        <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-tight font-medium text-slate-700">
          <IconeDaTerapia terapia={terapia} />
          <span className="line-clamp-2">{terapia}</span>
        </p>
      )}
      {/* A cor nunca é o único sinal: o problema vem escrito, no matiz dele. */}
      <p className={`mt-1 text-[11px] leading-tight font-semibold ${tinta}`}>{frase}</p>
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

const CartaoAtendimento = memo(function CartaoAtendimento({
  cartao,
  codigosGlosa,
  podeVincular,
  onVincular,
}: {
  cartao: CartaoGrade
  codigosGlosa: Map<string, string>
  podeVincular: boolean
  /** Só chamado por cartão de guia sem vínculo. */
  onVincular: (guia: string) => void
}) {
  if (cartao.tipo === 'sessao') {
    const config = resolverConfig(cartao.situacao ?? '—')
    const pendente = cartaoPendente(cartao)
    const titulo = [cartao.hora, cartao.terapia, cartao.legenda, config.label]
      .filter(Boolean)
      .join(' · ')

    if (!pendente) {
      // "Liberada" em esmeralda, "Falta" em stone, "Cancelada" em cinza — todas
      // escritas, todas no matiz do próprio estado, que sai de SITUACAO_CONFIG.
      return (
        <Compacto
          hora={cartao.hora}
          terapia={cartao.terapia}
          rotulo={config.label}
          tinta={config.strong}
          Icone={config.icon}
          teveToken={cartao.teve_token}
          token={cartao.token}
          titulo={titulo}
        />
      )
    }

    // "Sem cobertura" é qualificador da situação, não estado próprio — por isso
    // uma frase só, no matiz da situação. Duas linhas no mesmo matiz diriam o
    // mesmo fato duas vezes, e um matiz próprio inventaria um sétimo
    // significado que a Status Lock Rule não admite.
    const frase = cartao.semCobertura ? `${config.label} · sem cobertura` : config.label
    const motivo =
      completarMotivoGlosa(lerMotivoGlosa(cartao.motivoBruto), codigosGlosa)?.descricao ?? null

    return (
      <div
        tabIndex={0}
        title={`${titulo}${cartao.semCobertura ? ' · sem cobertura' : ''}`}
        className={`relative w-full min-w-0 rounded-lg border py-2 pr-2 pl-2.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none ${config.surface}`}
      >
        <Espinha dot={config.dot} />
        <Cabecalho
          hora={cartao.hora}
          tinta={config.strong}
          Icone={config.icon}
          teveToken={cartao.teve_token}
          token={cartao.token}
        />
        <CorpoPendente
          terapia={cartao.terapia}
          frase={frase}
          tinta={config.strong}
          codigo={cartao.codigo_tuss}
          guia={cartao.guia}
          motivo={motivo}
        />
      </div>
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
        titulo={[tituloBase, cartao.terapia, motivo ?? rotulo].filter(Boolean).join(' · ')}
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
    </>
  )

  // O rótulo E a ação são o mesmo controle: "sem vínculo" descreve o estado, e
  // clicar nele é o que se faz a respeito. Guia que não pede nada não é botão —
  // um controle que não leva a lugar nenhum ensina a ignorar os que levam.
  if (semVinculo) {
    return (
      <button
        type="button"
        onClick={() => onVincular(cartao.guia)}
        disabled={!podeVincular}
        title={
          podeVincular
            ? `${tituloBase} — ver as sessões que ela pode cobrir`
            : 'Seu perfil não permite vincular autorizações'
        }
        className={`relative w-full min-w-0 rounded-lg border py-2 pr-2 pl-2.5 text-left transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${tom}`}
      >
        {miolo}
      </button>
    )
  }

  // Excedente sem estar na fila: nada a clicar, mas a tela precisa dizer que
  // esta é a liberação que passou do agendado.
  return (
    <div
      tabIndex={0}
      title={`${tituloBase} — liberação além das sessões agendadas deste TUSS na semana`}
      className={`relative w-full min-w-0 rounded-lg border py-2 pr-2 pl-2.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none ${tom}`}
    >
      {miolo}
    </div>
  )
})

export default CartaoAtendimento
