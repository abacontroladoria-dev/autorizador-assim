"use client"

import { useMemo, useState } from "react"
import { B, DIAS_LIST, HORAS_GRID, REGRAS_NOVO_CRON } from "@/lib/cronograma/constants"
import { buildNewCronograma, type NovoCronogramaResult, type EspEntry } from "@/lib/cronograma/novoCronograma"
import { fm, fmtName, pm } from "@/lib/cronograma/helpers"
import type { CsvRow, DispRow, LaudoRow } from "@/types/cronograma"

interface Props {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  dispRows: DispRow[]
}

const ESP_ORD_T = [
  "Fonoaudiologia", "Terapia Ocupacional", "Psicologia ABA", "Musicoterapia",
  "Psicopedagogia", "Psicomotricidade", "Terapia Alimentar", "Fisioterapia Motora",
  "Fisioterapia Aquática", "Equoterapia", "Arteterapia", "Psicologia", "Habilidades Sociais",
]

function scColor(esp: string): { bg: string; bd: string; tx: string } {
  if (esp === "Psicologia ABA") return { bg: B.blueLt, bd: `${B.blue}66`, tx: B.blue }
  if (esp === "Fonoaudiologia") return { bg: B.pinkLt, bd: `${B.pink}88`, tx: "#b85a8e" }
  if (esp === "Terapia Ocupacional") return { bg: B.orangeLt, bd: `${B.orange}66`, tx: B.orange }
  if (esp === "Musicoterapia") return { bg: B.purpleLt, bd: `${B.purple}66`, tx: B.purple }
  return { bg: B.limeLt, bd: `${B.lime}88`, tx: "#4a6e20" }
}

export function NovoCronogramaTab({ cRows, lRows, dispRows }: Props) {
  const [paciente, setPaciente] = useState("")
  const [unidade, setUnidade] = useState("Realengo")
  const [result, setResult] = useState<NovoCronogramaResult | null>(null)

  const pacsAtivos = useMemo(() => {
    const s = new Set(
      lRows
        .filter(r => String(r["Situação"] || "") === "Vigente")
        .map(r => String(r["Paciente"] || "").trim())
        .filter(Boolean),
    )
    return [...s].sort()
  }, [lRows])

  const livreSlots = useMemo(
    () => cRows.filter(r => r["Status do Agendamento"] === "Livre"),
    [cRows],
  )

  function handleGerar() {
    if (!paciente || lRows.length === 0 || cRows.length === 0) return
    setResult(buildNewCronograma(paciente, unidade, dispRows, lRows, livreSlots))
  }

  const diasResult = result
    ? DIAS_LIST.filter(d => result.availWindows[d] || result.schedule[d])
    : []

  const totalSess = result
    ? Object.values(result.schedule).reduce((a, ds) => a + Object.keys(ds).length, 0)
    : 0

  const espRows = result
    ? [...ESP_ORD_T.filter(e => result.espTable[e]), ...Object.keys(result.espTable).filter(e => !ESP_ORD_T.includes(e))]
    : []

  const canGerar = !!paciente && lRows.length > 0 && cRows.length > 0

  return (
    <div className="flex flex-col gap-3">
      {/* Formulário */}
      <div className="rounded-[14px] border border-border bg-card shadow-sm p-4">
        <div className="font-extrabold mb-3 text-[15px]" style={{ color: B.navy }}>
          Novo Cronograma do Zero
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          {/* Paciente */}
          <div>
            <label className="block text-[12px] font-bold text-muted-foreground mb-1">Paciente</label>
            <select
              value={paciente}
              onChange={e => { setPaciente(e.target.value); setResult(null) }}
              className="w-full border border-input rounded-lg px-3 py-2 text-[13px] bg-background font-sans"
            >
              <option value="">Selecionar paciente...</option>
              {pacsAtivos.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {lRows.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">Carregue o relatório de laudos primeiro</p>
            )}
          </div>

          {/* Unidade */}
          <div>
            <label className="block text-[12px] font-bold text-muted-foreground mb-1">Unidade</label>
            <div className="flex gap-1.5">
              {(["Realengo", "Fazendinha", "Padre Miguel"] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setUnidade(u)}
                  className="flex-1 py-2 px-1 rounded-lg border text-[12px] font-sans transition-colors"
                  style={{
                    border: `1px solid ${unidade === u ? B.blue : "#d1d5db"}`,
                    background: unidade === u ? B.blueLt : "transparent",
                    color: unidade === u ? B.blue : "#374151",
                    fontWeight: unidade === u ? 700 : 400,
                    cursor: "pointer",
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Gerar */}
          <button
            onClick={handleGerar}
            disabled={!canGerar}
            className="px-5 py-2.5 rounded-[10px] text-white text-[13px] font-extrabold font-sans border-none transition-opacity"
            style={{ background: canGerar ? B.navy : `${B.navy}55`, cursor: canGerar ? "pointer" : "not-allowed" }}
          >
            ▶ Gerar
          </button>
        </div>

        {dispRows.length === 0 && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-[12px]"
            style={{ background: B.orangeLt, border: `1px solid ${B.orange}44`, color: B.orange }}
          >
            Disponibilidade não carregada — faça o upload do CSV do Órbita (disponibilidades_…csv) na seção de dados acima.
          </div>
        )}
      </div>

      {result && (
        <>
          {/* Alertas */}
          {result.alertas.length > 0 && (
            <div className="flex flex-col gap-1">
              {result.alertas.map((a, i) => (
                <div
                  key={i}
                  className="px-3.5 py-2 rounded-[10px] text-[12px] font-semibold"
                  style={{
                    background: a.tipo === "error" ? "#fef2f2" : a.tipo === "warn" ? B.orangeLt : B.blueLt,
                    color: a.tipo === "error" ? "#dc2626" : a.tipo === "warn" ? B.orange : B.blue,
                    border: `1px solid ${a.tipo === "error" ? "#fca5a5" : a.tipo === "warn" ? `${B.orange}44` : `${B.blue}33`}`,
                  }}
                >
                  {a.tipo === "error" ? "❌" : a.tipo === "warn" ? "⚠️" : "ℹ️"} {a.msg}
                </div>
              ))}
            </div>
          )}

          {/* Resumo */}
          <ResumoBar paciente={paciente} unidade={unidade} result={result} totalSess={totalSess} espRows={espRows} />

          {/* Grade */}
          <GradePanel diasResult={diasResult} result={result} />

          {/* Tabela Laudo */}
          <LaudoTable espRows={espRows} result={result} />

          {/* Regras */}
          <RegrasPanel />
        </>
      )}
    </div>
  )
}

// ─── SUB-COMPONENTES ──────────────────────────────────────────────────────────

function ResumoBar({
  paciente,
  unidade,
  result,
  totalSess,
  espRows,
}: {
  paciente: string
  unidade: string
  result: NovoCronogramaResult
  totalSess: number
  espRows: string[]
}) {
  const totalEsps = Object.values(result.espTable).filter((e: EspEntry) => e.vigente && e.aut > 0).length
  const alocEsps = Object.values(result.espTable).filter((e: EspEntry) => e.of > 0).length

  return (
    <div
      className="rounded-xl border border-border bg-card px-4 py-3 flex gap-3.5 flex-wrap items-center"
    >
      <div>
        <span className="font-extrabold text-[16px]" style={{ color: B.navy }}>{paciente}</span>
        <span className="ml-1.5 text-[12px] text-muted-foreground">— {unidade}</span>
      </div>
      <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: B.limeLt, color: "#4a6e20" }}>
        {totalSess} sessões
      </span>
      <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: B.purpleLt, color: B.purple }}>
        {alocEsps}/{totalEsps} especialidades
      </span>
      {result.turnoClinico && (
        <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: B.orangeLt, color: B.orange }}>
          🕐 Clínica: {result.turnoClinico === "manha" ? "Manhã" : "Tarde"}
        </span>
      )}
    </div>
  )
}

function GradePanel({
  diasResult,
  result,
}: {
  diasResult: string[]
  result: NovoCronogramaResult
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4 overflow-x-auto">
      <div className="font-extrabold mb-2.5 text-[14px]" style={{ color: B.navy }}>📅 Grade Sugerida</div>
      <div className="flex gap-3 mb-3 text-[11px] text-muted-foreground flex-wrap">
        <span>
          <span
            className="inline-block w-3 h-3 rounded-[3px] mr-1 align-middle"
            style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
          />
          Disponível — não preenchido
        </span>
        <span>
          <span
            className="inline-block w-3 h-3 rounded-[3px] mr-1 align-middle"
            style={{ background: B.limeLt, border: `1px solid ${B.lime}` }}
          />
          Sessão alocada
        </span>
      </div>

      {diasResult.length === 0 ? (
        <div className="text-center text-muted-foreground py-6">Nenhuma disponibilidade encontrada.</div>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "500px" }}>
          <thead>
            <tr>
              <th style={{ width: "60px", textAlign: "right", paddingRight: "14px", paddingBottom: "10px", fontSize: "13px", color: "#9ca3af", fontWeight: 500 }}>
                Hora
              </th>
              {diasResult.map(d => (
                <th key={d} style={{ minWidth: "160px", paddingBottom: "10px", textAlign: "center", fontSize: "15px", color: B.navy, fontWeight: 800 }}>
                  {d.replace("-feira", "")}
                  {result.availWindows[d] && (
                    <div style={{ fontSize: "11px", fontWeight: 400, color: "#9ca3af", marginTop: "2px" }}>
                      {fm(result.availWindows[d].inicio)}–{fm(result.availWindows[d].fim)}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HORAS_GRID.map(hora => {
              const rowData = diasResult.map(d => {
                const hi = pm(hora)
                const w = result.availWindows[d]
                const inWin = w && hi !== null && hi >= w.inicio && hi < w.fim
                return { inWin, sess: result.schedule[d]?.[hora] }
              })
              if (!rowData.some(c => c.inWin || c.sess)) return null
              return (
                <tr key={hora} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ textAlign: "right", paddingRight: "14px", verticalAlign: "middle", fontFamily: "monospace", fontSize: "16px", fontWeight: 800, color: B.navy, letterSpacing: "-0.5px", paddingTop: "4px", paddingBottom: "4px" }}>
                    {hora}
                  </td>
                  {diasResult.map((d, di) => {
                    const { inWin, sess } = rowData[di]
                    const sc = sess ? scColor(sess.esp) : null
                    return (
                      <td key={d} style={{ padding: "3px" }}>
                        <div
                          style={{
                            minHeight: "72px",
                            borderRadius: "10px",
                            background: sess ? sc!.bg : inWin ? "#fffbeb" : "transparent",
                            border: sess ? `1px solid ${sc!.bd}` : inWin ? "1px solid #fde68a" : "none",
                            padding: sess || inWin ? "8px 10px" : "0",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                          }}
                        >
                          {sess && (
                            <>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1f2937", lineHeight: "1.3" }}>{sess.tP}</div>
                              {sess.esp !== sess.tP && (
                                <div style={{ fontSize: "10px", color: "#9ca3af" }}>({sess.esp})</div>
                              )}
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>{fmtName(sess.prof)}</div>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: sc!.tx, marginTop: "auto", paddingTop: "4px" }}>✦ Novo</div>
                            </>
                          )}
                        </div>
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
  )
}

function LaudoTable({ espRows, result }: { espRows: string[]; result: NovoCronogramaResult }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className="font-extrabold mb-3 text-[14px]" style={{ color: B.navy }}>
        📋 Laudo — Solicitado × Autorizado × Ofertado
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead style={{ background: "#f8fafc" }}>
          <tr>
            {["Especialidade", "Solicitado (Laudo)", "Autorizado (Convênio)", "Ofertado (Novo Crono)"].map(h => (
              <th
                key={h}
                style={{
                  textAlign: h === "Especialidade" ? "left" : "center",
                  padding: "8px 12px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {espRows.map(esp => {
            const entry = result.espTable[esp]
            if (!entry) return null
            const { sol, aut, of: of_, vigente } = entry
            const ok = aut > 0 && of_ >= aut
            const partial = of_ > 0 && of_ < aut
            const none = aut > 0 && of_ === 0
            const ofC = ok ? "#4a6e20" : partial ? B.orange : none ? "#dc2626" : "#6b7280"
            const ofBg = ok ? B.limeLt : partial ? B.orangeLt : none ? "#fef2f2" : "#f8fafc"
            return (
              <tr key={esp} style={{ borderTop: "1px solid #f0f0f0" }}>
                <td style={{ padding: "9px 12px" }}>
                  <span style={{ background: B.blueLt, color: B.blue, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600 }}>
                    {esp}
                  </span>
                  {!vigente && <span style={{ marginLeft: "6px", fontSize: "10px", color: "#9ca3af" }}>vencido</span>}
                </td>
                <td style={{ padding: "9px 12px", color: "#6b7280", textAlign: "center" }}>{sol || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, color: B.navy }}>{aut || "—"}</td>
                <td style={{ padding: "9px 12px", textAlign: "center" }}>
                  <span style={{ fontWeight: 800, color: ofC, background: ofBg, borderRadius: "999px", padding: "3px 12px" }}>
                    {of_}{aut > 0 ? ` / ${aut}` : ""}{ok ? " ✓" : partial ? " ▲" : none ? " ✗" : ""}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RegrasPanel() {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className="font-extrabold mb-3 text-[14px]" style={{ color: B.navy }}>
        📐 Regras Aplicadas neste Cronograma
      </div>
      <div className="flex flex-col gap-1.5">
        {REGRAS_NOVO_CRON.map((r, i) => (
          <div key={i} className="flex gap-3 p-2.5 rounded-lg text-[12px]" style={{ background: "#fafafa", border: "1px solid #f0f0f0" }}>
            <span className="text-base shrink-0">{r.icon}</span>
            <div>
              <div className="font-bold mb-0.5" style={{ color: B.navy }}>{r.title}</div>
              <div className="text-muted-foreground leading-relaxed">{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
