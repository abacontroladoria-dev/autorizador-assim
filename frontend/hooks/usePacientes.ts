"use client"

import { useEffect, useState } from "react"
import { getPacientes, type RebootPaciente } from "@/services/reboot/pacientes.service"

type PacientesState = {
  pacientes: RebootPaciente[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: PacientesState = { pacientes: [], loading: true, error: null }

let cachedState: PacientesState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: PacientesState) => void>()

function notify(state: PacientesState) {
  cachedState = state
  subscribers.forEach((fn) => fn(state))
}

function fetchPacientes(): Promise<void> {
  if (inflightFetch) return inflightFetch
  inflightFetch = getPacientes()
    .then(({ data, error }) => notify({ pacientes: data, loading: false, error }))
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

// Mesmo padrão de frontend/hooks/useFeriados.ts — cache compartilhado entre
// todas as instâncias do hook montadas ao mesmo tempo.
export function refetchPacientes(): Promise<void> {
  inflightFetch = null
  notify({ pacientes: cachedState?.pacientes ?? [], loading: true, error: null })
  return fetchPacientes()
}

export function usePacientes() {
  const [state, setState] = useState<PacientesState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchPacientes()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
