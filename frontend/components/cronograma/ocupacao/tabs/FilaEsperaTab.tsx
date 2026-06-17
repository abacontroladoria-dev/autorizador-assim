"use client"

import { B } from "@/lib/cronograma/constants"
import { waKey } from "@/lib/cronograma/helpers"
import { SugCard } from "../SugCard"
import type { AlgorithmResult, Sugestao, WaMap } from "@/types/cronograma"

interface Props {
  res: AlgorithmResult | null
  waMap: WaMap
  onWA: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
}

export function FilaEsperaTab({ res, waMap, onWA, onInv, onCron }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ background: B.orangeLt, border: `1px solid ${B.orange}44`, borderRadius: "12px", padding: "10px 14px", fontSize: "12px", color: B.orange }}>
        <strong>⏳ Fila de Espera</strong> — Vagas que requerem coordenação prévia, como R4 (remanejamento) ou Supervisão Deslocável.
      </div>
      {!res?.filaEspera?.length && <Empty icon="⏳" text="Fila de espera vazia" />}
      {res?.filaEspera?.map((s, i) => (
        <SugCard key={i} s={s} fila
          waStatus={waMap[waKey(s)] ?? null}
          onWA={onWA} onInv={onInv} onCron={onCron} />
      ))}
    </div>
  )
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ background: "white", borderRadius: "14px", border: "2px dashed #e5e7eb", padding: "32px 24px", textAlign: "center" }}>
      <div style={{ fontSize: "40px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ color: "#9ca3af", fontSize: "14px" }}>{text}</div>
    </div>
  )
}
