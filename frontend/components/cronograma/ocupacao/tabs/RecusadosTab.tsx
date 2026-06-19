"use client"

import { B } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import type { InvItem, RecItem, WaMap } from "@/types/cronograma"

interface Props {
  rec: RecItem[]
  inv: InvItem[]
  waMap: WaMap
  onRemove: (i: number) => void
  onExport: () => void
}

export function RecusadosTab({ rec, onRemove, onExport }: Props) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontWeight: 800, color: B.navy }}>❌ Recusados pela Família</span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{rec.length} registros · 💾</span>
          {rec.length > 0 && (
            <button onClick={onExport} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "8px", background: "var(--muted)", color: "var(--card-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
              📥 Exportar base
            </button>
          )}
        </div>
      </div>
      {!rec.length ? (
        <Empty icon="👍" text="Nenhuma recusa registrada" />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead style={{ background: "var(--muted)" }}>
              <tr>
                {["Paciente", "Profissional", "Especialidade", "Unidade", "Dia", "Hora", "Registrado", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rec.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: B.navy }}>{r.paciente}</td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "12px" }}>{fmtName(r.profissional)}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: B.blueLt, color: B.blue, borderRadius: "999px", padding: "2px 8px", fontSize: "11px" }}>{r.especialidade}</span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "12px" }}>{r.unidade}</td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "12px" }}>{r.dia}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: "12px" }}>{r.hora}</td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "11px" }}>{r.registradoEm}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => onRemove(i)} style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>remover</button>
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
