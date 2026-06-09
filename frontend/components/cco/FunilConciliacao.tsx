// Este componente foi descontinuado em 2026-06-09.
// Mantido no repositório até estabilização da CCO V1.
// Use EvolucoesPendentes ou PacientesComPendencias para drill-down.

'use client'

interface Props {
  loading?: boolean
}

export default function FunilConciliacao({ loading }: Props) {
  if (loading) {
    return <div className="h-32 bg-card border border-border rounded-xl animate-pulse" />
  }

  return null
}
