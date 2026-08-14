"use client"

import { useEffect, useState } from "react"
import { getProfissionais, type RebootProfissional } from "@/services/reboot/profissionais.service"

// Nome "Reboot" no arquivo (não no hook) só para não colidir com um possível
// useProfissionais já existente em outro domínio do sistema (ex.: escala
// terapêutica) — são entidades diferentes.
type ProfissionaisState = {
  profissionais: RebootProfissional[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: ProfissionaisState = { profissionais: [], loading: true, error: null }

let cachedState: ProfissionaisState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: ProfissionaisState) => void>()

function notify(state: ProfissionaisState) {
  cachedState = state
  subscribers.forEach((fn) => fn(state))
}

function fetchProfissionais(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getProfissionais()
    .then(({ data, error }) => notify({ profissionais: data, loading: false, error }))
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

export function refetchProfissionaisReboot(): Promise<void> {
  inflightFetch = null
  notify({ profissionais: cachedState?.profissionais ?? [], loading: true, error: null })
  return fetchProfissionais()
}

export function useProfissionaisReboot() {
  const [state, setState] = useState<ProfissionaisState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchProfissionais()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
