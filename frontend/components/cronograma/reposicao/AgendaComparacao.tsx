"use client"

import { useState } from "react"
import { B } from "@/lib/cronograma/constants"
import { fmtData } from "@/lib/cronograma/formatters"
import type {
  SessaoFaltada,
  SessaoAgendada,
  SugestaoReposicao,
  ReposicaoAceiteEntry,
} from "@/types/reposicao"

// ─── Constants ────────────────────────────────────────────────────────────────

const HORA_LABELS = [
  "08:00","08:40","09:20","10:00","10:40","11:20",
  "13:00","13:40","14:20","15:00","15:40","16:20","17:00",
]

const DIAS = ["Segunda","Terca","Quarta","Quinta","Sexta"]

const DIA_PT: Record<string,string> = {
  Segunda:"Segunda", Terca:"Terça", Quarta:"Quarta", Quinta:"Quinta", Sexta:"Sexta",
}

// ─── Cell components ──────────────────────────────────────────────────────────

function SessaoCell({ s }: { s: SessaoAgendada }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: 8,
      background: "var(--card)",
      border: "1px solid var(--border)",
      minHeight: 48,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 2, lineHeight: 1.2 }}>
        {s.terapiaExibicao || "—"}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)", lineHeight: 1.2 }}>
        {s.profissional}
      </div>
    </div>
  )
}

function FaltaCell({ falta }: { falta: SessaoFaltada }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: 8,
      background: "#fdf0f0",
      border: "1px solid #fecaca",
      minHeight: 48,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", marginBottom: 2 }}>
        Falta
      </div>
      <div style={{ fontSize: 11, color: "#991b1b", fontWeight: 600, lineHeight: 1.2 }}>
        {falta.terapiaExibicao || falta.terapia || "—"}
      </div>
      {falta.profissional && (
        <div style={{ fontSize: 10, color: "#b91c1c", lineHeight: 1.2 }}>{falta.profissional}</div>
      )}
    </div>
  )
}

function PropostaCell({ s }: { s: SugestaoReposicao }) {
  return (
    <div style={{
      padding: "6px 8px",
      borderRadius: 8,
      background: "#f0fdf4",
      border: "1px solid #86efac",
      minHeight: 48,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", marginBottom: 2 }}>
        Proposta
      </div>
      <div style={{ fontSize: 11, color: "#15803d", fontWeight: 600, lineHeight: 1.2 }}>
        {s.terapiaExibicao || s.terapia}
      </div>
      <div style={{ fontSize: 10, color: "#166534", lineHeight: 1.2 }}>{s.profissional}</div>
    </div>
  )
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

const COL_W = 116
const HORA_W = 48

function AgendaGrid({
  titulo,
  sessoesAgendadas,
  faltaHighlight,
  propostaHighlight,
  diaToDate,
}: {
  titulo:            string
  sessoesAgendadas:  SessaoAgendada[]
  faltaHighlight?:   { dia: string; hora: string; falta: SessaoFaltada }
  propostaHighlight?: SugestaoReposicao
  diaToDate:         Record<string,string>
}) {
  const lookup = new Map<string,SessaoAgendada>()
  for (const s of sessoesAgendadas) lookup.set(`${s.dia}_${s.hora}`, s)

  const horasSet = new Set<string>()
  for (const s of sessoesAgendadas) horasSet.add(s.hora)
  if (faltaHighlight)   horasSet.add(faltaHighlight.hora)
  if (propostaHighlight) horasSet.add(propostaHighlight.hora)

  const horas = HORA_LABELS.filter(h => horasSet.has(h))
  if (horas.length === 0) return null

  return (
    <div>
      {titulo && (
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--muted-foreground)",
          marginBottom: 8,
        }}>
          {titulo}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, minWidth: HORA_W + DIAS.length * (COL_W + 6) }}>
          {/* Header */}
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: HORA_W, flexShrink: 0 }} />
            {DIAS.map(dia => (
              <div key={dia} style={{ width: COL_W, flexShrink: 0, textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>
                  {DIA_PT[dia]}
                </div>
                {diaToDate[dia] && (
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                    {fmtData(diaToDate[dia])}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Rows */}
          {horas.map(hora => (
            <div key={hora} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
              <div style={{
                width: HORA_W,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 8,
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)" }}>
                  {hora}
                </span>
              </div>
              {DIAS.map(dia => {
                const key = `${dia}_${hora}`
                const isFalta     = faltaHighlight?.dia === dia && faltaHighlight?.hora === hora
                const isProposta  = propostaHighlight?.dia === dia && propostaHighlight?.hora === hora
                const sessao      = lookup.get(key)

                return (
                  <div key={dia} style={{ width: COL_W, flexShrink: 0 }}>
                    {isFalta ? (
                      <FaltaCell falta={faltaHighlight!.falta} />
                    ) : isProposta ? (
                      <PropostaCell s={propostaHighlight!} />
                    ) : sessao ? (
                      <SessaoCell s={sessao} />
                    ) : (
                      <div style={{ height: 48, borderRadius: 8, background: "transparent" }} />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Suggestion item (left panel) ─────────────────────────────────────────────

function SugestaoItem({
  s,
  index,
  selected,
  onClick,
}: {
  s:        SugestaoReposicao
  index:    number
  selected: boolean
  onClick:  () => void
}) {
  const isP1 = s.prioridade === "P1"
  const accent = isP1 ? B.blue : B.orange
  const accentLt = isP1 ? B.blueLt : B.orangeLt

  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "9px 10px",
        borderRadius: 10,
        border: selected ? `1.5px solid ${accent}` : "1.5px solid var(--border)",
        background: selected ? accentLt : "var(--card)",
        cursor: "pointer",
        marginBottom: 6,
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{
          background: accentLt, color: accent,
          border: `1px solid ${accent}40`,
          borderRadius: "999px", padding: "1px 7px",
          fontSize: 9, fontWeight: 700,
        }}>
          {isP1 ? "P1 · mesmo prof." : "P2 · prof. diferente"}
        </span>
        {!s.mesmaUnidade && (
          <span style={{ fontSize: 9, color: B.orange, fontWeight: 600 }}>⚠ Unidade diferente</span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", marginBottom: 1 }}>
        {s.profissional}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
        {DIA_PT[s.dia] ?? s.dia} {fmtData(s.data)} · {s.hora}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
        {s.unidade.replace("Unid. ", "").replace(" - Sala", " S")}
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AgendaComparacaoProps {
  falta:            SessaoFaltada
  sugestoes:        SugestaoReposicao[]
  sessoesAgendadas: SessaoAgendada[]
  aceite:           ReposicaoAceiteEntry | undefined
  onAceitar:        (faltaId: string, s: SugestaoReposicao) => void
  onRecusar:        (faltaId: string) => void
  onDesfazer:       (faltaId: string) => void
}

export function AgendaComparacao({
  falta,
  sugestoes,
  sessoesAgendadas,
  aceite,
  onAceitar,
  onRecusar,
  onDesfazer,
}: AgendaComparacaoProps) {
  const [sel, setSel] = useState<SugestaoReposicao>(sugestoes[0])

  // Mapeia dia → data para cabeçalho do grid
  const diaToDate: Record<string,string> = {}
  for (const s of sessoesAgendadas) {
    if (!diaToDate[s.dia]) diaToDate[s.dia] = s.data
  }
  if (!diaToDate[falta.dia]) diaToDate[falta.dia] = falta.dataOriginal
  for (const s of sugestoes) {
    if (!diaToDate[s.dia]) diaToDate[s.dia] = s.data
  }

  // Estado: aceite aceito — mostra grid proposta aceita
  if (aceite?.status === "aceito" && aceite.sugestao) {
    return (
      <div style={{ padding: "14px 14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            background: "#f0fdf4", color: "#16a34a",
            border: "1px solid #bbf7d0",
            borderRadius: "999px", padding: "2px 10px",
            fontSize: 11, fontWeight: 700,
          }}>
            Reposição aceita
          </span>
          <button
            onClick={() => onDesfazer(falta.faltaId)}
            style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #cbd5e1", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
          >
            Desfazer
          </button>
        </div>
        <AgendaGrid
          titulo="PROPOSTA ACEITA"
          sessoesAgendadas={sessoesAgendadas}
          faltaHighlight={{ dia: falta.dia, hora: falta.hora, falta }}
          propostaHighlight={aceite.sugestao}
          diaToDate={diaToDate}
        />
      </div>
    )
  }

  // Estado: recusado
  if (aceite?.status === "recusado") {
    return (
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
          Reposição recusada para esta falta.
        </span>
        <button
          onClick={() => onDesfazer(falta.faltaId)}
          style={{ fontSize: 11, color: "#64748b", background: "none", border: "1px solid #cbd5e1", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
        >
          Desfazer
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: "14px", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* ── Painel esquerdo: opções ── */}
        <div style={{ width: 176, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{
            fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em",
            color: "var(--muted-foreground)", marginBottom: 8,
          }}>
            Opções de reposição
          </div>

          <div style={{ flex: 1 }}>
            {sugestoes.map((s, i) => (
              <SugestaoItem
                key={`${s.profissional}|${s.data}|${s.hora}`}
                s={s}
                index={i + 1}
                selected={sel === s}
                onClick={() => setSel(s)}
              />
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
            <button
              onClick={() => onAceitar(falta.faltaId, sel)}
              style={{
                fontSize: 12, fontWeight: 700,
                color: "#fff", background: B.blue,
                border: "none", borderRadius: 8,
                padding: "9px 0", cursor: "pointer",
              }}
            >
              Aceitar ({sel?.prioridade})
            </button>
            <button
              onClick={() => onRecusar(falta.faltaId)}
              style={{
                fontSize: 11, color: "#94a3b8",
                background: "none", border: "none",
                cursor: "pointer", padding: "4px 0",
              }}
            >
              Recusar todas as sugestões
            </button>
          </div>
        </div>

        {/* ── Painel direito: grids ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <AgendaGrid
            titulo="ATUAL"
            sessoesAgendadas={sessoesAgendadas}
            faltaHighlight={{ dia: falta.dia, hora: falta.hora, falta }}
            diaToDate={diaToDate}
          />

          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 0",
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.07em" }}>
              ↓ PROPOSTA
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <AgendaGrid
            titulo=""
            sessoesAgendadas={sessoesAgendadas}
            propostaHighlight={sel}
            diaToDate={diaToDate}
          />
        </div>

      </div>
    </div>
  )
}
