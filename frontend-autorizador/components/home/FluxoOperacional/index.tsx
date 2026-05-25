"use client"

import { BarChart3, ChevronDown, Info } from "lucide-react"
import { FLUXO_MOCK_DATA, FluxoSlotPoint, FluxoUnitCount } from "./data"
import KpiMiniCards from "./KpiMiniCards"
import FluxoChart from "./Chart"

interface FluxoOperacionalCardProps {
  slotData?: FluxoSlotPoint[]
  atendimentos?: FluxoUnitCount | null
  terapeutas?: FluxoUnitCount | null
  loading?: boolean
}

export default function FluxoOperacionalCard({
  slotData,
  atendimentos = null,
  terapeutas = null,
  loading = false,
}: FluxoOperacionalCardProps) {
  const chartData = slotData && slotData.length > 0 ? slotData : FLUXO_MOCK_DATA

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 rounded-xl p-2.5 shrink-0">
            <BarChart3 size={20} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 leading-tight">
              Fluxo Operacional do Dia
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Atendimentos previstos por unidade e horário
            </p>
          </div>
        </div>

        <button className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors shrink-0">
          <span>Hoje</span>
          <ChevronDown size={13} className="text-slate-400" />
        </button>
      </div>

      {/* ── KPI Mini Cards ──────────────────────────────────────────────── */}
      <KpiMiniCards
        slotData={chartData}
        atendimentos={atendimentos}
        terapeutas={terapeutas}
        loading={loading}
      />

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-50" />

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <FluxoChart data={chartData} />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
        <Info size={12} className="shrink-0 text-slate-300" />
        <span>Dados referentes a atendimentos previstos para hoje ({today})</span>
      </div>

    </div>
  )
}
