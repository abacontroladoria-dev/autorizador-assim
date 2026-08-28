"use client"

// Busca as sessões REAIS de um mês inteiro (dia 1 ao último dia), em paralelo
// ao hook useOcupacaoSalas (que só busca a semana de referência). Usado pela
// Previsão de Receitas para calcular Deduções por falta — precisa das datas
// reais do mês pra cruzar com fila_autorizacoes, não da amostra semanal usada
// na projeção por ocorrências/mês. Hook separado (em vez de estender
// useOcupacaoSalas) pra não sobrecarregar esse hook, usado por outras telas
// de ocupação de sala que não precisam do mês inteiro.

import { useEffect, useMemo, useState } from "react"
import { buscarLinhasAgendaParaSalas } from "@/services/salas.service"
import { buscarFaltasFilaAutorizacoes } from "@/lib/remuneracao/presencaReal"
import { mesInteiroRange } from "@/lib/cronograma/helpers"
import type { AgendaSalaRow } from "@/lib/cronograma/salasTypes"

export interface UseLinhasMesInteiroResult {
  linhasMes: AgendaSalaRow[]
  faltas: Set<number>
  loading: boolean
  error: string | null
}

export function useLinhasMesInteiro(ano: number | null, mes: number | null): UseLinhasMesInteiroResult {
  const periodo = useMemo(() => (ano && mes ? mesInteiroRange(ano, mes) : null), [ano, mes])

  const [linhasMes, setLinhasMes] = useState<AgendaSalaRow[]>([])
  const [faltas, setFaltas] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!periodo) {
      setLinhasMes([])
      setFaltas(new Set())
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      buscarLinhasAgendaParaSalas(periodo.inicio, periodo.fim),
      buscarFaltasFilaAutorizacoes(periodo.inicio, periodo.fim),
    ])
      .then(([linhas, faltasSet]) => {
        if (cancelled) return
        setLinhasMes(linhas)
        setFaltas(faltasSet)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [periodo?.inicio, periodo?.fim])

  return { linhasMes, faltas, loading, error }
}
