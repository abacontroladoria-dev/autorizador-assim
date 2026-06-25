"use client"

import { B } from "@/lib/cronograma/constants"
import type { InvItem, RecItem, WaMap } from "@/types/cronograma"

interface Props {
  inv: InvItem[]
  rec: RecItem[]
  waMap: WaMap
  onRemove: (i: number) => void
  onExport: () => void
}

export function InviavelTab({ inv, onRemove, onExport }: Props) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontWeight: 800, color: B.navy }}>⛔ Inviáveis</span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{inv.length} registros · 💾</span>
          {inv.length > 0 && (
            <button onClick={onExport} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "8px", background: "var(--muted)", color: "var(--card-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              📥 Exportar base
            </button>
          )}
        </div>
      </div>
      {!inv.length ? (
        <Empty icon="✅" text="Nenhum inviável registrado" />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead style={{ background: "var(--muted)" }}>
              <tr>
                {["Paciente", "Motivo", "Registrado", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inv.map((iv, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: B.navy }}>{iv.paciente}</td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)" }}>{iv.motivo}</td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "11px" }}>{iv.registradoEm}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => onRemove(i)} style={{ fontSize: "11px", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ borderRadius: "10px", border: "2px dashed var(--border)", padding: "24px", textAlign: "center" }}>
      <div style={{ fontSize: "32px", marginBottom: "6px" }}>{icon}</div>
      <div style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>{text}</div>
    </div>
  )
}
