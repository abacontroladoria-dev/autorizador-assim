"use client"

import { useEffect, useState } from "react"
import { getResponsaveis } from "@/services/responsaveis.service"
import type { Responsavel } from "@/types/responsavel"

// Mesmo padrão de frontend/hooks/usePacientes.ts — cache module-level
// compartilhado entre todas as instâncias montadas ao mesmo tempo. Cada campo de
// responsável na tela monta um picker, e sem isso seriam quatro requisições
// idênticas por paciente aberto.

type ResponsaveisState = {
  responsaveis: Responsavel[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: ResponsaveisState = { responsaveis: [], loading: true, error: null }

let cachedState: ResponsaveisState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: ResponsaveisState) => void>()

function notify(state: ResponsaveisState) {
  cachedState = state
  subscribers.forEach((fn) => fn(state))
}

function fetchResponsaveis(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getResponsaveis()
    .then(({ data, error }) => notify({ responsaveis: data, loading: false, error }))
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

/** Chamar depois de cadastrar um responsável novo, senão o picker não o enxerga. */
export function refetchResponsaveis(): Promise<void> {
  inflightFetch = null
  notify({ responsaveis: cachedState?.responsaveis ?? [], loading: true, error: null })
  return fetchResponsaveis()
}

export function useResponsaveis() {
  const [state, setState] = useState<ResponsaveisState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchResponsaveis()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
