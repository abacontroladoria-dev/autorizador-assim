"use client"

import { B, DIAS_LIST, DIAS_ORD, HORAS_GRID } from "@/lib/cronograma/constants"
import { fmtName, exU, buildCronoUnitMeta, shouldShowSessionUnit, unidadeBadgeText } from "@/lib/cronograma/helpers"
import { CronoGlobalUnitBadge, UnitHeaderBadges } from "@/components/cronograma/ui/UnitBadges"
import type { Sugestao, CsvRowProcessada } from "@/types/cronograma"

// ─── CronCard ────────────────────────────────────────────────────────────────

interface CronEntry {
  tP: string
  tE: string
  prof: string
  tipo: "exist" | "novo" | "rem"
  unidade: string
}

function CronCard({ tP, tE, prof, tipo, unidade, showUnidade = false }: CronEntry & { showUnidade?: boolean }) {
  const showExib = tE && tE !== tP
  const bg = tipo === "novo" ? B.limeLt : tipo === "rem" ? B.orangeLt : "#f8fafc"
  const bd = tipo === "novo" ? B.lime   : tipo === "rem" ? `${B.orange}88` : "#e2e8f0"

  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: "10px", padding: "9px 11px", minHeight: "80px", display: "flex", flexDirection: "column", gap: "3px", marginBottom: "4px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1f2937", lineHeight: "1.3" }}>{tP}</div>
      {showExib && <div style={{ fontSize: "11px", color: "#9ca3af" }}>({tE})</div>}
      <div style={{ fontSize: "12px", color: "#6b7280" }}>{fmtName(prof)}</div>
      {showUnidade && unidade && unidade !== "Desconhecida" && (
        <div
          title="Unidade exibida porque este mesmo turno tem sessões em unidades diferentes."
          style={{ fontSize: "10px", fontWeight: 800, color: B.blue, background: B.blueLt, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "1px 7px", width: "fit-content", marginTop: "1px" }}
        >
          🏥 {unidadeBadgeText(unidade)}
        </div>
      )}
      {tipo === "novo" && <div style={{ fontSize: "12px", fontWeight: 700, color: B.purple, marginTop: "auto" }}>✦ Nova Terapia</div>}
      {tipo === "rem" && <div style={{ fontSize: "12px", fontWeight: 700, color: B.orange, marginTop: "auto" }}>⟳ Remanejada</div>}
    </div>
  )
}

// ─── CronModal ───────────────────────────────────────────────────────────────

export interface CronModalProps {
  pac: string | null
  sugsDosPac: Sugestao[]
  agendRows: CsvRowProcessada[] | null
  onClose: () => void
}

export function CronModal({ pac, sugsDosPac, agendRows, onClose }: CronModalProps) {
  if (!agendRows || !pac) return null

  // ── Sessões existentes do paciente ──
  const sess = agendRows.filter(r => r["Nome Favorecido"] === pac)
  const seenS = new Set<string>()
  const uniqueSess = sess.filter(r => {
    const k = `${r["Dia da Semana"]}|||${r.HI_str}|||${r["Profissional"]}|||${r["Terapia"]}`
    if (seenS.has(k)) return false
    seenS.add(k)
    return true
  })

  // ── Montar cMap com sessões existentes ──
  const cMap: Record<string, CronEntry[]> = {}
  for (const r of uniqueSess) {
    const k = `${r["Dia da Semana"]}|||${r.HI_str}`
    if (!cMap[k]) cMap[k] = []
    const tE = (r["Terapia Exibição"] ?? r["Terapia Exibicao"] ?? "") as string
    cMap[k].push({ tP: r["Terapia"] || "", tE, prof: r["Profissional"] || "", tipo: "exist", unidade: r.Unidade || exU(r["Sala"] as string) })
  }

  // ── Dedup sugestões ──
  const seenSug = new Set<string>()
  const uniqueSugs = sugsDosPac.filter(s => {
    const k = `${s.dia}|||${s.hora}|||${s.prof}|||${s.esp}`
    if (seenSug.has(k)) return false
    seenSug.add(k)
    return true
  })

  const convRow = uniqueSess.find(r => r["Convênio"] || r["Convenio"])
  const convenioPac = (convRow?.["Convênio"] || convRow?.["Convenio"] || uniqueSugs.find(s => s.conv)?.conv || "") as string

  // ── Melhor sugestão por célula (já ordenada por prioridade) ──
  const sugByCel: Record<string, Sugestao> = {}
  for (const s of uniqueSugs) {
    const k = `${s.dia}|||${s.hora}`
    if (!sugByCel[k]) sugByCel[k] = s
  }

  for (const [k, s] of Object.entries(sugByCel)) {
    if (!cMap[k]) cMap[k] = []
    cMap[k].push({ tP: s.tP || s.esp, tE: s.esp, prof: s.prof, tipo: "novo", unidade: s.unidade })
    if (s.isRem && s.remDia && s.remHora) {
      const rk = `${s.remDia}|||${s.remHora}`
      if (!cMap[rk]) cMap[rk] = []
      cMap[rk].push({ tP: s.remTer || "Remanejado", tE: "", prof: s.prof, tipo: "rem", unidade: s.unidade })
    }
  }

  // ── Vagas complementares (R1, R3, etc.) ──
  for (const s of uniqueSugs) {
    if (!s.vCompSlots?.length) continue
    for (const vc of s.vCompSlots) {
      const vk = `${vc.dia}|||${vc.hora}`
      if (!cMap[vk]) cMap[vk] = []
      const jaExiste = cMap[vk].some(c => c.prof === vc.prof && c.tipo === "novo")
      if (!jaExiste) cMap[vk].push({ tP: vc.tP, tE: vc.tE, prof: vc.prof, tipo: "novo", unidade: s.unidade })
    }
  }

  // ── Dias que aparecem no grid ──
  const allDias = new Set<string>([
    ...DIAS_LIST.slice(0, 5), // Segunda a Sexta sempre presentes
    ...DIAS_LIST.filter(d => uniqueSess.some(r => r["Dia da Semana"] === d)), // inclui Sábado se houver sessão
    ...uniqueSugs.map(s => s.dia),
    ...uniqueSugs.filter(s => s.remDia).map(s => s.remDia!),
    ...uniqueSugs.filter(s => s.vCompSlots?.length).flatMap(s => s.vCompSlots!.map(v => v.dia)),
  ])
  const dias = [...allDias].sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))
  const unitMeta = buildCronoUnitMeta(dias, cMap)

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "white", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", display: "flex", flexDirection: "column", width: "93vw", maxWidth: "980px", maxHeight: "93vh" }}>

        {/* ── Cabeçalho ── */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f0f0f0", background: "#fafafa", borderRadius: "18px 18px 0 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: "16px", color: B.navy }}>🗓 Cronograma — {pac}</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "5px" }}>
                <span style={{ background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 800 }}>
                  Convênio: {convenioPac || "—"}
                </span>
                <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "6px", fontSize: "12px", color: "#9ca3af" }}>
                <span>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", background: B.limeLt, border: `1px solid ${B.lime}`, marginRight: "4px", verticalAlign: "middle" }} />
                  Verde = nova terapia sugerida
                </span>
                <span>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", background: B.orangeLt, border: `1px solid ${B.orange}66`, marginRight: "4px", verticalAlign: "middle" }} />
                  Laranja = remanejada
                </span>
                <span>
                  <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", background: "#f8fafc", border: "1px solid #e2e8f0", marginRight: "4px", verticalAlign: "middle" }} />
                  Cinza = existente
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ width: "32px", height: "32px", borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: "18px", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Grid ── */}
        <div style={{ overflow: "auto", padding: "16px" }}>
          {!dias.length ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: "32px" }}>Nenhuma sessão encontrada no CSV.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "500px" }}>
              <thead>
                <tr>
                  <th style={{ width: "60px", paddingBottom: "10px", textAlign: "right", paddingRight: "14px", fontSize: "13px", color: "#9ca3af", fontWeight: 500 }}>Hora</th>
                  {dias.map(d => (
                    <th key={d} style={{ minWidth: "155px", paddingBottom: "10px", textAlign: "center", fontSize: "15px", color: B.navy, fontWeight: 800 }}>
                      <div>{d.replace("-feira", "")}</div>
                      <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORAS_GRID.map(hora => {
                  const any = dias.some(d => cMap[`${d}|||${hora}`]?.length)
                  if (!any) return null
                  return (
                    <tr key={hora} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ textAlign: "right", paddingRight: "14px", verticalAlign: "top", paddingTop: "10px", fontFamily: "monospace", fontSize: "17px", fontWeight: 800, color: B.navy, letterSpacing: "-0.5px" }}>
                        {hora}
                      </td>
                      {dias.map(d => {
                        const cs = cMap[`${d}|||${hora}`] || []
                        return (
                          <td key={d} style={{ padding: "4px 4px", verticalAlign: "top" }}>
                            {cs.map((c, i) => (
                              <CronCard key={i} {...c} showUnidade={shouldShowSessionUnit(unitMeta, d, hora)} />
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
