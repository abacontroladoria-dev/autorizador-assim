"use client"

import { useState, useEffect, useRef } from "react"
import { BarChart3, ChevronDown, Info } from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"
import {
  FLUXO_MOCK_DATA,
  FluxoSlotPoint,
  FluxoUnitCount,
  buildDateSlotData,
  buildGroupedSlotData,
  getWeekDateRange,
  getMonthWeekGroups,
  computePeriodUnitCount,
} from "./data"
import KpiMiniCards from "./KpiMiniCards"
import FluxoChart from "./Chart"

type Period = "hoje" | "semana" | "mensal"

const PERIOD_LABELS: Record<Period, string> = {
  hoje: "Hoje",
  semana: "Esta Semana",
  mensal: "Este Mês",
}

const PERIOD_OPTIONS: Period[] = ["hoje", "semana", "mensal"]

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
  const supabase = getSupabaseClient()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [period, setPeriod] = useState<Period>("hoje")
  const [open, setOpen] = useState(false)
  const [periodData, setPeriodData] = useState<FluxoSlotPoint[] | null>(null)
  const [periodAtendimentos, setPeriodAtendimentos] = useState<FluxoUnitCount | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  // Busca dados quando período muda para semana ou mensal
  useEffect(() => {
    if (period === "hoje") {
      setPeriodData(null)
      setPeriodAtendimentos(null)
      return
    }

    async function fetchPeriod() {
      setPeriodLoading(true)

      const weekRange = period === "semana" ? getWeekDateRange() : null
      const monthGroups = period === "mensal" ? getMonthWeekGroups() : null
      const queryStart = weekRange?.start ?? monthGroups![0].start
      const queryEnd = weekRange?.end ?? monthGroups![monthGroups!.length - 1].end

      // Busca paginada para contornar limite de 1000 linhas do servidor
      async function fetchAllRows() {
        const BATCH = 1000
        const all: { data_atendimento: string; sala_nome: string[] | null; terapias: string[] | null }[] = []
        let from = 0
        while (true) {
          const { data, error } = await supabase
            .from("vw_central_autorizacoes")
            .select("data_atendimento, sala_nome, terapias")
            .gte("data_atendimento", queryStart)
            .lte("data_atendimento", queryEnd)
            // Ordenação determinística (chave única) — paginação estável, sem pular/duplicar linhas
            .order("data_atendimento")
            .order("horario")
            .order("paciente_id")
            .range(from, from + BATCH - 1)
          if (error || !data || data.length === 0) break
          all.push(...data)
          if (data.length < BATCH) break
          from += BATCH
        }
        return all
      }

      const [rows, { data: blacklistData }] = await Promise.all([
        fetchAllRows(),
        supabase
          .from("config_regras_terapias")
          .select("terapia_nome")
          .eq("categoria", "blacklist_autorizacao")
          .eq("ativo", true),
      ])

      const blacklist = new Set((blacklistData ?? []).map((r: { terapia_nome: string }) => r.terapia_nome))

      const filtered = rows.filter((row) => {
        const terapias: string[] = row.terapias ?? []
        return !terapias.some((t: string) => blacklist.has(t))
      })

      const built =
        period === "semana"
          ? buildDateSlotData(filtered, blacklist, weekRange!.dates, weekRange!.labels)
          : buildGroupedSlotData(filtered, monthGroups!)

      const unitCount = computePeriodUnitCount(built)

      setPeriodData(built)
      setPeriodAtendimentos(unitCount)
      setPeriodLoading(false)
    }

    fetchPeriod()
  }, [period])

  // Dados ativos para o período selecionado
  const isToday = period === "hoje"
  const activeSlotData = isToday
    ? (slotData && slotData.length > 0 ? slotData : FLUXO_MOCK_DATA)
    : (periodData ?? FLUXO_MOCK_DATA)
  const activeAtendimentos = isToday ? atendimentos : periodAtendimentos
  const activeTerapeutas = isToday ? terapeutas : null
  const activeLoading = isToday ? loading : periodLoading

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  const footerText: Record<Period, string> = {
    hoje: `Dados referentes a atendimentos previstos para hoje (${today})`,
    semana: "Atendimentos da semana vigente, Seg–Sex, agrupados por dia",
    mensal: "Atendimentos do mês vigente agrupados por semana",
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_-2px_rgba(0,0,0,0.09)] p-6 space-y-5">

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

        {/* Period dropdown */}
        <div ref={dropdownRef} className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors"
          >
            <span>{PERIOD_LABELS[period]}</span>
            <ChevronDown
              size={13}
              className={`text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-lg py-1 min-w-27.5 z-20">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setOpen(false) }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-medium transition-colors hover:bg-slate-50 ${
                    period === p ? "text-blue-600 bg-blue-50" : "text-slate-600"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Mini Cards ──────────────────────────────────────────────── */}
      <KpiMiniCards
        slotData={activeSlotData}
        atendimentos={activeAtendimentos}
        terapeutas={activeTerapeutas}
        period={period}
        loading={activeLoading}
      />

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-50" />

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <FluxoChart data={activeSlotData} showCurrentSlot={isToday} />

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
        <Info size={12} className="shrink-0 text-slate-300" />
        <span>{footerText[period]}</span>
      </div>

    </div>
  )
}
