"use client"

// Busca a grade real da semana de referência (getRefWeek — primeira segunda-sexta
// do mês seguinte, garantidamente sincronizada pelo TiTa) direto de
// csv_grades_profissionais, no mesmo padrão já usado por useOcupacaoSalas e
// useOcupacaoProf. Usado pela Simulação de Novo Prestador em vez do cRows de
// upload manual do CronogramaDataContext (que, na prática, só recebe laudos).

import { useEffect, useMemo, useState } from "react"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import { getRefWeek } from "@/lib/cronograma/helpers"
import type { CsvRow } from "@/types/cronograma"

export interface UseGradeAgendamentosResult {
  cRows: CsvRow[]
  loading: boolean
  error: string | null
  refWeek: { inicio: string; fim: string; label: string }
}

export function useGradeAgendamentos(): UseGradeAgendamentosResult {
  const refWeek = useMemo(() => getRefWeek(), [])
  const [cRows, setCRows] = useState<CsvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    buscarGradeComoCSVRows(refWeek.inicio, refWeek.fim)
      .then(rows => { if (!cancelled) { setCRows(rows); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(String(err?.message ?? err)); setLoading(false) } })

    return () => { cancelled = true }
  }, [refWeek.inicio, refWeek.fim])

  return { cRows, loading, error, refWeek }
}
