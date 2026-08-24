'use client'

import { memo } from 'react'
import { KeySquare, Link2 } from 'lucide-react'
import { autorizacaoCancelada, autorizacaoLiberada } from '@/hooks/useAnaliseReincidencia'
import { completarMotivoGlosa, lerMotivoGlosa } from '@/lib/glosa'
import type { AutorizacaoAssimSemana } from '../types'
import { horaDoTimestamp } from './datas'

/**
 * O que se sabe sobre o destino de uma autorização da semana.
 *
 * `sem-vinculo` é a única que autoriza ação, e ela NÃO é calculada aqui: vem de
 * `get_guias_orfas`, a mesma função que alimenta a fila — que exclui guia já
 * triada antes do `row_number()`, exclui guia capturada pelo próprio Pulsar e só
 * considera `status = 'Liberado'`. Uma segunda definição de órfã no cliente
 * ofereceria para vincular guia que a Conferência já considera casada.
 *
 * `fora-da-semana` é o que sobra: a guia não encosta em nenhuma sessão desta
 * semana, mas também não está na fila. Pode estar pareada a uma sessão da semana
 * vizinha, já ter sido triada, ou ser guia do próprio Pulsar. É afirmação honesta
 * e diferente de "precisa de vínculo" — por isso não veste matiz de estado.
 */
export type EstadoAutorizacao = 'sem-vinculo' | 'fora-da-semana' | 'pareada'

const LinhaAutorizacao = memo(function LinhaAutorizacao({
  item,
  estado,
  podeVincular,
  codigosGlosa,
  onVincular,
}: {
  item: AutorizacaoAssimSemana
  estado: EstadoAutorizacao
  podeVincular: boolean
  codigosGlosa: Map<string, string>
  onVincular: () => void
}) {
  const liberada = autorizacaoLiberada(item.status)
  // `Liberado *` é o rótulo da ASSIM para autorização desfeita. Ela não gastou
  // cota e não pede nada de ninguém — daí o cinza, e não o violeta da recusa:
  // cancelada não é glosa, e pintá-la de violeta mandaria contestar o que não
  // foi negado.
  const cancelada = autorizacaoCancelada(item.status)
  // O mesmo parser que a Central e a auditoria usam. Numa recusa, o `status`
  // desta tabela vem no formato "1601-REINCIDENCIA NO ATEN" — código, hífen,
  // texto cortado em 25 caracteres —, e o de-para completa o que a ASSIM cortou.
  // `descricao_erro` vem antes porque, quando existe, é o texto que o próprio
  // relatório trouxe; na prática ele é nulo em 100% das linhas de produção.
  const motivo = liberada || cancelada
    ? null
    : (item.descricao_erro ??
      completarMotivoGlosa(lerMotivoGlosa(item.status), codigosGlosa)?.descricao ??
      null)

  // O estado da linha vive no perímetro inteiro — nunca num trilho lateral, que
  // o DESIGN.md proíbe. A que precisa de trabalho se destaca; o resto recua para
  // o branco.
  const perimetro =
    estado === 'sem-vinculo' ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:gap-3 lg:py-2 ${perimetro}`}
    >
      {/* Mesmas larguras apertadas da coluna ao lado, e pelo mesmo motivo: com a
          fila aberta num 1280 esta coluna tem ~430px, e as células fixas
          somavam quase tudo — "Cancelada" chegava a desaparecer inteira,
          truncada até o nada, deixando a linha sem dizer o que era. */}
      <div className="flex items-baseline gap-3 lg:contents">
        <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums lg:w-12">
          {horaDoTimestamp(item.data_execucao)}
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums lg:w-16">
          {item.codigo_tuss ?? '—'}
        </span>
      </div>

      <span className="shrink-0 font-mono text-sm font-medium text-slate-700 tabular-nums lg:w-16">
        {item.guia}
      </span>

      <div className="min-w-0 lg:flex-1">
        {/* Rótulo curto na primeira linha, motivo por extenso na segunda. O
            `status` cru da ASSIM numa recusa É o motivo, e truncado
            ("1601-REINCIDENCIA NO ATEN") ele diria o mesmo que a linha de baixo,
            pela metade — o mesmo fato duas vezes, uma delas cortada. */}
        <p
          className={`truncate text-sm font-medium ${
            cancelada ? 'text-slate-600' : liberada ? 'text-emerald-700' : 'text-violet-700'
          }`}
        >
          {cancelada ? 'Cancelada' : liberada ? (item.status ?? 'Liberado') : 'Recusada'}
        </p>
        {cancelada && (
          <p className="truncate text-xs text-slate-500">
            autorização desfeita — não consumiu cota
          </p>
        )}
        {!liberada && !cancelada && (
          <p className="truncate text-xs text-slate-500" title={motivo ?? undefined}>
            {motivo ?? 'motivo não informado'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 lg:shrink-0 lg:justify-end">
        {item.teve_token && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            <KeySquare size={11} />
            {item.token ?? 'filipeta'}
          </span>
        )}

        {/* Rótulo em texto, sempre: a cor da borda nunca é o único sinal. */}
        {estado === 'fora-da-semana' && (
          <span
            title="Não casa com nenhuma sessão desta semana, e também não está na fila de reconciliação — pode estar pareada a uma sessão da semana vizinha, já ter sido triada, ou ser guia do próprio Pulsar."
            className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
          >
            outra semana
          </span>
        )}

        {/* O rótulo E a ação são o mesmo controle. "sem vínculo" descreve o
            estado, e clicar nele é o que se faz a respeito — separar os dois
            gastaria a largura da coluna dizendo a mesma coisa duas vezes. */}
        {estado === 'sem-vinculo' && (
          <button
            type="button"
            onClick={onVincular}
            disabled={!podeVincular}
            title={
              podeVincular
                ? 'Ver as sessões que esta guia pode cobrir'
                : 'Seu perfil não permite vincular autorizações'
            }
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[12px] font-semibold text-amber-900 transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 size={12} aria-hidden /> sem vínculo
          </button>
        )}
      </div>
    </li>
  )
})

export default LinhaAutorizacao
