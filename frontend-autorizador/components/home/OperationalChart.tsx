"use client"

import { useState } from "react"

interface ChartData {
  hour: string
  realengo: number
  fazendinha: number
  padreMiguel: number
}

interface OperationalChartProps {
  data: ChartData[]
}

const UNITS = [
  { key: "realengo" as const, label: "Realengo", color: "#3A8FB7" },
  { key: "fazendinha" as const, label: "Fazendinha", color: "#5bb8b0" },
  { key: "padreMiguel" as const, label: "Padre Miguel", color: "#7c8ff7" },
]

export default function OperationalChart({ data }: OperationalChartProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: ChartData } | null>(null)

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400">
        Sem dados para exibir
      </div>
    )
  }

  const BAR_W = 8
  const GAP = 3
  const GROUP_GAP = 18
  const GROUP_W = UNITS.length * (BAR_W + GAP) - GAP + GROUP_GAP
  const CHART_H = 120
  const PADDING = { top: 12, right: 16, bottom: 28, left: 28 }

  const maxVal = Math.max(...data.flatMap((d) => UNITS.map((u) => d[u.key])), 1)

  const totalW = data.length * GROUP_W + PADDING.left + PADDING.right
  const totalH = CHART_H + PADDING.top + PADDING.bottom

  function barH(val: number) {
    return (val / maxVal) * CHART_H
  }

  const yTicks = [0, Math.round(maxVal / 2), maxVal]

  return (
    <div className="relative w-full">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        {UNITS.map((u) => (
          <div key={u.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: u.color }} />
            <span className="text-xs text-slate-500">{u.label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${totalW} ${totalH}`}
          width="100%"
          style={{ minWidth: Math.min(totalW, 320) }}
          className="overflow-visible"
        >
          {/* Y-axis grid lines */}
          {yTicks.map((tick) => {
            const y = PADDING.top + CHART_H - barH(tick)
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={totalW - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text x={PADDING.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94a3b8">
                  {tick}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {data.map((item, gi) => {
            const groupX = PADDING.left + gi * GROUP_W

            return (
              <g key={item.hour}>
                {UNITS.map((unit, ui) => {
                  const h = barH(item[unit.key])
                  const x = groupX + ui * (BAR_W + GAP)
                  const y = PADDING.top + CHART_H - h

                  return (
                    <rect
                      key={unit.key}
                      x={x}
                      y={h > 0 ? y : PADDING.top + CHART_H}
                      width={BAR_W}
                      height={h}
                      rx={2}
                      fill={unit.color}
                      opacity={0.85}
                      className="hover:opacity-100 transition-opacity duration-100 cursor-pointer"
                      onMouseEnter={(e) => {
                        const rect = (e.target as SVGRectElement).getBoundingClientRect()
                        setTooltip({ x: rect.left + rect.width / 2, y: rect.top, item })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  )
                })}

                {/* X label */}
                <text
                  x={groupX + (UNITS.length * (BAR_W + GAP)) / 2 - GAP / 2}
                  y={totalH - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {item.hour}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-xl -translate-x-1/2 -translate-y-full -mt-2"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold mb-1">{tooltip.item.hour}h</p>
          {UNITS.map((u) => (
            <p key={u.key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: u.color }} />
              {u.label}: {tooltip.item[u.key]}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
