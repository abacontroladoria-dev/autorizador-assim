"use client"

import { useState } from "react"
import { useVisaoGeralFaltas } from "@/hooks/useVisaoGeralFaltas"
import type { CategoriaReposicao, PacienteSemana } from "@/types/reposicao"

// ─── Config de categoria ──────────────────────────────────────────────────────

const CAT_CFG: Record<CategoriaReposicao, { label: string; rail: string; bg: string; c: string }> = {
  sem_reposicao:      { label: "Sem resolução",   rail: "#E3734F", bg: "#fdf0eb", c: "#C45B36" },
  reposicao_parcial:  { label: "Parcial",          rail: "#F5A623", bg: "#fef9eb", c: "#B07D0D" },
  reposicao_completa: { label: "Resolvido",        rail: "#16a34a", bg: "#f0fdf4", c: "#15803d" },
  todos_comparecidos: { label: "Comparecidos",     rail: "#94a3b8", bg: "#f8fafc", c: "#64748b" },
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

type Filtro = "todos" | CategoriaReposicao | "com_irrecuperavel"

interface ChipProps {
  label: string
  count: number
  active: boolean
  rail?: string
  onClick: () => void
}

function Chip({ label, count, active, rail, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        borderRadius: "999px",
        border: active ? `1.5px solid ${rail ?? "#2A92C0"}` : "1.5px solid var(--border)",
        background: active ? (rail ? `${rail}18` : "#eaf5fb") : "var(--card)",
        color: active ? (rail ?? "#2A92C0") : "var(--muted-foreground)",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <span
        style={{
          background: active ? (rail ?? "#2A92C0") : "var(--border)",
          color: active ? "#fff" : "var(--muted-foreground)",
          borderRadius: "999px",
          padding: "0 6px",
          fontSize: 10,
          fontWeight: 700,
          minWidth: 18,
          textAlign: "center",
        }}
      >
        {count}
      </span>
    </button>
  )
}

// ─── Patient row ──────────────────────────────────────────────────────────────

function PacienteRow({
  p,
  onClick,
}: {
  p: PacienteSemana
  onClick: () => void
}) {
  const cfg = CAT_CFG[p.categoria]
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${cfg.rail}`,
        background: "var(--card)",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        transition: "box-shadow 0.12s",
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Nome */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--foreground)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {p.pacienteNome}
      </span>

      {/* Contagem */}
      {p.totalFaltas > 0 && (
        <span style={{ fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {p.totalResolvidas}/{p.totalFaltas} falta{p.totalFaltas !== 1 ? "s" : ""}
        </span>
      )}

      {/* Badge irrecuperável */}
      {p.totalIrrecuperaveis > 0 && (
        <span
          style={{
            background: "#f5f3ff",
            color: "#7c3aed",
            border: "1px solid #ddd6fe",
            borderRadius: "999px",
            padding: "1px 7px",
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {p.totalIrrecuperaveis} irrecup.
        </span>
      )}

      {/* Badge */}
      <span
        style={{
          background: cfg.bg,
          color: cfg.c,
          border: `1px solid ${cfg.rail}30`,
          borderRadius: "999px",
          padding: "2px 8px",
          fontSize: 10,
          fontWeight: 700,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {cfg.label}
      </span>

      {/* Chevron */}
      <svg
        width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, color: "var(--muted-foreground)" }}
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          style={{
            height: 46,
            borderRadius: 10,
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--border)",
            background: "var(--card)",
            opacity: 0.5,
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface VisaoGeralPanelProps {
  semanaInicio: string
  onSelectPaciente: (p: { id: string; nome: string }) => void
}

export function VisaoGeralPanel({ semanaInicio, onSelectPaciente }: VisaoGeralPanelProps) {
  const { pacientes, loading, error } = useVisaoGeralFaltas(semanaInicio)
  const [filtro, setFiltro] = useState<Filtro>("todos")

  const counts = {
    todos:              pacientes.length,
    sem_reposicao:      pacientes.filter(p => p.categoria === "sem_reposicao").length,
    reposicao_parcial:  pacientes.filter(p => p.categoria === "reposicao_parcial").length,
    reposicao_completa: pacientes.filter(p => p.categoria === "reposicao_completa").length,
    todos_comparecidos: pacientes.filter(p => p.categoria === "todos_comparecidos").length,
    com_irrecuperavel:  pacientes.filter(p => p.totalIrrecuperaveis > 0).length,
  }

  const visíveis =
    filtro === "todos"            ? pacientes :
    filtro === "com_irrecuperavel"? pacientes.filter(p => p.totalIrrecuperaveis > 0) :
    pacientes.filter(p => p.categoria === filtro)

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div
        style={{
          padding: "24px 16px",
          textAlign: "center",
          borderRadius: 12,
          border: "1px dashed var(--border)",
        }}
      >
        <p style={{ fontSize: 13, color: "#E3734F" }}>{error}</p>
      </div>
    )
  }

  if (pacientes.length === 0) {
    return (
      <div
        style={{
          padding: "32px 20px",
          textAlign: "center",
          borderRadius: 12,
          border: "1px dashed var(--border)",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
          Nenhuma falta registrada esta semana
        </p>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Todos os pacientes compareceram às sessões.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Chips de filtro */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip
          label="Todos"
          count={counts.todos}
          active={filtro === "todos"}
          onClick={() => setFiltro("todos")}
        />
        <Chip
          label="Sem resolução"
          count={counts.sem_reposicao}
          active={filtro === "sem_reposicao"}
          rail={CAT_CFG.sem_reposicao.rail}
          onClick={() => setFiltro("sem_reposicao")}
        />
        <Chip
          label="Parcial"
          count={counts.reposicao_parcial}
          active={filtro === "reposicao_parcial"}
          rail={CAT_CFG.reposicao_parcial.rail}
          onClick={() => setFiltro("reposicao_parcial")}
        />
        <Chip
          label="Resolvido"
          count={counts.reposicao_completa}
          active={filtro === "reposicao_completa"}
          rail={CAT_CFG.reposicao_completa.rail}
          onClick={() => setFiltro("reposicao_completa")}
        />
        {counts.todos_comparecidos > 0 && (
          <Chip
            label="Comparecidos"
            count={counts.todos_comparecidos}
            active={filtro === "todos_comparecidos"}
            rail={CAT_CFG.todos_comparecidos.rail}
            onClick={() => setFiltro("todos_comparecidos")}
          />
        )}
        {counts.com_irrecuperavel > 0 && (
          <Chip
            label="Irrecuperável"
            count={counts.com_irrecuperavel}
            active={filtro === "com_irrecuperavel"}
            rail="#7c3aed"
            onClick={() => setFiltro("com_irrecuperavel")}
          />
        )}
      </div>

      {/* Lista de pacientes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visíveis.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center", padding: "16px 0" }}>
            Nenhum paciente nesta categoria.
          </p>
        ) : (
          visíveis.map(p => (
            <PacienteRow
              key={p.pacienteId}
              p={p}
              onClick={() => onSelectPaciente({ id: p.pacienteId, nome: p.pacienteNome })}
            />
          ))
        )}
      </div>
    </div>
  )
}
