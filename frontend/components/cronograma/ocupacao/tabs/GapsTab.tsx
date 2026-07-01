"use client"

import { useMemo, useState } from "react"
import { B, TERAPIA_CORES } from "@/lib/cronograma/constants"
import type { AlgorithmResult } from "@/types/cronograma"

interface Props {
  res: AlgorithmResult | null
}

type GapFilt = "all" | "pos" | "zero" | "neg" | "alta"

export function GapsTab({ res }: Props) {
  const [gapSearch, setGapSearch] = useState("")
  const [gapFilt, setGapFilt] = useState<GapFilt>("pos")
  const [gapTudoZero, setGapTudoZero] = useState(false)
  const [gapEsp, setGapEsp] = useState("")

  const espOpts = useMemo(() => [...new Set((res?.allGaps || []).map(g => g.esp))].sort(), [res])

  const rows = useMemo(() => {
    let r = res?.allGaps || []
    if (gapSearch) r = r.filter(g => g.pac.toLowerCase().includes(gapSearch.toLowerCase()))
    if (gapEsp) r = r.filter(g => g.esp === gapEsp)
    if (gapFilt === "pos") r = r.filter(g => g.gap > 0 && !g.isAlta)
    else if (gapFilt === "zero") r = r.filter(g => g.gap === 0 && !g.isAlta)
    else if (gapFilt === "neg") r = r.filter(g => g.gap < 0 && !g.isAlta)
    else if (gapFilt === "alta") r = r.filter(g => g.isAlta)
    // "all" inclui tudo
    if (gapTudoZero) {
      const baseGaps = gapFilt === "alta"
        ? (res?.allGaps || []).filter(g => g.isAlta)
        : (res?.allGaps || [])
      const pacOf: Record<string, number> = {}
      for (const g of baseGaps) { pacOf[g.pac] = (pacOf[g.pac] || 0) + g.of }
      r = r.filter(g => pacOf[g.pac] === 0)
    }
    return [...r].sort((a, b) => a.pac.localeCompare(b.pac) || b.gap - a.gap)
  }, [res, gapSearch, gapEsp, gapFilt, gapTudoZero])

  const gapColor = (g: number) => g > 0 ? "#dc2626" : g < 0 ? "#d97706" : "#4a6e20"
  const gapBg = (g: number) => g > 0 ? "#fef2f2" : g < 0 ? "#fffbeb" : B.limeLt
  const gapLabel = (g: number) => g > 0 ? `−${g} faltando` : g < 0 ? `+${Math.abs(g)} a mais` : "✓ ok"

  const inputSt: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", fontFamily: "inherit" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <input value={gapSearch} onChange={e => setGapSearch(e.target.value)} placeholder="🔍 Buscar paciente..." style={{ ...inputSt, flex: "1", minWidth: "150px" }} />
          <select value={gapEsp} onChange={e => setGapEsp(e.target.value)} style={{ ...inputSt, background: "var(--card)" }}>
            <option value="">Todas especialidades</option>
            {espOpts.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          {(["all", "pos", "zero", "neg", "alta"] as GapFilt[]).map(v => {
            const labels: Record<GapFilt, string> = { all: "Todos", pos: "Gap > 0", zero: "Sem gap", neg: "Sobre-agendado", alta: "⬆️ Com Alta" }
            const isAlta = v === "alta"
            const activeColor = isAlta ? "#d97706" : B.blue
            const activeBg = isAlta ? "#fffbeb" : "var(--cron-active-bg)"
            return (
              <button key={v} onClick={() => setGapFilt(v)}
                style={{ padding: "6px 12px", borderRadius: "8px", border: `1px solid ${gapFilt === v ? activeColor : "var(--border)"}`, background: gapFilt === v ? activeBg : "var(--card)", color: gapFilt === v ? activeColor : "var(--card-foreground)", fontSize: "12px", fontWeight: gapFilt === v ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                {labels[v]}
              </button>
            )
          })}
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: gapTudoZero ? "#dc2626" : "var(--muted-foreground)", fontWeight: gapTudoZero ? 700 : 400 }}>
            <input type="checkbox" checked={gapTudoZero} onChange={e => setGapTudoZero(e.target.checked)} style={{ accentColor: "#dc2626" }} />
            Sem nada agendado
          </label>
          {gapSearch && <button onClick={() => setGapSearch("")} style={{ fontSize: "12px", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>✕</button>}
        </div>
      </div>

      {!rows.length ? (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "2px dashed var(--border)", padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "8px" }}>✅</div>
          <div style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>Nenhum gap com esses filtros</div>
        </div>
      ) : (
        <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>📊 Gaps — {rows.length} entradas</span>
            <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: "var(--muted-foreground)" }}>
              <span style={{ color: "#dc2626" }}>● Gap positivo = faltando sessões</span>
              <span style={{ color: "#d97706" }}>● Negativo = sobre-agendado</span>
              <span style={{ color: "#4a6e20" }}>● Zero = ok</span>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead style={{ background: "var(--muted)", position: "sticky", top: 0 }}>
                <tr>
                  {["Paciente", "Especialidade", "Autorizado", "Ofertado", "Diferença"].map(h => (
                    <th key={h} style={{ textAlign: h === "Paciente" || h === "Especialidade" ? "left" : "center", padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((g, i) => {
                  const tc = TERAPIA_CORES[g.esp]
                  const tcBg = tc && tc !== "#FFFFFF" && tc !== "var(--border)" ? tc + "22" : "#f0f0ff"
                  const tcBd = tc && tc !== "#FFFFFF" && tc !== "var(--border)" ? tc + "88" : "#c4c4e8"
                  const rowBg = g.isAlta ? "#fffbeb" : i % 2 === 0 ? "white" : "var(--card)"
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)", background: rowBg, opacity: g.isAlta ? 0.8 : 1 }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: B.navy, fontSize: "12px" }}>{g.pac}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ background: tcBg, color: tc && tc !== "#FFFFFF" ? "#1a1a1a" : B.blue, border: `1px solid ${tcBd}`, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600 }}>{g.esp}</span>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--card-foreground)", fontWeight: 600 }}>{g.aut || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", color: "var(--card-foreground)" }}>{g.of}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        {g.isAlta ? (
                          <span style={{ fontWeight: 700, color: "#d97706", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "999px", padding: "2px 10px", fontSize: "11px" }}
                            title="Paciente recebeu alta para esta especialidade. O gap é esperado.">
                            ⬆️ Alta
                          </span>
                        ) : (
                          <span style={{ fontWeight: 800, color: gapColor(g.gap), background: gapBg(g.gap), borderRadius: "999px", padding: "2px 10px", fontSize: "12px" }}>
                            {gapLabel(g.gap)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
