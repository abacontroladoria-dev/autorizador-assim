"use client"

import { B } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import { PBadge } from "@/components/cronograma/ui/PBadge"
import type { Sugestao, WaStatus } from "@/types/cronograma"

const WA_ST: Record<string, { lbl: string; bg: string; color: string }> = {
  "":         { lbl: "",                  bg: "",        color: ""        },
  aguardando: { lbl: "⏳ Aguardando WA",  bg: B.blueLt,  color: B.blue   },
  aceito:     { lbl: "✅ Aceito",         bg: B.limeLt,  color: "#5a8a30" },
  recusado:   { lbl: "❌ Recusado",       bg: "#fef2f2", color: "#dc2626" },
  inviavel:   { lbl: "⛔ Inviável",       bg: "#f3f4f6", color: "#6b7280" },
}

export interface SugCardProps {
  s: Sugestao
  waStatus: WaStatus | null
  onWA: (s: Sugestao) => void
  onWAUndo: (s: Sugestao) => void
  onWAStatus: (s: Sugestao, st: WaStatus) => void
  onRec: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
  fila?: boolean
}

export function SugCard({ s, waStatus, onWA, onWAUndo, onWAStatus, onRec, onInv, onCron, fila = false }: SugCardProps) {
  const isM    = s.mod === "Musicoterapia"
  const isFoco = s.mod === "Foco Prof."
  const isR4   = s.regra === "R4"

  const modColor = isM ? B.purple : isFoco ? "#4a6e20" : B.blue
  const modBg    = isM ? B.purpleLt : isFoco ? B.limeLt : B.blueLt
  const cardBd   = isM ? `${B.purple}33` : isFoco ? `${B.lime}66` : "#e5e7eb"
  const cardBg   = isM ? B.purpleLt : isFoco ? "#fbfdf4" : "white"

  const wa = WA_ST[waStatus ?? ""] ?? WA_ST[""]

  return (
    <div style={{ border: `1px solid ${cardBd}`, background: cardBg, borderRadius: "14px", padding: "12px", marginBottom: "4px", opacity: waStatus === "aceito" ? 0.5 : 1, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
      {/* ── Header: badges + ações ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
          <span style={{ background: modBg, color: modColor, border: `1px solid ${modColor}33`, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 700 }}>
            {isM ? "🎵 Musicoterapia" : isFoco ? "🎯 Foco Prof." : "📅 Ocupação"}
          </span>
          <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: "999px", padding: "2px 7px", fontSize: "11px", fontWeight: 500 }}>
            {s.regra}
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

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button onClick={() => onCron(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer" }}>
            🗓 Ver
          </button>
          {!waStatus && (
            <button onClick={() => onWA(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer" }}>
              Oferecer via WA
            </button>
          )}
          {waStatus === "aguardando" && (
            <>
              <button onClick={() => onWAStatus(s, "aceito")} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: B.limeLt, color: "#5a8a30", border: `1px solid ${B.lime}`, cursor: "pointer" }}>✅ Aceito</button>
              <button onClick={() => onWAStatus(s, "recusado")} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer" }}>❌ Recusou</button>
              <button onClick={() => onInv(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>⛔ Inviável</button>
              <button onClick={() => onWAUndo(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>Desfazer envio</button>
            </>
          )}
          {!waStatus && (
            <button onClick={() => onRec(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer" }}>❌ Recusou</button>
          )}
          {!waStatus && (
            <button onClick={() => onInv(s)} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer" }}>⛔ Inviável</button>
          )}
        </div>
      </div>

      {/* ── Grid de detalhes ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: "12px" }}>
        <div>
          <div style={{ color: "#9ca3af" }}>Paciente</div>
          <div style={{ fontWeight: 800, color: B.navy, fontSize: "14px" }}>{s.pac}</div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Profissional</div>
          <div style={{ color: "#374151" }}>{fmtName(s.prof)}</div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Terapia (Exibição)</div>
          <div style={{ color: "#374151" }}>{s.tP}{s.esp && s.esp !== s.tP ? ` (${s.esp})` : ""}</div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Unidade</div>
          <div style={{ color: "#374151" }}>{s.unidade}</div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Dia / Hora</div>
          <div style={{ fontWeight: 700, color: B.navy }}>{s.dia} {s.hora}</div>
        </div>
        <div>
          <div style={{ color: "#9ca3af" }}>Gap / Convênio</div>
          <div style={{ color: "#374151" }}>{s.gap > 0 ? `+${s.gap}x` : "—"} · {s.conv || "—"}</div>
        </div>
        {s.colegas !== "—" && (
          <div style={{ gridColumn: "1/3" }}>
            <div style={{ color: "#9ca3af" }}>Colegas no slot</div>
            <div style={{ color: B.purple, fontWeight: 600 }}>{s.colegas}</div>
          </div>
        )}
        {s.vComp && s.vComp !== "—" && (
          <div style={{ gridColumn: "1/3" }}>
            <div style={{ color: "#9ca3af" }}>
              {isR4 ? "⟳ Remanejamento" : s.regra?.startsWith("Foco") ? "Atenção para oferta" : "Vaga complementar (R3 — oferecer junto)"}
            </div>
            <div style={{ color: B.orange, fontWeight: 600 }}>{s.vComp}</div>
          </div>
        )}
      </div>
    </div>
  )
}
