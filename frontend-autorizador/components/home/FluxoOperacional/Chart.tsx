"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { FluxoSlotPoint, UNIT_COLORS, getDailyAverage, getPeakSlot, getCurrentSlotKey } from "./data"

// ─── Types ────────────────────────────────────────────────────────────────────

interface FluxoChartProps {
  data: FluxoSlotPoint[]
}

interface TooltipEntry {
  dataKey: string
  value: number
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}

const UNITS = [
  { key: "realengo" as const, label: "Realengo", color: UNIT_COLORS.realengo },
  { key: "fazendinha" as const, label: "Fazendinha", color: UNIT_COLORS.fazendinha },
  { key: "padreMiguel" as const, label: "Padre Miguel", color: UNIT_COLORS.padreMiguel },
]

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 text-white rounded-xl px-4 py-3 shadow-2xl border border-slate-700 min-w-40">
      <p className="text-sm font-semibold mb-2 text-slate-200">{label}</p>
      {UNITS.map((u) => {
        const entry = payload.find((p) => p.dataKey === u.key)
        return (
          <div key={u.key} className="flex items-center justify-between gap-4 text-xs py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: u.color }} />
              <span className="text-slate-300">{u.label}</span>
            </div>
            <span className="font-semibold text-white">{entry?.value ?? 0}</span>
          </div>
        )
      })}
      <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between text-xs">
        <span className="text-slate-400">Total</span>
        <span className="font-bold text-white">
          {payload.reduce((s: number, p: TooltipEntry) => s + (Number(p.value) || 0), 0)}
        </span>
      </div>
    </div>
  )
}

// ─── Custom Legend ────────────────────────────────────────────────────────────

function CustomLegend() {
  return (
    <div className="flex items-center justify-center gap-6 mb-2">
      {UNITS.map((u) => (
        <div key={u.key} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: u.color }} />
          <span className="text-xs text-slate-500 font-medium">{u.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Average Label ────────────────────────────────────────────────────────────

function AverageLabel({
  viewBox,
  value,
}: {
  viewBox?: { x?: number; y?: number; width?: number }
  value?: number
}) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) - 4
  const y = (viewBox?.y ?? 0) - 6
  return (
    <text x={x} y={y} fill={UNIT_COLORS.media} fontSize={10} textAnchor="end" fontWeight={500}>
      Média diária: {value}
    </text>
  )
}

// ─── Peak Badge ───────────────────────────────────────────────────────────────

function PeakBadge({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
  const x = (viewBox?.x ?? 0) - 38
  const y = (viewBox?.y ?? 0) + 12
  return (
    <g>
      <rect x={x} y={y} width={88} height={22} rx={6} fill="#EFF6FF" stroke="#BFDBFE" strokeWidth={1} />
      <text x={x + 44} y={y + 14.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#2563EB">
        ⭐ Pico do dia
      </text>
    </g>
  )
}

// ─── Chart ────────────────────────────────────────────────────────────────────

export default function FluxoChart({ data }: FluxoChartProps) {
  const dailyAverage = getDailyAverage(data)
  const peakSlot = getPeakSlot(data).slot
  const currentSlot = getCurrentSlotKey()

  return (
    <div className="w-full">
      <CustomLegend />
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          barGap={3}
          barCategoryGap="18%"
          margin={{ top: 28, right: 24, left: -8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
          <XAxis
            dataKey="slot"
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(148,163,184,0.06)", radius: 4 }}
          />

          {/* Linha de média diária */}
          <ReferenceLine
            y={dailyAverage}
            stroke={UNIT_COLORS.media}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={<AverageLabel value={dailyAverage} />}
          />

          {/* Indicador do slot atual */}
          {currentSlot && (
            <ReferenceLine
              x={currentSlot}
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {/* Badge "Pico do dia" */}
          {peakSlot && (
            <ReferenceLine
              x={peakSlot}
              stroke="transparent"
              label={<PeakBadge />}
            />
          )}

          <Bar
            dataKey="realengo"
            name="Realengo"
            fill={UNIT_COLORS.realengo}
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
            animationDuration={800}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="fazendinha"
            name="Fazendinha"
            fill={UNIT_COLORS.fazendinha}
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
            animationDuration={950}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="padreMiguel"
            name="Padre Miguel"
            fill={UNIT_COLORS.padreMiguel}
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
