'use client'

import { THERAPY_COLORS } from '@/services/agenda.service'

const STATUS_LEGEND = [
  { label: 'Livre',     bg: '#ECFDF5', border: '#10B981', text: '#065F46' },
  { label: 'Conflito',  bg: '#FEF2F2', border: '#EF4444', text: '#991B1B' },
  { label: 'Bloqueado', bg: '#F9FAFB', border: '#9CA3AF', text: '#374151' },
]

const THERAPY_LEGEND = Object.entries(THERAPY_COLORS).map(([label, colors]) => ({
  label,
  ...colors,
}))

export default function AgendaLegend() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Legenda</p>

      <div className="space-y-1.5">
        {THERAPY_LEGEND.map((item) => (
          <Pill key={item.label} {...item} />
        ))}

        <div className="my-2 border-t border-slate-100" />

        {STATUS_LEGEND.map((item) => (
          <Pill key={item.label} {...item} />
        ))}
      </div>
    </div>
  )
}

function Pill({ label, bg, border, text }: { label: string; bg: string; border: string; text: string }) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium"
      style={{ backgroundColor: bg, borderLeft: `3px solid ${border}`, color: text }}
    >
      {label}
    </div>
  )
}
