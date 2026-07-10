'use client'

import { useId, useState } from 'react'

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
  centerFontSize?: number
  legendAlign?: 'left' | 'center'
  legendFontSize?: number
  valueFormatter?: (v: number, seg: PieSegment, total: number) => string
  highlightGroup?: string | null
  // Cor do disco central — por padrão casa com bg-card (a maioria dos
  // chamadores fica sobre esse fundo). Sobrescreva quando o donut é embutido
  // num container tintado diferente (ex.: StatCardShell tone="slate") para o
  // disco não destoar do fundo ao redor.
  centerFillClassName?: string
}

export function InteractivePieChart({
  segments,
  size = 140,
  title,
  centerLabel,
  centerFontSize,
  legendAlign = 'center',
  legendFontSize = 9,
  valueFormatter = (v) => `${v} sess.`,
  highlightGroup = null,
  centerFillClassName = 'fill-white dark:fill-card',
}: Props) {
  const uid = useId()
  const clipId = `pie-inner-${uid.replace(/:/g, '')}`

  const [hov, setHov] = useState<number | null>(null)
  const cx = size / 2, cy = size / 2
  const R = size * 0.41, r = size * 0.23
  // Raio do buraco branco (ligeiramente menor que r para suavidade visual)
  const rInner = r * 0.92

  const valid = segments.filter(x => (x.value || 0) > 0)
  const total = valid.reduce((s, x) => s + (x.value || 0), 0)

  // Tamanho da fonte: quando `centerFontSize` não é passado, mantém os valores
  // fixos originais (11/13/8.5) para não alterar chamadores existentes (ex.:
  // OcupacaoProfShell.tsx usa size=110 sem essa prop). Só aplica o cap de
  // segurança (nunca excede rInner * 0.45, pra caber no buraco) quando o
  // chamador opta por um `centerFontSize` próprio.
  const maxFont = Math.floor(rInner * 0.45)
  const fs      = centerFontSize != null ? Math.min(centerFontSize, maxFont) : 11
  const fsHov   = centerFontSize != null ? Math.min(Math.round(fs * 1.1), maxFont) : 13
  const fsSub   = centerFontSize != null ? Math.min(Math.round(fs * 0.72), maxFont - 2) : 8.5

  if (!total) return (
    <div className="text-slate-400 dark:text-slate-500" style={{ width: size, textAlign: 'center', fontSize: 10, paddingTop: size / 2 - 10 }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: legendAlign === 'left' ? 'flex-start' : 'center', gap: 4 }}>
        {title && <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 10, fontWeight: 'bold', textAlign: legendAlign, marginBottom: 2 }}>{title}</div>}
        <div style={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size} style={{ overflow: 'visible' }}>
            <defs>
              <clipPath id={`${clipId}-s`}>
                <circle cx={cx} cy={cy} r={rInner} />
              </clipPath>
            </defs>
            <circle cx={cx} cy={cy} r={ringR} fill="none" stroke={seg.color} strokeWidth={ringW}
              opacity={isHov ? 0.92 : 1}
              onMouseEnter={() => setHov(0)} onMouseLeave={() => setHov(null)}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }} />
            <circle className={centerFillClassName} cx={cx} cy={cy} r={rInner} />
            {/* Texto clippado dentro do buraco */}
            <g clipPath={`url(#${clipId}-s)`}>
              <text className="fill-slate-900 dark:fill-slate-50" x={cx} y={cy - (isHov ? Math.round(fs * 0.4) : 2)} textAnchor="middle"
                fontSize={isHov ? fsHov : fs} fontWeight="bold">
                {isHov ? '100.0%' : (centerLabel ?? '100%')}
              </text>
              {isHov && (
                <text className="fill-slate-500 dark:fill-slate-400" x={cx} y={cy + Math.round(fs * 0.85)} textAnchor="middle" fontSize={fsSub}>
                  {valueFormatter(seg.value, seg, total)}
                </text>
              )}
            </g>
          </svg>
        </div>
        <div className={isHov ? undefined : "text-slate-500 dark:text-slate-400"}
          style={{ fontSize: legendFontSize + 1, fontWeight: 'bold', color: isHov ? seg.color : undefined, textAlign: legendAlign, minHeight: 14 }}
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: legendAlign === 'left' ? 'flex-start' : 'center', gap: 4 }}>
      {title && <div className="text-slate-500 dark:text-slate-400" style={{ fontSize: 10, fontWeight: 'bold', textAlign: legendAlign, marginBottom: 2 }}>{title}</div>}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          <defs>
            {/* clipPath para conter o texto exatamente dentro do buraco do donut */}
            <clipPath id={clipId}>
              <circle cx={cx} cy={cy} r={rInner} />
            </clipPath>
          </defs>

          {/* Arcos (podem vazar para fora por overflow:visible no hover) */}
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
                  className="stroke-white dark:stroke-card"
                  fill={a.color}
                  opacity={(hov === null && !highlightGroup) || isHov ? 1 : 0.35}
                  strokeWidth={isHov ? 2 : 0.8}
                  style={{ transition: 'all 0.15s ease' }} />
              </g>
            )
          })}

          {/* Buraco (branco no claro, superfície escura no dark) */}
          <circle className={centerFillClassName} cx={cx} cy={cy} r={rInner} />

          {/* Texto central — clipPath garante que nunca ultrapassa o buraco */}
          <g clipPath={`url(#${clipId})`}>
            <text
              className="fill-slate-900 dark:fill-slate-50"
              x={cx}
              y={cy - (hovSeg ? Math.round(fs * 0.4) : 2)}
              textAnchor="middle"
              fontSize={hovSeg ? fsHov : fs}
              fontWeight="bold"
            >
              {hovSeg ? `${hovSeg.pct.toFixed(1)}%` : (centerLabel ?? String(total))}
            </text>
            {hovSeg && (
              <text
                className="fill-slate-500 dark:fill-slate-400"
                x={cx}
                y={cy + Math.round(fs * 0.85)}
                textAnchor="middle"
                fontSize={fsSub}
              >
                {valueFormatter(hovSeg.value, hovSeg, total)}
              </text>
            )}
          </g>
        </svg>
      </div>

      {/* Legenda de hover / placeholder */}
      {hovSeg
        ? <div style={{ fontSize: legendFontSize + 1, fontWeight: 'bold', color: hovSeg.color, textAlign: legendAlign, minHeight: 16 }}>{hovSeg.label}</div>
        : <div style={{ minHeight: 16 }} />
      }

      {/* Legenda de itens */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '5px 10px',
        justifyContent: legendAlign === 'left' ? 'flex-start' : 'center',
        maxWidth: legendAlign === 'left' ? '100%' : size + 40,
      }}>
        {arcs.map((a) => (
          <div key={a.idx}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, fontSize: legendFontSize,
              opacity: (hov === null && !highlightGroup) || hov === a.idx || (!!highlightGroup && a.group === highlightGroup) ? 1 : 0.4,
              fontWeight: hov === a.idx || (!!highlightGroup && a.group === highlightGroup) ? 'bold' : 'normal',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={() => setHov(a.idx)} onMouseLeave={() => setHov(null)}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, flexShrink: 0, display: 'inline-block' }} />
            <span className={hov === a.idx ? undefined : "text-slate-500 dark:text-slate-400"} style={hov === a.idx ? { color: a.color } : undefined}>{a.label} ({a.pct.toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
