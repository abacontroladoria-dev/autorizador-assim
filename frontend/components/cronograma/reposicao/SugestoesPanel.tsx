"use client"

import { B } from "@/lib/cronograma/constants"
import { DIA_ABR, fmtData } from "@/lib/cronograma/formatters"
import type {
  SessaoFaltada,
  SugestaoReposicao,
  ReposicaoAceiteEntry,
} from "@/types/reposicao"

// ─── Sub-components ───────────────────────────────────────────────────────────

function PrioBadge({ prio }: { prio: "P1" | "P2" }) {
  const s =
    prio === "P1"
      ? { bg: B.blueLt,   c: B.blue,   label: "P1 · mesmo prof." }
      : { bg: B.orangeLt, c: B.orange, label: "P2 · prof. diferente" }
  return (
    <span
      style={{
        background: s.bg,
        color: s.c,
        border: `1px solid ${s.c}30`,
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "10px",
        fontWeight: 700,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  )
}

function UnidadeBadge({ unidade, destaque }: { unidade: string; destaque: boolean }) {
  return (
    <span
      style={{
        background: destaque ? B.limeLt : "#f1f5f9",
        color: destaque ? "#4d7c0f" : "#64748b",
        border: `1px solid ${destaque ? "#bef264" : "#cbd5e1"}`,
        borderRadius: "999px",
        padding: "2px 7px",
        fontSize: "10px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {unidade.replace("Unid. ", "").replace(" - Sala", " S")}
    </span>
  )
}

// ─── Accepted state ───────────────────────────────────────────────────────────

function AceitoView({
  sugestao,
  onDesfazer,
}: {
  sugestao: SugestaoReposicao
  onDesfazer: () => void
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "#f0fdf4",
        borderTop: "1px solid #dcfce7",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <PrioBadge prio={sugestao.prioridade} />
      <span style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>
        {sugestao.profissional}
      </span>
      <span style={{ fontSize: 12, color: "#4ade80" }}>·</span>
      <span style={{ fontSize: 12, color: "#166534" }}>
        {DIA_ABR[sugestao.dia] ?? sugestao.dia} {fmtData(sugestao.data)}, {sugestao.hora}
      </span>
      <UnidadeBadge unidade={sugestao.unidade} destaque={false} />
      <button
        onClick={onDesfazer}
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: "#64748b",
          background: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          padding: "3px 10px",
          cursor: "pointer",
        }}
      >
        Desfazer
      </button>
    </div>
  )
}

// ─── Refused state ────────────────────────────────────────────────────────────

function RecusadoView({ onDesfazer }: { onDesfazer: () => void }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        background: "#f8fafc",
        borderTop: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
        Reposição recusada para esta falta.
      </span>
      <button
        onClick={onDesfazer}
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: "#64748b",
          background: "none",
          border: "1px solid #cbd5e1",
          borderRadius: 6,
          padding: "3px 10px",
          cursor: "pointer",
        }}
      >
        Desfazer
      </button>
    </div>
  )
}

// ─── Suggestion row ───────────────────────────────────────────────────────────

function SugestaoRow({
  s,
  onAceitar,
}: {
  s: SugestaoReposicao
  onAceitar: (s: SugestaoReposicao) => void
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px",
        borderBottom: "1px solid #f1f5f9",
        flexWrap: "wrap",
      }}
    >
      <PrioBadge prio={s.prioridade} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", minWidth: 0 }}>
        {s.profissional}
      </span>
      {s.prioridade === "P2" && (
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {s.terapiaExibicao || s.terapia}
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginLeft: 2 }}>
        {DIA_ABR[s.dia] ?? s.dia} {fmtData(s.data)}, {s.hora}
      </span>
      <UnidadeBadge unidade={s.unidade} destaque={s.mesmaUnidade} />
      <button
        onClick={() => onAceitar(s)}
        style={{
          marginLeft: "auto",
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 600,
          color: "#fff",
          background: B.blue,
          border: "none",
          borderRadius: 8,
          padding: "5px 14px",
          cursor: "pointer",
        }}
      >
        Aceitar
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SugestoesPanelProps {
  falta:      SessaoFaltada
  sugestoes:  SugestaoReposicao[]
  aceite:     ReposicaoAceiteEntry | undefined
  onAceitar:  (s: SugestaoReposicao) => void
  onRecusar:  () => void
  onDesfazer: () => void
}

export function SugestoesPanel({
  falta,
  sugestoes,
  aceite,
  onAceitar,
  onRecusar,
  onDesfazer,
}: SugestoesPanelProps) {
  if (aceite?.status === "aceito" && aceite.sugestao) {
    return <AceitoView sugestao={aceite.sugestao} onDesfazer={onDesfazer} />
  }

  if (aceite?.status === "recusado") {
    return <RecusadoView onDesfazer={onDesfazer} />
  }

  return (
    <div style={{ borderTop: "1px solid #f1f5f9" }}>
      {sugestoes.map((s, i) => (
        <SugestaoRow key={`${s.profissional}|${s.data}|${s.hora}`} s={s} onAceitar={onAceitar} />
      ))}
      <div
        style={{
          padding: "8px 16px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          onClick={onRecusar}
          style={{
            fontSize: 11,
            color: "#94a3b8",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
          }}
        >
          Recusar todas as sugestões
        </button>
      </div>
    </div>
  )
}
