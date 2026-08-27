"use client"

import { useEffect, useState } from "react"
import { listarConvenios, listarPlanosSaude } from "@/services/convenios.service"
import type { PlanoSaude, ConvenioComPlanos } from "@/types/convenio"

export interface UseConveniosResult {
  convenios: ConvenioComPlanos[]
  loading: boolean
  error: string | null
  recarregar: () => void
}

/** Convênios com seus planos aninhados — usado pela tela de cadastro /cadastros/convenios. */
export function useConvenios(): UseConveniosResult {
  const [convenios, setConvenios] = useState<ConvenioComPlanos[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([listarConvenios(), listarPlanosSaude()])
      .then(([lista, planos]) => {
        if (cancelled) return
        const porConvenio = new Map<number, PlanoSaude[]>()
        for (const p of planos) {
          const arr = porConvenio.get(p.convenio_id) ?? []
          arr.push(p)
          porConvenio.set(p.convenio_id, arr)
        }
        setConvenios(lista.map(c => ({ ...c, planos: porConvenio.get(c.id) ?? [] })))
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [refreshKey])

  return { convenios, loading, error, recarregar: () => setRefreshKey(k => k + 1) }
}
