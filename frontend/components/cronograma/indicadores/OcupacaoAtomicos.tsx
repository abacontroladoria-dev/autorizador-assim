'use client'

import { B } from '@/lib/cronograma/constants'
import { fmtPctOcup } from '@/lib/cronograma/helpers'
import { corFaixaOcupacao, textoFaixaOcupacao } from '@/lib/cronograma/ocupacaoProf'
import type { ReactNode } from 'react'
import type { OcupSort } from '@/types/ocupacaoProf'

// ─── FiltroCheckbox ───────────────────────────────────────────────────────────

interface FiltroCheckboxProps {
  titulo: string
  opcoes: string[]
  selecionados: string[]
  setSelecionados: (v: string[] | ((prev: string[]) => string[])) => void
  cor?: string
  selecaoPadrao?: string[] | null
}

export function FiltroCheckbox({
  titulo,
  opcoes,
  selecionados,
  setSelecionados,
  cor = B.blue,
  selecaoPadrao = null,
}: FiltroCheckboxProps) {
  const basePadrao = selecaoPadrao ?? opcoes
  const todas = !selecionados.length ||
    (selecionados.length === basePadrao.length && basePadrao.every(x => selecionados.includes(x)))
  const ativos = todas ? basePadrao : selecionados

  const toggle = (opcao: string) => {
    setSelecionados(prev => {
      if (prev.includes('__none__')) return [opcao]
      const base = !prev.length ? basePadrao : prev
      const prox = base.includes(opcao)
        ? base.filter(x => x !== opcao)
        : [...base, opcao].sort((a, b) => a.localeCompare(b))
      return prox
    })
  }

  return (
    <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#e5e7eb' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold" style={{ color: B.navy }}>{titulo}</div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setSelecionados([])}
            className="text-[11px] font-bold px-2 py-1 rounded-full"
            style={{ background: todas ? cor : B.navyLt, color: todas ? '#fff' : B.navy }}>
            Selecionar todos
          </button>
          <button type="button" onClick={() => setSelecionados(['__none__'])}
            className="text-[11px] font-bold px-2 py-1 rounded-full"
            style={{ background: B.orangeLt, color: B.orange }}>
            Desmarcar todos
          </button>
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto pr-1 space-y-1">
        {opcoes.map(opcao => (
          <label key={opcao} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={!selecionados.includes('__none__') && ativos.includes(opcao)}
              onChange={() => toggle(opcao)}
            />
            <span className="truncate" title={opcao}>{opcao}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ─── FiltroRadio ──────────────────────────────────────────────────────────────

interface FiltroRadioProps {
  titulo: string
  opcoes: OcupSort[]
  selecionado: string
  setSelecionado: (v: string) => void
}

export function FiltroRadio({ titulo, opcoes, selecionado, setSelecionado }: FiltroRadioProps) {
  return (
    <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#e5e7eb' }}>
      <div className="text-xs font-bold mb-2" style={{ color: B.navy }}>{titulo}</div>
      <div className="space-y-1">
        {opcoes.map(op => (
          <label key={op.k} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
            <input
              type="radio"
              name={titulo}
              checked={selecionado === op.k}
              onChange={() => setSelecionado(op.k)}
            />
            <span className="truncate" title={op.l}>{op.l}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ─── DashboardCard ────────────────────────────────────────────────────────────

interface DashboardCardProps {
  titulo: string
  valor: ReactNode
  detalhe?: ReactNode
  cor?: string
}

export function DashboardCard({ titulo, valor, detalhe, cor = B.blue }: DashboardCardProps) {
  return (
    <div className="rounded-xl bg-white border overflow-hidden flex flex-col" style={{ borderColor: '#e7edf5' }}>
      <div style={{ height: 3, background: cor, flexShrink: 0 }} />
      <div className="px-3 pt-2.5 pb-3 flex flex-col gap-1 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest leading-none"
          style={{ color: cor, opacity: 0.65 }}>
          {titulo}
        </div>
        <div className="text-[1.45rem] font-black leading-none" style={{ color: cor }}>
          {valor}
        </div>
        {detalhe && (
          <div className="text-[11px] leading-snug mt-0.5" style={{ color: '#6b7280' }}>
            {detalhe}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PercentualOcupacao ───────────────────────────────────────────────────────

interface PercentualOcupacaoProps {
  pct: number | null | undefined
  children?: ReactNode
}

export function PercentualOcupacao({ pct, children }: PercentualOcupacaoProps) {
  if (pct === null || pct === undefined) return <span>—</span>
  return (
    <span
      className="inline-flex min-w-[4.4rem] justify-center rounded-full px-2 py-0.5 text-[11px] font-black"
      style={{ background: corFaixaOcupacao(pct), color: textoFaixaOcupacao(pct) }}>
      {children ?? fmtPctOcup(pct)}
    </span>
  )
}
