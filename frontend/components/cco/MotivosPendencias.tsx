'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { CCOMotivoPendencia } from './types'

interface Props {
  motivos: CCOMotivoPendencia[]
  loading?: boolean
}

interface TooltipPayload {
  name: string
  value: number
  payload: CCOMotivoPendencia
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground">{d.label}</p>
      <p className="text-foreground/60 mt-0.5">{d.quantidade} sessões · {d.percentual}%</p>
    </div>
  )
}

export default function MotivosPendencias({ motivos, loading }: Props) {
  const total = motivos.reduce((s, m) => s + m.quantidade, 0)

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-1">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Motivos das Pendências</h3>
        <p className="text-xs text-foreground/40 mt-0.5">{total} sessões com bloqueio</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-44">
          <div className="w-32 h-32 rounded-full border-8 border-border animate-pulse" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Donut com label central — legível sem hover */}
          <div className="relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={motivos}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                  dataKey="quantidade"
                  nameKey="label"
                  startAngle={90}
                  endAngle={-270}
                >
                  {motivos.map(m => (
                    <Cell key={m.motivo} fill={m.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Label central sempre visível */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground leading-none">{total}</p>
                <p className="text-[11px] text-foreground/40 mt-1">pendências</p>
              </div>
            </div>
          </div>

          {/* Legenda com valores explícitos */}
          <div className="flex flex-col gap-2">
            {motivos.map(m => (
              <div key={m.motivo} className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                <span className="text-xs text-foreground/70 flex-1 leading-tight">{m.label}</span>
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  {m.quantidade}
                </span>
                <span className="text-xs text-foreground/40 tabular-nums w-8 text-right">
                  {m.percentual}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
