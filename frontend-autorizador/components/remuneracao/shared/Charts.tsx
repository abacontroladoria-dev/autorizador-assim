'use client'

import { useState } from 'react'

// ─── InteractivePieChart ──────────────────────────────────────────────────────
interface PieSegment { label: string; value: number; color: string }

export function InteractivePieChart({ segments, size = 140, title, centerLabel }: {
  segments: PieSegment[]; size?: number; title?: string; centerLabel?: string | number
}) {
  const [hov, setHov] = useState<number | null>(null)
  const cx = size / 2, cy = size / 2, R = size * 0.41, r = size * 0.23
  const total = segments.reduce((s, x) => s + (x.value || 0), 0)
  if (!total) return (
    <div style={{ width: size, textAlign: 'center', fontSize: 10, color: '#aaa', paddingTop: size / 2 - 10 }}>Sem dados</div>
  )
  let angle = -Math.PI / 2
  const arcs = segments.map((seg, i) => {
    const a = Math.max((seg.value / total) * 2 * Math.PI, 0.001)
    const a2 = angle + a
    const lg = a > Math.PI ? 1 : 0
    const ox1 = cx + R * Math.cos(angle), oy1 = cy + R * Math.sin(angle)
    const ox2 = cx + R * Math.cos(a2), oy2 = cy + R * Math.sin(a2)
    const ix1 = cx + r * Math.cos(a2), iy1 = cy + r * Math.sin(a2)
    const ix2 = cx + r * Math.cos(angle), iy2 = cy + r * Math.sin(angle)
    const path = `M${ox1.toFixed(2)},${oy1.toFixed(2)} A${R},${R} 0 ${lg} 1 ${ox2.toFixed(2)},${oy2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${r},${r} 0 ${lg} 0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z`
    const mid = angle + a / 2
    const pct = seg.value / total * 100
    angle = a2
    return { ...seg, path, mid, pct, i }
  })
  const hovSeg = hov !== null ? arcs[hov] : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {title && <div style={{ fontSize: 10, fontWeight: 'bold', color: '#555', textAlign: 'center', marginBottom: 2 }}>{title}</div>}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          {arcs.map((a, i) => {
            const isHov = hov === i
            const offset = isHov ? 5 : 0
            const tx = Math.cos(a.mid) * offset, ty = Math.sin(a.mid) * offset
            return (
              <g key={i} transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)})`}
                onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
                style={{ cursor: 'pointer' }}>
                <path d={a.path} fill={a.color}
                  opacity={hov === null || isHov ? 1 : 0.35}
                  stroke="white" strokeWidth={isHov ? 2 : 0.8}
                  style={{ transition: 'all 0.15s ease' }} />
              </g>
            )
          })}
          <text x={cx} y={cy - (hovSeg ? 6 : 2)} textAnchor="middle" fontSize={hovSeg ? 13 : 11} fontWeight="bold" fill="#222">
            {hovSeg ? `${hovSeg.pct.toFixed(1)}%` : centerLabel || total}
          </text>
          {hovSeg && <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8.5} fill="#555">{hovSeg.value} sess.</text>}
        </svg>
      </div>
      {hovSeg
        ? <div style={{ fontSize: 10, fontWeight: 'bold', color: hovSeg.color, textAlign: 'center', minHeight: 14 }}>{hovSeg.label}</div>
        : <div style={{ minHeight: 14 }} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', justifyContent: 'center', maxWidth: size + 40 }}>
        {arcs.filter(a => a.value > 0).map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9,
                                opacity: hov === null || hov === a.i ? 1 : 0.4,
                                fontWeight: hov === a.i ? 'bold' : 'normal',
                                cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={() => setHov(a.i)} onMouseLeave={() => setHov(null)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ color: hov === a.i ? a.color : '#555' }}>{a.label} ({a.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PieDonut ─────────────────────────────────────────────────────────────────
interface DonutSeg { value: number; color: string }

export function PieDonut({ segments, size = 90, sw = 18 }: { segments: DonutSeg[]; size?: number; sw?: number }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0)
  if (!total) return null
  const r = (size - sw) / 2, circ = 2 * Math.PI * r, cx = size / 2, cy = size / 2
  let acc = 0
  const arcs = segments.map(seg => {
    const len = circ * (seg.value / total)
    const a = { color: seg.color, len, off: -(acc - circ / 4) }
    acc += len; return a
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {arcs.map((a, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.color} strokeWidth={sw}
          strokeDasharray={`${a.len.toFixed(2)} ${circ.toFixed(2)}`}
          strokeDashoffset={a.off.toFixed(2)} />
      ))}
    </svg>
  )
}

// ─── DonutChart ───────────────────────────────────────────────────────────────
export function DonutChart({ pct, size = 80, strokeWidth = 10, label }: {
  pct: number; size?: number; strokeWidth?: number; label?: string
}) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const arc = circ * Math.min(Math.max(pct, 0), 100) / 100
  const cx = size / 2, cy = size / 2
  const color = pct >= 80 ? '#3aaa5c' : pct >= 50 ? '#f59e0b' : '#e05555'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${arc.toFixed(2)} ${circ.toFixed(2)}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x={cx} y={label ? cy - 5 : cy} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.2} fontWeight="bold" fill="#222">{pct.toFixed(0)}%</text>
      {label && <text x={cx} y={cy + size * 0.14} textAnchor="middle" fontSize={size * 0.12} fill="#666">{label}</text>}
    </svg>
  )
}
