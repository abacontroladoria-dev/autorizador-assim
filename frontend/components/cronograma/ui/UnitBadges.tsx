"use client"

import { B } from "@/lib/cronograma/constants"
import { unidadeLabel, turnoNome, type DayMeta, type UnitMeta } from "@/lib/cronograma/helpers"

function Chip({ label, units, mixed }: { label: string; units: string[]; mixed: boolean }) {
  const txt = mixed ? "unidades diferentes" : unidadeLabel(units[0]).toUpperCase()
  const title = mixed
    ? `Há sessões em unidades diferentes neste turno: ${units.join(", ")}`
    : `Unidade das sessões deste período: ${units[0]}`

  return (
    <div
      title={title}
      style={{
        fontSize: "9px", fontWeight: 800,
        color: mixed ? B.orange : B.blue,
        background: mixed ? B.orangeLt : B.blueLt,
        border: `1px solid ${mixed ? B.orange + "55" : B.blue + "44"}`,
        borderRadius: "999px", padding: "1px 6px",
        whiteSpace: "nowrap", maxWidth: "160px",
        overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      {label ? `${label}: ` : ""}{txt}
    </div>
  )
}

export function UnitHeaderBadges({
  dayMeta,
  globalUnit,
}: {
  dayMeta?: DayMeta
  globalUnit: string | null
}) {
  if (!dayMeta || globalUnit) return null
  const manha = dayMeta.manha || []
  const tarde = dayMeta.tarde || []
  const all = dayMeta.all || []
  if (!all.length) return null

  const sameSingle = all.length === 1 && manha.length <= 1 && tarde.length <= 1

  return (
    <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px", alignItems: "center" }}>
      {sameSingle
        ? <Chip label="" units={all} mixed={false} />
        : <>
            {manha.length > 0 && <Chip label={turnoNome.manha} units={manha} mixed={manha.length > 1} />}
            {tarde.length > 0 && <Chip label={turnoNome.tarde} units={tarde} mixed={tarde.length > 1} />}
          </>
      }
    </div>
  )
}

export function CronoGlobalUnitBadge({ unit }: { unit: string | null }) {
  if (!unit || unit === "Unidade não informada" || unit === "Desconhecida") return null
  return (
    <span
      title="Todas as sessões exibidas neste cronograma estão na mesma unidade; por isso a unidade não é repetida em cada sessão."
      style={{
        background: B.blueLt, color: B.blue,
        border: `1px solid ${B.blue}33`,
        borderRadius: "999px", padding: "2px 10px",
        fontSize: "11px", fontWeight: 800,
      }}
    >
      Unidade: {unit.toUpperCase()}
    </span>
  )
}

export type { DayMeta, UnitMeta }
