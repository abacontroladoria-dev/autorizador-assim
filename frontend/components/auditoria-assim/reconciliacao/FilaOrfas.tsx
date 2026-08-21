'use client'

import {
  AlertTriangle, CheckCircle2, ChevronsLeft, ChevronsRight, Link2, Loader2, RefreshCw, Search, X,
} from 'lucide-react'
import type { PacienteComOrfas } from '@/hooks/useReconciliacaoAssim'
import type { GuiaOrfa } from '../types'
import { dataHoraCurta } from './datas'

/** "2 de 1 sessão" é a explicação inteira de por que a guia sobrou. */
function porqueSobrou(g: GuiaOrfa) {
  const n = g.sessoes_na_particao ?? 0
  if (n === 0) return 'nenhuma sessão desse TUSS no dia da autorização'
  return `${g.ordem_autorizacao}ª autorização do dia, com ${n} ${n === 1 ? 'sessão' : 'sessões'}`
}

function CartaoGuia({
  guia, selecionada, onSelecionar,
}: {
  guia: GuiaOrfa
  selecionada: boolean
  onSelecionar: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-pressed={selecionada}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
        selecionada
          ? 'border-brand bg-brand-hover ring-2 ring-brand'
          : 'border-amber-300 bg-amber-50 hover:border-amber-400 hover:bg-amber-100'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-slate-900">Guia {guia.guia}</span>
        <span className="text-[11px] tabular-nums text-slate-500">{dataHoraCurta(guia.data_execucao)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        <span>TUSS <span className="tabular-nums text-slate-700">{guia.codigo_tuss}</span></span>
        {guia.teve_token && <span className="text-slate-600">com token</span>}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{porqueSobrou(guia)}</p>
    </button>
  )
}

type Props = {
  de: string
  ate: string
  setDe: (v: string) => void
  setAte: (v: string) => void
  busca: string
  setBusca: (v: string) => void
  pacientes: PacienteComOrfas[]
  total: number
  carregando: boolean
  erro: string | null
  onRecarregar: () => void
  guiaSelecionada: string | null
  onSelecionar: (guia: GuiaOrfa | null) => void
  recolhida: boolean
  onAlternar: () => void
}

/**
 * A fila de guias sem vínculo — o índice da tela.
 *
 * Ela responde "quais pacientes merecem uma olhada", e o painel ao lado responde
 * "por quê". Recolhe porque num laptop de 1280 os 320px dela saem direto das duas
 * colunas do painel, que são o que se lê.
 */
export default function FilaOrfas({
  de, ate, setDe, setAte, busca, setBusca,
  pacientes, total, carregando, erro, onRecarregar,
  guiaSelecionada, onSelecionar, recolhida, onAlternar,
}: Props) {
  if (recolhida) {
    return (
      <button
        type="button"
        onClick={onAlternar}
        title={`Abrir a fila de reconciliação (${total})`}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-600 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none xl:h-full xl:w-12 xl:flex-col xl:justify-start xl:py-4"
      >
        <ChevronsRight size={16} aria-hidden />
        <Link2 size={16} aria-hidden />
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-900">
          {total}
        </span>
        <span className="text-[12px] xl:hidden">guias sem vínculo</span>
      </button>
    )
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white"
      aria-label="Fila de guias sem vínculo"
    >
      <header className="border-b border-slate-200 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-slate-900">Guias sem vínculo</h3>
            <p className="text-[11px] text-slate-500">Liberadas pela ASSIM que sobraram do pareamento</p>
          </div>
          <button
            type="button"
            onClick={onAlternar}
            aria-label="Recolher a fila"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            <ChevronsLeft size={16} />
          </button>
        </div>

        <div className="mt-2.5 flex items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-medium text-slate-500">De</span>
            <input
              type="date" value={de} onChange={(e) => setDe(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px] text-slate-800 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-medium text-slate-500">Até</span>
            <input
              type="date" value={ate} onChange={(e) => setAte(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px] text-slate-800 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
          </label>
          <button
            type="button" onClick={onRecarregar} disabled={carregando}
            aria-label="Atualizar a fila"
            className="flex h-7.5 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-60"
          >
            <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} aria-hidden />
          </button>
        </div>

        <div className="relative mt-2">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar a fila"
            aria-label="Filtrar a fila por paciente, guia, carteirinha ou TUSS"
            className="w-full rounded-lg border border-slate-300 py-1.5 pr-8 pl-8 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
          {busca && (
            <button
              type="button" onClick={() => setBusca('')} aria-label="Limpar o filtro da fila"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <p className="mt-2 text-[11px] text-slate-500" role="status" aria-live="polite">
          {carregando ? 'carregando…' : `${total} ${total === 1 ? 'guia sem vínculo' : 'guias sem vínculo'}`}
        </p>
      </header>

      <div className="max-h-64 min-h-0 flex-1 overflow-y-auto p-2.5 xl:max-h-none">
        {erro && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {erro}
          </p>
        )}

        {!erro && carregando && (
          <p className="flex items-center gap-2 px-1 py-6 text-[13px] text-slate-500">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Buscando guias órfãs…
          </p>
        )}

        {!erro && !carregando && pacientes.length === 0 && (
          <div className="px-1 py-8 text-center">
            <CheckCircle2 size={22} className="mx-auto text-emerald-500" aria-hidden />
            <p className="mt-2 text-[13px] font-medium text-slate-700">Nada para reconciliar</p>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {busca
                ? 'Nenhuma guia bate com o filtro.'
                : 'Toda autorização do período já casou com uma sessão ou já foi triada.'}
            </p>
          </div>
        )}

        {pacientes.map((p) => (
          <div key={p.chave} className="mb-4 last:mb-0">
            <div className="mb-1.5 px-1">
              <p className="truncate text-[13px] font-semibold text-slate-800">{p.pacienteNome}</p>
              <p className="text-[11px] tabular-nums text-slate-500">{p.carteirinha ?? 'sem carteirinha'}</p>
            </div>
            <div className="space-y-1.5">
              {p.guias.map((g) => (
                <CartaoGuia
                  key={g.guia}
                  guia={g}
                  selecionada={g.guia === guiaSelecionada}
                  onSelecionar={() => onSelecionar(g.guia === guiaSelecionada ? null : g)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
