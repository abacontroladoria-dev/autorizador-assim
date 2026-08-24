'use client'

import { AlertOctagon, Ban, Link2 } from 'lucide-react'
import type { EstadoFiltro } from '../types'

/**
 * Os três estados que esta tela existe para vigiar — sem vínculo, glosa,
 * cancelada — como contador e filtro no mesmo controle.
 *
 * O número é o que faz disto uma tela de monitoramento e não uma lista: ele diz
 * quanto há para olhar na semana antes de a pessoa rolar. E porque cada botão
 * filtra exatamente o estado que nomeia, o matiz aqui não decora — é o estado,
 * o que a Decoration-Free Semantics Rule permite.
 *
 * Matizes, todos já falados nesta superfície: âmbar espera alguém, violeta é
 * glosa, cinza é o que aconteceu e não pede nada. Nenhum novo.
 */
const ITENS: {
  chave: EstadoFiltro
  rotulo: string
  Icone: typeof Link2
  ativo: string
  inativo: string
}[] = [
  {
    chave: 'sem-vinculo',
    rotulo: 'sem vínculo',
    Icone: Link2,
    ativo: 'border-amber-300 bg-amber-50 text-amber-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50',
  },
  {
    chave: 'glosa',
    rotulo: 'glosas',
    Icone: AlertOctagon,
    ativo: 'border-violet-300 bg-violet-50 text-violet-900',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50',
  },
  {
    chave: 'cancelada',
    rotulo: 'canceladas',
    Icone: Ban,
    ativo: 'border-slate-400 bg-slate-100 text-slate-800',
    inativo: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
  },
]

export default function FiltrosEstado({
  ledger,
  valor,
  onEscolher,
}: {
  ledger: { semVinculo: number; glosas: number; canceladas: number }
  valor: EstadoFiltro | null
  onEscolher: (estado: EstadoFiltro | null) => void
}) {
  const contagem: Record<EstadoFiltro, number> = {
    'sem-vinculo': ledger.semVinculo,
    glosa: ledger.glosas,
    cancelada: ledger.canceladas,
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ITENS.map(({ chave, rotulo, Icone, ativo, inativo }) => {
        const n = contagem[chave]
        const selecionado = valor === chave
        return (
          <button
            key={chave}
            type="button"
            onClick={() => onEscolher(selecionado ? null : chave)}
            aria-pressed={selecionado}
            // Zero continua clicável e continua visível: "nenhuma glosa nesta
            // semana" é informação, e esconder o contador faria a ausência
            // parecer com a tela ainda carregando.
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none ${
              selecionado ? ativo : inativo
            } ${n === 0 && !selecionado ? 'opacity-60' : ''}`}
          >
            <Icone size={13} aria-hidden />
            <span className="tabular-nums font-semibold">{n}</span>
            {rotulo}
          </button>
        )
      })}
      {valor && (
        <button
          type="button"
          onClick={() => onEscolher(null)}
          className="h-9 rounded-lg px-2 text-[12px] font-medium text-slate-500 transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          limpar
        </button>
      )}
    </div>
  )
}
