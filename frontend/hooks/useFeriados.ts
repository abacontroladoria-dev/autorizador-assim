'use client'

import { useEffect, useState } from 'react'
import { getFeriados } from '@/services/feriados.service'
import type { FeriadoInfo } from '@/types/feriados'

type FeriadosState = {
  feriados: Record<string, FeriadoInfo>
  loading: boolean
  error: string | null
}

const INITIAL_STATE: FeriadosState = { feriados: {}, loading: true, error: null }

let cachedState: FeriadosState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: FeriadosState) => void>()

function notify(state: FeriadosState) {
  cachedState = state
  subscribers.forEach(fn => fn(state))
}

function fetchFeriados(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getFeriados()
    .then(({ data, error }) => {
      const feriados: Record<string, FeriadoInfo> = {}
      for (const row of data) {
        feriados[row.data] = { nome: row.nome, tipo: row.tipo, horario_inicio: row.horario_inicio, horario_fim: row.horario_fim }
      }
      notify({ feriados, loading: false, error })
    })
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

// Invalida o cache compartilhado e busca os feriados atualizados de novo,
// propagando para todas as instâncias do hook já montadas — mesmo padrão de
// useParametrosGerais.ts. Chamar depois de qualquer salvamento em Feriados.
export function refetchFeriados(): Promise<void> {
  inflightFetch = null
  notify({ feriados: cachedState?.feriados ?? {}, loading: true, error: null })
  return fetchFeriados()
}

// Compartilha uma única busca/cache de feriados entre todas as instâncias do
// hook montadas ao mesmo tempo (tela de cadastro, cálculos de remuneração,
// tratativas, previsão de receitas etc.).
export function useFeriados() {
  const [state, setState] = useState<FeriadosState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchFeriados()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
