"use client"

import { B, PBADGE, REGRAS_LEGENDA } from "@/lib/cronograma/constants"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"

interface Props {
  apiFetch: boolean
  apiErr: string
  onApiFetch: () => Promise<void>
}

const PRIO_INFO = [
  [1, "🔴", "P1 – Liminar+Conv não-ASSIM/LEVE", "Máxima urgência. Judicial + convênio de alto valor."],
  [2, "🟠", "P2 – Outro Convênio · sem judicial", "SulAmérica, Bradesco, Unimed, Amil, Particular etc."],
  [3, "🟡", "P3 – Liminar+ASSIM", "Judicial, mas convênio ASSIM (menor valor)."],
  [4, "🔵", "P4 – ASSIM · sem judicial", "Convênio ASSIM sem marcação judicial."],
  [5, "🟢", "P5 – LEVE · por último", "Elegível AE/HS."],
] as const


const card: React.CSSProperties = { background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }

export function ConfigTab({ apiFetch, apiErr, onApiFetch }: Props) {
  const { cfg, sCfg } = useCronogramaData()
  const refWeek = getRefWeek()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Prioridade P1–P5 */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: B.navy, marginBottom: "4px", fontSize: "14px" }}>📊 Sistema de Prioridade P1–P5</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
          {PRIO_INFO.map(([p, ic, lb, d]) => {
            const s = PBADGE[p as number]
            return (
              <div key={p} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px", background: s.bg, borderRadius: "10px", border: `1px solid ${s.border}22` }}>
                <span style={{ fontSize: "18px" }}>{ic}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: s.color }}>{lb}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>{d}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legenda das Regras + Token */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: B.navy, marginBottom: "10px", fontSize: "14px" }}>📖 Legenda das Regras</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "16px" }}>
          {REGRAS_LEGENDA.map(({ r, c, title, desc }) => (
            <div key={r} style={{ display: "flex", gap: "10px", padding: "10px", background: "#fafafa", borderRadius: "8px", border: "1px solid #f0f0f0", fontSize: "12px" }}>
              <div style={{ flexShrink: 0 }}>
                <span style={{ background: c, color: "white", borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" }}>{r}</span>
              </div>
              <div><strong style={{ color: B.navy }}>{title}</strong> — <span style={{ color: "#6b7280", lineHeight: "1.5" }}>{desc}</span></div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "12px", marginTop: "4px" }}>
          <div style={{ fontWeight: 800, color: B.navy, marginBottom: "4px", fontSize: "14px" }}>🔌 Token da API TitaTherapy</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
            Semana de referência automática: <strong>{refWeek.label}</strong>. CORS pode bloquear chamadas diretas do browser.
          </div>
          <input
            value={cfg.apiToken || ""}
            onChange={e => sCfg({ ...cfg, apiToken: e.target.value })}
            placeholder="Cole aqui seu X-INTEGRACAO-TOKEN"
            type="password"
            style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* Integração API */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: B.navy, marginBottom: "10px", fontSize: "14px" }}>🔌 Integração API TitaTherapy</div>
        <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
          Busca a grade de profissionais diretamente da API, sem precisar exportar CSV manualmente. Configure o token acima antes de usar.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 700 }}>Próxima referência:</span>
          <span style={{ fontSize: "13px", fontWeight: 800, color: B.blue }}>{refWeek.label}</span>
          <button onClick={onApiFetch} disabled={apiFetch}
            style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "8px", background: B.blue, color: "white", border: "none", cursor: apiFetch ? "default" : "pointer", fontFamily: "inherit", fontWeight: 700, opacity: apiFetch ? 0.7 : 1 }}>
            {apiFetch ? "⏳ Buscando..." : "⬇ Buscar da API"}
          </button>
        </div>
        {apiErr && (
          <div style={{ marginTop: "8px", background: B.orangeLt, border: `1px solid ${B.orange}44`, borderRadius: "10px", padding: "8px 12px", fontSize: "12px", color: B.orange }}>
            {apiErr}
          </div>
        )}
      </div>

    </div>
  )
}
