"use client"

import { useState } from "react"
import { useReposicaoFaltas } from "@/hooks/useReposicaoFaltas"
import { loadAceites, saveAceites } from "@/lib/cronograma/reposicaoStorage"
import type { ReposicaoStorage } from "@/types/reposicao"
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
  const { resultados, sessoesAgendadas, loading, error } = useReposicaoFaltas(
    pacienteId,
    pacienteNome,
    semanaInicio,
  )

  const [, setAceites] = useState<ReposicaoStorage>(loadAceites)

  function handleAceitar(faltaIds: string[]) {
    setAceites(prev => {
      const next = { ...prev }
      const porId = Object.fromEntries(resultados.map(r => [r.falta.faltaId, r]))
      faltaIds.forEach(id => {
        const r = porId[id]
        if (r?.status === "com_sugestao") {
          next[id] = {
            status: "aceito" as const,
            sugestao: r.sugestoes[0],
            atualizadoEm: new Date().toISOString(),
          }
        }
      })
      saveAceites(next)
      return next
    })
  }

  if (loading) return <Skeleton />

  if (error) {
    return (
      <EmptyState
        msg="Erro ao carregar faltas"
        sub={error}
      />
    )
  }

  if (resultados.length === 0) {
    return (
      <EmptyState
        msg="Nenhuma falta elegível encontrada"
        sub="Não há faltas com reposição pendente para esta semana."
      />
    )
  }

  return (
    <VisaoComparativa
      resultados={resultados}
      sessoesAgendadas={sessoesAgendadas}
      semanaInicio={semanaInicio}
      onAceitar={handleAceitar}
    />
  )
}
