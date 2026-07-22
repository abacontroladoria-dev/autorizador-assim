'use client'

import { fmtPctOcup } from '@/lib/cronograma/helpers'
import { corFaixaOcupacao } from '@/lib/cronograma/ocupacaoProf'
import type { ReactNode } from 'react'
import type { OcupSort } from '@/types/ocupacaoProf'

// ─── FiltroCheckbox ───────────────────────────────────────────────────────────

interface FiltroCheckboxProps {
  titulo: string
  opcoes: string[]
  selecionados: string[]
  setSelecionados: (v: string[] | ((prev: string[]) => string[])) => void
  selecaoPadrao?: string[] | null
}

export function FiltroCheckbox({
  titulo,
  opcoes,
  selecionados,
  setSelecionados,
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
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-bold text-foreground">{titulo}</div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setSelecionados([])}
            className={`rounded-full px-2 py-1 text-[11px] font-bold transition-colors ${
              todas
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-muted text-foreground hover:bg-muted/70"
            }`}>
            Selecionar todos
          </button>
          <button type="button" onClick={() => setSelecionados(['__none__'])}
            className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50">
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
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-bold text-foreground">{titulo}</div>
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

// ─── PercentualOcupacao ───────────────────────────────────────────────────────

interface PercentualOcupacaoProps {
  pct: number | null | undefined
  children?: ReactNode
}

export function PercentualOcupacao({ pct, children }: PercentualOcupacaoProps) {
  if (pct === null || pct === undefined) return <span>—</span>
  const cor = corFaixaOcupacao(pct)
  return (
    <span
      className="inline-flex min-w-[4.4rem] justify-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}>
      {children ?? fmtPctOcup(pct)}
    </span>
  )
}
