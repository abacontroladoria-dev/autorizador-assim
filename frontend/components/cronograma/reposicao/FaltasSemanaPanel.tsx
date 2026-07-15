"use client"

import { useState } from "react"
import { useReposicaoFaltas } from "@/hooks/useReposicaoFaltas"
import { loadAceites, saveAceites } from "@/lib/cronograma/reposicaoStorage"
import type { ReposicaoStorage, SugestaoReposicao } from "@/types/reposicao"
import { VisaoComparativa } from "./VisaoComparativa"

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            height: 64,
            borderRadius: 12,
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--border)",
            background: "var(--card)",
            opacity: 0.6,
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:.9} }`}</style>
    </div>
  )
}

// ─── Cabeçalho com nome do paciente ───────────────────────────────────────────
// Mostrado nos estados de loading/erro/vazio; no estado com conteúdo, o nome
// aparece dentro de VisaoComparativa, junto do botão "Sugestão automática".

function PacienteHeader({ nome }: { nome: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: "var(--muted-foreground)",
        marginBottom: 10,
      }}
    >
      {nome}
    </div>
  )
}

// ─── Empty / error states ─────────────────────────────────────────────────────

function EmptyState({ msg, sub }: { msg: string; sub?: string }) {
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
        {msg}
      </p>
      {sub && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{sub}</p>
      )}
    </div>
  )
}


// ─── Main component ───────────────────────────────────────────────────────────

interface FaltasSemanaProps {
  pacienteId:   string
  pacienteNome: string
  semanaInicio: string  // "YYYY-MM-DD" (segunda-feira)
}

export function FaltasSemanaPanel({
  pacienteId,
  pacienteNome,
  semanaInicio,
}: FaltasSemanaProps) {
  const { resultados, sessoesAgendadas, sessoesConcluidas, loading, error } = useReposicaoFaltas(
    pacienteId,
    pacienteNome,
    semanaInicio,
  )

  const [aceites, setAceites] = useState<ReposicaoStorage>(loadAceites)

  // A escolha de qual sugestão usar (quando há mais de uma opção por falta) já vem
  // resolvida do VisaoComparativa — aqui só persiste.
  function handleAceitar(escolhas: { faltaId: string; sugestao: SugestaoReposicao }[]) {
    setAceites(prev => {
      const next = { ...prev }
      escolhas.forEach(({ faltaId, sugestao }) => {
        next[faltaId] = {
          status: "aceito" as const,
          sugestao,
          atualizadoEm: new Date().toISOString(),
        }
      })
      saveAceites(next)
      return next
    })
  }

  function handleRecusarAceito(faltaId: string) {
    setAceites(prev => {
      const next = { ...prev }
      next[faltaId] = { status: "recusado" as const, atualizadoEm: new Date().toISOString() }
      saveAceites(next)
      return next
    })
  }

  if (loading) {
    return (
      <>
        <PacienteHeader nome={pacienteNome} />
        <Skeleton />
      </>
    )
  }

  if (error) {
    return (
      <>
        <PacienteHeader nome={pacienteNome} />
        <EmptyState msg="Erro ao carregar faltas" sub={error} />
      </>
    )
  }

  if (resultados.length === 0 && sessoesAgendadas.length === 0 && sessoesConcluidas.length === 0) {
    return (
      <>
        <PacienteHeader nome={pacienteNome} />
        <EmptyState
          msg="Nenhuma sessão encontrada"
          sub="Não há faltas, sessões concluídas ou agendadas para esta semana."
        />
      </>
    )
  }

  return (
    <VisaoComparativa
      key={`${pacienteId}::${semanaInicio}`}
      pacienteNome={pacienteNome}
      resultados={resultados}
      sessoesAgendadas={sessoesAgendadas}
      sessoesConcluidas={sessoesConcluidas}
      aceites={aceites}
      semanaInicio={semanaInicio}
      onAceitar={handleAceitar}
      onRecusarAceito={handleRecusarAceito}
    />
  )
}
