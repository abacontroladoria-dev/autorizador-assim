'use client'

import { useEffect, useState } from 'react'
import { getTaxasEspecialidade } from '@/services/taxasEspecialidade.service'

type TaxasState = {
  taxas_pa: Record<string, number>
  diarias: Record<string, number>
  /** Ponto de Equilíbrio PJ — só preenchido pra especialidades cadastradas (Fono/TO/Musicoterapia por ora). */
  be_custo_mensal_pj: Record<string, number | null>
  be_capacidade_manha: Record<string, number | null>
  be_capacidade_tarde: Record<string, number | null>
  loading: boolean
  error: string | null
}

const INITIAL_STATE: TaxasState = {
  taxas_pa: {}, diarias: {}, be_custo_mensal_pj: {}, be_capacidade_manha: {}, be_capacidade_tarde: {},
  loading: true, error: null,
}

let cachedState: TaxasState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: TaxasState) => void>()

function notify(state: TaxasState) {
  cachedState = state
  subscribers.forEach(fn => fn(state))
}

function fetchTaxas(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getTaxasEspecialidade()
    .then(({ data, error }) => {
      const taxas_pa: Record<string, number> = {}
      const diarias: Record<string, number> = {}
      const be_custo_mensal_pj: Record<string, number | null> = {}
      const be_capacidade_manha: Record<string, number | null> = {}
      const be_capacidade_tarde: Record<string, number | null> = {}
      for (const row of data) {
        taxas_pa[row.especialidade] = row.taxa_pa
        diarias[row.especialidade] = row.diaria
        be_custo_mensal_pj[row.especialidade] = row.be_custo_mensal_pj
        be_capacidade_manha[row.especialidade] = row.be_capacidade_manha
        be_capacidade_tarde[row.especialidade] = row.be_capacidade_tarde
      }
      notify({ taxas_pa, diarias, be_custo_mensal_pj, be_capacidade_manha, be_capacidade_tarde, loading: false, error })
    })
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

// Invalida o cache compartilhado e busca as taxas atualizadas de novo,
// propagando para todas as instâncias do hook já montadas — mesmo padrão de
// useFeriados.ts. Chamar depois de qualquer salvamento em Variáveis & Taxas.
export function refetchTaxasEspecialidade(): Promise<void> {
  inflightFetch = null
  notify({
    taxas_pa: cachedState?.taxas_pa ?? {},
    diarias: cachedState?.diarias ?? {},
    be_custo_mensal_pj: cachedState?.be_custo_mensal_pj ?? {},
    be_capacidade_manha: cachedState?.be_capacidade_manha ?? {},
    be_capacidade_tarde: cachedState?.be_capacidade_tarde ?? {},
    loading: true, error: null,
  })
  return fetchTaxas()
}

export function useTaxasEspecialidade() {
  const [state, setState] = useState<TaxasState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchTaxas()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
