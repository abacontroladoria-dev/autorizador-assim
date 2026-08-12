'use client'

import { useEffect, useState } from 'react'
import { getParametrosGerais } from '@/services/parametrosGerais.service'
import type { ParametrosGerais } from '@/types/remuneracao'

type ParametrosState = {
  parametros: ParametrosGerais | null
  loading: boolean
  error: string | null
}

const INITIAL_STATE: ParametrosState = { parametros: null, loading: true, error: null }

let cachedState: ParametrosState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: ParametrosState) => void>()

function notify(state: ParametrosState) {
  cachedState = state
  subscribers.forEach(fn => fn(state))
}

function fetchParametros(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getParametrosGerais()
    .then(({ data, error: fetchError }) => {
      const error = fetchError
        ? `Erro ao carregar parâmetros gerais: ${fetchError}`
        : !data
          ? 'Nenhum parâmetro geral encontrado. Contate um administrador.'
          : null
      notify({ parametros: data, loading: false, error })
    })
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

// Invalida o cache compartilhado e busca os parâmetros atualizados de novo,
// propagando para todas as instâncias do hook já montadas — mesmo padrão de
// useFeriados.ts. Chamar depois de qualquer salvamento em Variáveis & Taxas.
export function refetchParametrosGerais(): Promise<void> {
  inflightFetch = null
  notify({ parametros: cachedState?.parametros ?? null, loading: true, error: null })
  return fetchParametros()
}

export function useParametrosGerais() {
  const [state, setState] = useState<ParametrosState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchParametros()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
