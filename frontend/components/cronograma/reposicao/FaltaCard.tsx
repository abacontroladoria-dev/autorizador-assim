"use client"

import { useState } from "react"
import { B } from "@/lib/cronograma/constants"
import { DIA_ABR, fmtData } from "@/lib/cronograma/formatters"
import type {
  ResultadoReposicao,
  SugestaoReposicao,
  ReposicaoAceiteEntry,
} from "@/types/reposicao"
import type { AgendaPacienteSlot } from "@/lib/cronograma/reposicao"
import type { SessaoAgendada } from "@/types/reposicao"
import { AgendaComparacao } from "./AgendaComparacao"
import { BuscarReposicaoManual } from "./BuscarReposicaoManual"

// ─── Status / aceite metadata ─────────────────────────────────────────────────

type StatusKey = ResultadoReposicao["status"]

const STATUS_CFG: Record<StatusKey, { label: string; bg: string; c: string; rail: string }> = {
  com_sugestao:       { label: "Sugestão disponível", bg: B.blueLt,   c: B.blue,   rail: B.blue   },
  sem_disponibilidade:{ label: "Sem disponibilidade", bg: B.orangeLt, c: B.orange, rail: B.orange },
  irrecuperavel:      { label: "Irrecuperável",        bg: "#fdf0f0",  c: B.red,    rail: B.red    },
  sem_dados:          { label: "Sem dados",            bg: "#f1f5f9",  c: "#64748b",rail: "#94a3b8"},
}

const ACEITE_CFG = {
  aceito:   { label: "Aceito",   bg: "#f0fdf4", c: "#16a34a", rail: B.green  },
  recusado: { label: "Recusado", bg: "#f8fafc", c: "#94a3b8", rail: "#cbd5e1"},
}

// ─── Origem da falta ──────────────────────────────────────────────────────────

function OrigemBadge({ origem }: { origem: string }) {
  const lower = origem.toLowerCase()
  const isProfissional = lower.includes("profissional") || lower.includes("terapeuta")
  return (
    <span
      style={{
        background: isProfissional ? "#fef9eb" : "#f0f4ff",
        color:      isProfissional ? "#B07D0D" : "#3b5bdb",
        border:     `1px solid ${isProfissional ? "#fde68a" : "#bfcfff"}`,
        borderRadius: "999px",
        padding: "1px 7px",
        fontSize: "10px",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {isProfissional ? "Falta profissional" : "Falta paciente"}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface FaltaCardProps {
  resultado:        ResultadoReposicao
  aceite:           ReposicaoAceiteEntry | undefined
  agendaPaciente:   AgendaPacienteSlot[]
  sessoesAgendadas: SessaoAgendada[]
  semanaInicio:     string
  semanaFim:        string
  onAceitar:        (faltaId: string, sugestao: SugestaoReposicao) => void
  onRecusar:        (faltaId: string) => void
  onDesfazer:       (faltaId: string) => void
}

export function FaltaCard({
  resultado,
  aceite,
  agendaPaciente,
  sessoesAgendadas,
  semanaInicio,
  semanaFim,
  onAceitar,
  onRecusar,
  onDesfazer,
}: FaltaCardProps) {
  const { falta, status } = resultado
  const [aberto, setAberto] = useState(false)

  const statusCfg = STATUS_CFG[status]

  // If decided, show aceite badge instead of status badge
  const visivel =
    aceite?.status === "aceito"   ? ACEITE_CFG.aceito  :
    aceite?.status === "recusado" ? ACEITE_CFG.recusado :
    statusCfg

  const rail = visivel.rail
  const podeAbrir = status === "com_sugestao"

  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${rail}`,
        background: "var(--card)",
        overflow: "hidden",
        transition: "box-shadow 0.15s",
      }}
    >
      {/* ── Header ── */}
      <div
        onClick={() => podeAbrir && setAberto(v => !v)}
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          cursor: podeAbrir ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {/* Status badge */}
        <span
          style={{
            flexShrink: 0,
            marginTop: 1,
            background: visivel.bg,
            color: visivel.c,
            border: `1px solid ${visivel.c}30`,
            borderRadius: "999px",
            padding: "2px 8px",
            fontSize: "10px",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {visivel.label}
        </span>

        {/* Terapia + profissional */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--foreground)",
              marginBottom: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {falta.terapiaExibicao || falta.terapia}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-foreground)",
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {falta.origemFalta && (
              <OrigemBadge origem={falta.origemFalta} />
            )}
            <span>{falta.profissional || "—"}</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span>
              {DIA_ABR[falta.dia] ?? falta.dia}{" "}
              {fmtData(falta.dataOriginal)}, {falta.hora}
            </span>
            {falta.unidade ? (
              <>
                <span style={{ color: "var(--border)" }}>·</span>
                <span>{falta.unidade.replace("Unid. ", "")}</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Chevron for expandable cards */}
        {podeAbrir && (
          <svg
            width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{
              flexShrink: 0,
              marginTop: 2,
              color: "var(--muted-foreground)",
              transform: aberto ? "rotate(180deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </div>

      {/* ── Agenda visual (com_sugestao) ── */}
      {resultado.status === "com_sugestao" && (aberto || aceite?.status === "aceito" || aceite?.status === "recusado") && (
        <AgendaComparacao
          falta={falta}
          sugestoes={resultado.sugestoes}
          sessoesAgendadas={sessoesAgendadas}
          aceite={aceite}
          onAceitar={onAceitar}
          onRecusar={onRecusar}
          onDesfazer={onDesfazer}
        />
      )}

      {/* ── Busca manual (sem_dados) ── */}
      {resultado.status === "sem_dados" && (
        <BuscarReposicaoManual
          falta={falta}
          agendaPaciente={agendaPaciente}
          sessoesAgendadas={sessoesAgendadas}
          semanaInicio={semanaInicio}
          semanaFim={semanaFim}
          aceite={aceite}
          onAceitar={onAceitar}
          onRecusar={onRecusar}
          onDesfazer={onDesfazer}
        />
      )}
    </div>
  )
}
