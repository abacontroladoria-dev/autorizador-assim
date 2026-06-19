"use client"

import { PBADGE, PL } from "@/lib/cronograma/constants"

export function PBadge({ prio }: { prio: number }) {
  const s = PBADGE[prio] ?? PBADGE[4]
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {PL[prio] ?? PL[4]}
    </span>
  )
}
