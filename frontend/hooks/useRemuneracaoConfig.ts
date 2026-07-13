'use client'

import { useEffect, useState } from 'react'
import { getRemuneracaoConfig } from '@/services/remuneracao.service'
import type { RemuneracaoConfig } from '@/types/remuneracao'

type ConfigState = {
  config: RemuneracaoConfig | null
  loading: boolean
  error: string | null
}

const INITIAL_STATE: ConfigState = { config: null, loading: true, error: null }

let cachedState: ConfigState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: ConfigState) => void>()

function notify(state: ConfigState) {
  cachedState = state
  subscribers.forEach(fn => fn(state))
}

function fetchConfig(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getRemuneracaoConfig()
    .then(({ data, error: fetchError }) => {
      const error = fetchError
        ? `Erro ao carregar configuração: ${fetchError}`
        : !data
          ? 'Nenhuma configuração encontrada. Contate um administrador.'
          : null
      notify({ config: data, loading: false, error })
    })
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

// Invalida o cache compartilhado e busca a config atualizada de novo, propagando
// para todas as instâncias do hook já montadas (outras abas abertas na mesma sessão
// do navegador, sem precisar de reload) — chamar depois de qualquer salvamento em
// Config que afete presença/taxas/contratos/capacidade/feriados.
export function refetchRemuneracaoConfig(): Promise<void> {
  cachedState = null
  inflightFetch = null
  return fetchConfig()
}

// Compartilha uma única busca/cache de remuneracao_config entre todas as instâncias
// do hook montadas ao mesmo tempo, evitando refetches redundantes ao navegar entre abas.
export function useRemuneracaoConfig() {
  const [state, setState] = useState<ConfigState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState) {
      fetchConfig()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
