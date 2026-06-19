"use client"

import { useState } from "react"
import { B } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import { PBadge } from "@/components/cronograma/ui/PBadge"
import type { Sugestao, WaStatus } from "@/types/cronograma"

const REGRA_LABEL: Record<string, string> = {
  "R1":          "Regra 1 — Completar Grupo",
  "R2":          "Regra 2 — Sessão Livre Adjacente",
  "R3":          "Regra 3 — Novo Dia",
  "R4":          "Regra 4 — Remanejamento",
  "Ocup. R2":    "Regra 2 — Sessão Livre Adjacente",
  "Foco adj.":   "Foco — Sessão Adjacente",
  "Foco novo dia": "Foco — Novo Dia",
}

const WA_ST: Record<string, { lbl: string; bg: string; color: string }> = {
  "":         { lbl: "",                  bg: "",        color: ""        },
  aguardando: { lbl: "⏳ Aguardando WA",  bg: B.blueLt,  color: B.blue   },
  aceito:     { lbl: "✅ Aceito",         bg: B.limeLt,  color: "#5a8a30" },
  recusado:   { lbl: "❌ Recusado",       bg: "#fef2f2", color: "#dc2626" },
  inviavel:   { lbl: "⛔ Inviável",       bg: "var(--muted)", color: "var(--muted-foreground)" },
}

export interface SugCardProps {
  s: Sugestao
  waStatus: WaStatus | null
  onWA: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
  fila?: boolean
}

export function SugCard({ s, waStatus, onWA, onInv, onCron, fila = false }: SugCardProps) {
  const [confirming, setConfirming] = useState(false)

  const isGrupo = s.colegas !== "—"
  const isR4    = s.regra === "R4"

  const tipoColor = isGrupo ? B.purple : B.blue
  const tipoBg    = isGrupo ? B.purpleLt : B.blueLt
  const cardBd    = confirming ? B.lime : isGrupo ? `${B.purple}33` : "var(--border)"
  const cardBg    = isGrupo ? B.purpleLt : "var(--card)"

  const wa = WA_ST[waStatus ?? ""] ?? WA_ST[""]

  return (
    <>
      <div style={{ border: `1px solid ${cardBd}`, background: cardBg, borderRadius: "14px", padding: "12px", marginBottom: "4px", opacity: waStatus === "aceito" ? 0.5 : 1, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        {/* ── Header: badges + ações ── */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
            <span style={{ background: tipoBg, color: tipoColor, border: `1px solid ${tipoColor}33`, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 700 }}>
              {isGrupo ? "👥 Montar Grupo" : "📅 Ocupar Vaga Livre"}
            </span>
            <span style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderRadius: "999px", padding: "2px 7px", fontSize: "11px", fontWeight: 500 }}>
              {REGRA_LABEL[s.regra] ?? s.regra}
            </span>
            <PBadge prio={s.prio} />
            {fila && s.filaM && (
              <span style={{ background: B.orangeLt, color: B.orange, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600 }}>
                Fila: {s.filaM}
              </span>
            )}
            {s.obs && (
              <span style={{ background: s.obs.includes("Juliana") ? "#fef2f2" : B.orangeLt, color: s.obs.includes("Juliana") ? "#dc2626" : B.orange, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600 }}>
                {s.obs}
              </span>
            )}
            {wa.lbl && (
              <span
                title={waStatus === "aguardando" ? "Vaga reservada: só libera com Recusado, Inviável ou Desfazer envio." : "Status da proposta."}
                style={{ background: wa.bg, color: wa.color, border: `1px solid ${wa.color}33`, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, cursor: "help" }}
              >
                {wa.lbl}
              </span>
            )}
          </div>

          {!confirming && (
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              <button onClick={() => onCron(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer" }}>
                🗓 Ver
              </button>
              {!waStatus && (
                <button onClick={() => setConfirming(true)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: B.limeLt, color: "#4a6e20", border: `1px solid ${B.lime}`, cursor: "pointer", fontWeight: 700 }}>
                  Aceitar (→ Acompanhamento)
                </button>
              )}
              {!waStatus && (
                <button onClick={() => onInv(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer" }}>
                  ⛔ Inviável
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Grid de detalhes ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: "12px" }}>
          <div>
            <div style={{ color: "var(--muted-foreground)" }}>Paciente</div>
            <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>{s.pac}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted-foreground)" }}>Profissional</div>
            <div style={{ color: "var(--card-foreground)" }}>{fmtName(s.prof)}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted-foreground)" }}>Terapia (Exibição)</div>
            <div style={{ color: "var(--card-foreground)" }}>{s.tP}{s.esp && s.esp !== s.tP ? ` (${s.esp})` : ""}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted-foreground)" }}>Unidade</div>
            <div style={{ color: "var(--card-foreground)" }}>{s.unidade}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted-foreground)" }}>Dia / Hora</div>
            <div style={{ fontWeight: 700, color: B.navy }}>{s.dia} {s.hora}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted-foreground)" }}>Gap / Convênio</div>
            <div style={{ color: "var(--card-foreground)" }}>{s.gap > 0 ? `+${s.gap}x` : "—"} · {s.conv || "—"}</div>
          </div>
          {s.colegas !== "—" && (() => {
            const membros = s.colegas.split(", ").filter(Boolean)
            const total = membros.length + 1
            return (
              <div style={{ gridColumn: "1/3" }}>
                <div style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: "6px" }}>
                  Grupo na sessão
                  <span style={{ background: B.purpleLt, color: B.purple, border: `1px solid ${B.purple}33`, borderRadius: "999px", padding: "0 7px", fontSize: "11px", fontWeight: 700 }}>
                    {total} pessoas
                  </span>
                </div>
                <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {membros.map((m, i) => (
                    <div key={i} style={{ fontSize: "12px", color: B.purple, fontWeight: 600, display: "flex", gap: "6px", alignItems: "baseline" }}>
                      <span style={{ fontSize: "10px", fontWeight: 800, color: B.purple, minWidth: "14px" }}>{i + 1}.</span>
                      {m}
                    </div>
                  ))}
                  <div style={{ fontSize: "12px", color: "var(--muted-foreground)", fontStyle: "italic", display: "flex", gap: "6px", alignItems: "baseline" }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--muted-foreground)", minWidth: "14px" }}>{total}.</span>
                    {s.pac} <span style={{ fontSize: "10px" }}>(este paciente)</span>
                  </div>
                </div>
              </div>
            )
          })()}
          {s.vComp && s.vComp !== "—" && (
            <div style={{ gridColumn: "1/3" }}>
              <div style={{ color: "var(--muted-foreground)" }}>
                {isR4 ? "⟳ Remanejamento" : s.regra?.startsWith("Foco") ? "Atenção para oferta" : "Vaga complementar (R3 — oferecer junto)"}
              </div>
              <div style={{ color: B.orange, fontWeight: 600 }}>{s.vComp}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de confirmação ── */}
      {confirming && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
          onClick={e => { if (e.target === e.currentTarget) setConfirming(false) }}
        >
          <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "400px", width: "100%", padding: "24px" }}>
            <div style={{ fontWeight: 900, fontSize: "17px", color: B.navy, marginBottom: "4px" }}>
              Aceitar e enviar para Acompanhamento
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "16px" }}>
              A vaga ficará reservada e aparecerá em Acompanhamento → Aguardando Resposta.
            </div>

            {/* Resumo da proposta */}
            <div style={{ background: B.limeLt, border: `1px solid ${B.lime}`, borderRadius: "12px", padding: "14px", marginBottom: "18px" }}>
              <div style={{ fontWeight: 800, fontSize: "14px", color: B.navy, marginBottom: "6px" }}>{s.pac}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "12px" }}>
                <div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Terapia</div>
                  <div style={{ fontWeight: 600, color: "var(--card-foreground)" }}>{s.tP}</div>
                </div>
                <div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Profissional</div>
                  <div style={{ fontWeight: 600, color: "var(--card-foreground)" }}>{fmtName(s.prof)}</div>
                </div>
                <div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Dia / Hora</div>
                  <div style={{ fontWeight: 700, color: B.navy }}>{s.dia} {s.hora}</div>
                </div>
                <div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Unidade</div>
                  <div style={{ fontWeight: 600, color: "var(--card-foreground)" }}>{s.unidade}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { onWA(s); setConfirming(false) }}
                style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", background: "#16a34a", color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", background: "var(--muted)", color: "var(--card-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: "13px" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
