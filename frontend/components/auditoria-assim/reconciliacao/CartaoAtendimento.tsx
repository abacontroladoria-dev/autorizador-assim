'use client'

import { createElement, memo } from 'react'
import { AlertOctagon, Ban, CheckCircle2, KeySquare, Link2, type LucideIcon } from 'lucide-react'
import { autorizacaoCancelada, autorizacaoLiberada } from '@/hooks/useAnaliseReincidencia'
import { iconeTerapia } from '@/lib/cronograma/iconeTerapia'
import { completarMotivoGlosa, lerMotivoGlosa } from '@/lib/glosa'
import { resolverConfig } from '../SituacaoBadge'
import type { CartaoGrade } from '../types'

/**
 * Um atendimento dentro de uma célula da grade — a menor unidade legível da tela.
 *
 * Quatro linhas fixas, sempre na mesma ordem, porque a leitura é de relance e a
 * posição é o que torna a varredura possível: horário (o que ancora na agenda),
 * terapia (o que identifica o atendimento), código + guia (o que a cota conta e
 * o que se digita no portal) e o estado por extenso.
 *
 * A terapia entrou aqui quando a grade passou a ser indexada por horário: ela era
 * o cabeçalho da linha, e sem ela no cartão o atendimento chegaria ao olho como
 * dois números sem assunto. O ícone é o MESMO mapa do cronograma
 * (`lib/cronograma/iconeTerapia`) — duas cópias divergiriam na primeira terapia
 * nova.
 *
 * O estado chega por superfície + ícone + rótulo — nunca por cor sozinha, que é a
 * regra do vocabulário em SituacaoBadge. E o matiz não é escolhido aqui: vem de
 * `SITUACAO_CONFIG`, o mesmo mapa que pinta o badge da Conferência. Glosa segue
 * violeta e não vermelha — violeta é semântico e travado (DESIGN.md, Status Lock
 * Rule), e repintá-la de rose a confundiria com NAO_SOLICITADA, que é a outra
 * pendência desta mesma tela.
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
 * O miolo comum às duas espécies de cartão.
 *
 * Existe para que sessão e autorização tenham a MESMA anatomia: numa agenda, dois
 * cartões vizinhos com a hora em alturas diferentes obrigam o olho a reler cada
 * um em vez de varrer a coluna.
 */
function Miolo({
  hora,
  terapia,
  codigo,
  guia,
  rotulo,
  tinta,
  Icone,
  teveToken,
  token,
}: {
  hora: string
  terapia: string | null
  codigo: string | null
  guia: string | null
  rotulo: string
  /** Classe de cor do estado — aplicada ao ícone e ao rótulo, nunca ao dado. */
  tinta: string
  Icone: LucideIcon
  teveToken: boolean | null
  token: string | null
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[13px] leading-tight font-semibold tabular-nums text-slate-900">
          {hora}
        </span>
        <Icone size={13} strokeWidth={2.25} className={`mt-px shrink-0 ${tinta}`} aria-hidden />
      </div>
      {terapia && (
        <p className="mt-1 flex items-start gap-1 text-[11px] leading-tight font-medium text-slate-700">
          <IconeDaTerapia terapia={terapia} />
          <span className="line-clamp-2">{terapia}</span>
        </p>
      )}
      {/* Código e guia na MESMA linha: são os dois identificadores do mesmo
          atendimento, e separá-los custava uma linha de altura em cada cartão —
          altura que a grade por horário não tem para dar. */}
      <p className="mt-1 font-mono text-[11px] leading-tight tabular-nums text-slate-600">
        {codigo ?? '—'}
        {guia && <span className="text-slate-400"> · </span>}
        {guia}
      </p>
      {/* A cor nunca é o único sinal: o estado vem escrito, no matiz dele. */}
      <p className={`mt-1 truncate text-[10px] leading-tight font-semibold ${tinta}`}>{rotulo}</p>
      {teveToken && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] leading-tight text-slate-500">
          <KeySquare size={9} aria-hidden />
          {token ?? 'filipeta'}
        </p>
      )}
    </>
  )
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
    return (
      <div
        className={`w-full min-w-0 rounded-lg border px-2.5 py-2 ${config.surface}`}
        title={[cartao.hora, cartao.terapia, cartao.legenda, config.label].filter(Boolean).join(' · ')}
      >
        <Miolo
          hora={cartao.hora}
          terapia={cartao.terapia}
          codigo={cartao.codigo_tuss}
          guia={cartao.guia}
          rotulo={config.label}
          tinta={config.strong}
          Icone={config.icon}
          teveToken={cartao.teve_token}
          token={cartao.token}
        />
      </div>
    )
  }

  const cancelada = autorizacaoCancelada(cartao.status)
  const liberada = autorizacaoLiberada(cartao.status)
  const semVinculo = cartao.estado === 'sem-vinculo'

  // Mesmo parser que a Conferência e a Central usam: numa recusa o `status`
  // vem "1601-REINCIDENCIA NO ATEN" (cortado em 25 caracteres) e o de-para
  // completa o que a ASSIM truncou.
  const motivo =
    liberada || cancelada
      ? null
      : (cartao.descricao_erro ??
        completarMotivoGlosa(lerMotivoGlosa(cartao.status), codigosGlosa)?.descricao ??
        null)

  const tom = semVinculo
    ? 'border-amber-300 bg-amber-50'
    : cancelada || liberada
      ? 'border-slate-200 bg-slate-50'
      : 'border-violet-200 bg-violet-50'
  const tinta = semVinculo
    ? 'text-amber-700'
    : cancelada || liberada
      ? 'text-slate-600'
      : 'text-violet-700'
  const Icone = semVinculo ? Link2 : cancelada ? Ban : liberada ? CheckCircle2 : AlertOctagon

  const miolo = (
    <Miolo
      hora={cartao.hora}
      terapia={cartao.terapia}
      codigo={cartao.codigo_tuss}
      guia={cartao.guia}
      rotulo={semVinculo ? 'Sem vínculo' : rotuloAutorizacao(cartao.status)}
      tinta={tinta}
      Icone={Icone}
      teveToken={cartao.teve_token}
      token={cartao.token}
    />
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
            ? `Guia ${cartao.guia}, autorizada às ${cartao.hora} — ver as sessões que ela pode cobrir`
            : 'Seu perfil não permite vincular autorizações'
        }
        className={`w-full min-w-0 rounded-lg border px-2.5 py-2 text-left transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${tom}`}
      >
        {miolo}
      </button>
    )
  }

  return (
    <div
      className={`w-full min-w-0 rounded-lg border px-2.5 py-2 ${tom}`}
      title={
        motivo ??
        (cancelada
          ? 'Autorização desfeita — não consumiu cota'
          : liberada
            ? 'Não casa com sessão desta semana e não está na fila de reconciliação'
            : undefined)
      }
    >
      {miolo}
      {motivo && (
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-slate-500">{motivo}</p>
      )}
    </div>
  )
})

export default CartaoAtendimento
