'use client'

import { useState } from 'react'

export interface PieSegment {
  value: number
  color: string
  label: string
  group?: string
}

interface Props {
  segments: PieSegment[]
  size?: number
  title?: string
  centerLabel?: string
  valueFormatter?: (v: number, seg: PieSegment, total: number) => string
  highlightGroup?: string | null
}

export function InteractivePieChart({
  segments,
  size = 140,
  title,
  centerLabel,
  valueFormatter = (v) => `${v} sess.`,
  highlightGroup = null,
}: Props) {
  const [hov, setHov] = useState<number | null>(null)
  const cx = size / 2, cy = size / 2
  const R = size * 0.41, r = size * 0.23
  const valid = segments.filter(x => (x.value || 0) > 0)
  const total = valid.reduce((s, x) => s + (x.value || 0), 0)

  if (!total) return (
    <div style={{ width: size, textAlign: 'center', fontSize: 10, color: '#aaa', paddingTop: size / 2 - 10 }}>
      Sem dados
    </div>
  )

  // ── caso especial: segmento único ──
  if (valid.length === 1) {
    const seg = valid[0]
    const ringR = (R + r) / 2
    const ringW = Math.max(R - r, 10)
    const isHov = hov === 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {title && <div style={{ fontSize: 10, fontWeight: 'bold', color: '#555', textAlign: 'center', marginBottom: 2 }}>{title}</div>}
        <div style={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size} style={{ overflow: 'visible' }}>
            <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={seg.color} strokeWidth={ringW}
              opacity={isHov ? 0.92 : 1}
              onMouseEnter={() => setHov(0)} onMouseLeave={() => setHov(null)}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }} />
            <circle cx={cx} cy={cy} r={r * 0.92} fill="white" />
            <text x={cx} y={cy - (isHov ? 6 : 2)} textAnchor="middle" fontSize={isHov ? 13 : 11}
              fontWeight="bold" fill="#222">
              {isHov ? '100.0%' : (centerLabel ?? '100%')}
            </text>
            {isHov && (
              <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8.5} fill="#555">
                {valueFormatter(seg.value, seg, total)}
              </text>
            )}
          </svg>
        </div>
        <div style={{ fontSize: 10, fontWeight: 'bold', color: isHov ? seg.color : '#555', textAlign: 'center', minHeight: 14 }}
          onMouseEnter={() => setHov(0)} onMouseLeave={() => setHov(null)}>
          {seg.label} (100%)
        </div>
      </div>
    )
  }

  // ── múltiplos segmentos ──
  let angle = -Math.PI / 2
  const arcs = valid.map((seg, i) => {
    const sweep = Math.max((seg.value / total) * 2 * Math.PI, 0.001)
    const a2 = angle + sweep
    const lg = sweep > Math.PI ? 1 : 0
    const ox1 = cx + R * Math.cos(angle), oy1 = cy + R * Math.sin(angle)
    const ox2 = cx + R * Math.cos(a2),    oy2 = cy + R * Math.sin(a2)
    const ix1 = cx + r * Math.cos(a2),    iy1 = cy + r * Math.sin(a2)
    const ix2 = cx + r * Math.cos(angle), iy2 = cy + r * Math.sin(angle)
    const path = `M${ox1.toFixed(2)},${oy1.toFixed(2)} A${R},${R} 0 ${lg} 1 ${ox2.toFixed(2)},${oy2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${r},${r} 0 ${lg} 0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z`
    const mid = angle + sweep / 2
    const pct = seg.value / total * 100
    angle = a2
    return { ...seg, path, mid, pct, idx: i }
  })

  const hovSeg = hov !== null ? (arcs[hov] ?? null) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {title && <div style={{ fontSize: 10, fontWeight: 'bold', color: '#555', textAlign: 'center', marginBottom: 2 }}>{title}</div>}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          {arcs.map((a) => {
            const isGroup = !!(highlightGroup && a.group === highlightGroup)
            const isHov   = hov === a.idx || isGroup
            const offset  = isHov ? 5 : 0
            const tx = Math.cos(a.mid) * offset
            const ty = Math.sin(a.mid) * offset
            return (
              <g key={a.idx} transform={`translate(${tx.toFixed(2)},${ty.toFixed(2)})`}
                onMouseEnter={() => setHov(a.idx)} onMouseLeave={() => setHov(null)}
                style={{ cursor: 'pointer' }}>
                <path d={a.path}
                  fill={a.color}
                  opacity={(hov === null && !highlightGroup) || isHov ? 1 : 0.35}
                  stroke="white" strokeWidth={isHov ? 2 : 0.8}
                  style={{ transition: 'all 0.15s ease' }} />
              </g>
            )
          })}
          <text x={cx} y={cy - (hovSeg ? 6 : 2)} textAnchor="middle" fontSize={hovSeg ? 13 : 11}
            fontWeight="bold" fill="#222">
            {hovSeg ? `${hovSeg.pct.toFixed(1)}%` : (centerLabel ?? String(total))}
          </text>
          {hovSeg && (
            <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8.5} fill="#555">
              {valueFormatter(hovSeg.value, hovSeg, total)}
            </text>
          )}
        </svg>
      </div>
      {hovSeg
        ? <div style={{ fontSize: 10, fontWeight: 'bold', color: hovSeg.color, textAlign: 'center', minHeight: 14 }}>{hovSeg.label}</div>
        : <div style={{ minHeight: 14 }} />
      }
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', justifyContent: 'center', maxWidth: size + 40 }}>
        {arcs.map((a) => (
          <div key={a.idx}
            style={{
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 9,
              opacity: (hov === null && !highlightGroup) || hov === a.idx || (!!highlightGroup && a.group === highlightGroup) ? 1 : 0.4,
              fontWeight: hov === a.idx || (!!highlightGroup && a.group === highlightGroup) ? 'bold' : 'normal',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={() => setHov(a.idx)} onMouseLeave={() => setHov(null)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ color: hov === a.idx ? a.color : '#555' }}>{a.label} ({a.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
