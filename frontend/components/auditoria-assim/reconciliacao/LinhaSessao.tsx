'use client'

import { memo } from 'react'
import SituacaoBadge from '../SituacaoBadge'
import type { AuditoriaAssimItem } from '../types'

/**
 * Uma terapia agendada da semana.
 *
 * Só leitura, de propósito: a coluna esquerda é a evidência — o que a clínica
 * marcou —, e a decisão de vincular acontece do lado das guias, onde está a
 * anomalia. Transformar esta coluna em formulário faria o leitor perder de vista
 * a semana justamente quando precisa dela inteira.
 */
const LinhaSessao = memo(function LinhaSessao({ item }: { item: AuditoriaAssimItem }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:gap-3 lg:py-2">
      {/* `lg:contents` dissolve os agrupadores no desktop, então a linha larga é
          a mesma; no celular eles viram as faixas do card empilhado. */}
      {/* Larguras apertadas de propósito. A coluna toda tem ~455px num laptop de
          1280, e as células fixas somavam mais que isso — a terapia, que é o que
          a pessoa lê, sobrava com 25px e virava "Fonoau…". Hora, TUSS e guia são
          consultados de relance; o nome da terapia é lido. */}
      <div className="flex items-baseline gap-3 lg:contents">
        <span className="shrink-0 text-sm font-semibold text-slate-700 tabular-nums lg:w-12">
          {item.hora_inicial?.slice(0, 5) ?? '—'}
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-500 tabular-nums lg:w-16">
          {item.codigo_tuss ?? '—'}
        </span>
      </div>

      <div className="min-w-0 lg:flex-1">
        <p className="truncate text-sm font-medium text-slate-800" title={item.terapias ?? undefined}>
          {item.terapias ?? '—'}
        </p>
        {/* Linha de falta não traz profissional — a RPC de faltas devolve o
            motivo, e é ele que explica por que a sessão não conta como cota. */}
        <p className="truncate text-xs text-slate-500" title={item.profissionais ?? undefined}>
          {item.profissionais ?? item.observacao ?? '—'}
        </p>
      </div>

      {/* Sem a guia aqui, de propósito: a coluna ao lado É a das guias, e repetir
          o número roubava a largura do nome da terapia — que era o que sobrava
          truncado em "Fono…" num laptop de 1280 com a fila aberta. */}
      <div className="lg:w-28 lg:shrink-0">
        <SituacaoBadge situacao={item.situacao} />
      </div>
    </li>
  )
})

export default LinhaSessao
