"use client"

// Busca o snapshot histórico mais recente disponível pra uma competência
// ("2026-07") — usado pela Previsão de Receitas quando o mês selecionado já
// passou (Etapa 4). Se nunca rodou snapshot pra esse mês (ex.: mês anterior à
// implantação do job), `disponivel` fica false e o Shell cai no recálculo ao
// vivo (comportamento da Etapa 2), com aviso.

import { useEffect, useMemo, useState } from "react"
import { buscarUltimoSnapshotData, buscarHistoricoPrevisaoReceitas, type HistoricoPorSegmento } from "@/services/previsaoReceitasHistorico.service"

export interface UsePrevisaoReceitasHistoricoResult {
  disponivel: boolean
  snapshotData: string | null
  sessoes: HistoricoPorSegmento | null
  loading: boolean
  error: string | null
}

const VAZIO: HistoricoPorSegmento = { multidisciplinar: [], processoDiagnostico: [] }

export function usePrevisaoReceitasHistorico(competencia: string | null): UsePrevisaoReceitasHistoricoResult {
  const [snapshotData, setSnapshotData] = useState<string | null>(null)
  const [sessoes, setSessoes] = useState<HistoricoPorSegmento | null>(null)
  const [loading, setLoading] = useState(!!competencia)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!competencia) {
      setSnapshotData(null)
      setSessoes(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    buscarUltimoSnapshotData(competencia)
      .then(async data => {
        if (cancelled) return
        if (!data) {
          setSnapshotData(null)
          setSessoes(null)
          setLoading(false)
          return
        }
        const hist = await buscarHistoricoPrevisaoReceitas(competencia, data)
        if (cancelled) return
        setSnapshotData(data)
        setSessoes(hist)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [competencia])

  const disponivel = snapshotData !== null

  return { disponivel, snapshotData, sessoes: sessoes ?? VAZIO, loading, error }
}
