"use client"

import { useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"

/**
 * Os pacientes da ASSIM, com tudo que o formulário de avulsa precisa deles.
 *
 * Fonte: a RPC `listar_pacientes_assim()`, que responde "é da ASSIM?" pela AGENDA
 * e não por `pacientes.convenio_nome` — aquele é cache da última sessão, e convênio
 * no TiTa é por AGENDAMENTO, então o cache diz 'Particular' para um paciente da
 * ASSIM cuja última sessão foi particular.
 *
 * Substitui, nesta página, a dupla `usePacientes()` (cadastro inteiro, milhares de
 * linhas, sem noção de convênio) + uma consulta por paciente escolhido. Vem tudo
 * junto: carteirinha, CRM, UF e médico solicitante.
 *
 * Cache em módulo compartilhado entre instâncias, mesmo padrão de `usePacientes.ts`.
 */
export type PacienteAssim = {
  paciente_id: number
  paciente_nome: string
  numero_carteirinha: string | null
  crm: string | null
  crm_uf: string | null
  nome_medico: string | null
  ultima_sessao: string | null
}

type State = {
  pacientes: PacienteAssim[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: State = { pacientes: [], loading: true, error: null }

let cachedState: State | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: State) => void>()

function notify(state: State) {
  cachedState = state
  subscribers.forEach((fn) => fn(state))
}

// O await mora aqui dentro porque `supabase.rpc()` devolve um
// PostgrestFilterBuilder — PromiseLike, sem `.finally`.
async function buscar(): Promise<void> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc("listar_pacientes_assim")

  if (error) {
    console.error("Erro ao buscar pacientes da ASSIM:", error)
    notify({ pacientes: [], loading: false, error: error.message })
    return
  }

  notify({
    pacientes: (data ?? []) as unknown as PacienteAssim[],
    loading: false,
    error: null,
  })
}

function fetchPacientes(): Promise<void> {
  if (inflightFetch) return inflightFetch

  inflightFetch = buscar().finally(() => {
    inflightFetch = null
  })

  return inflightFetch
}

export function refetchPacientesAssim(): Promise<void> {
  inflightFetch = null
  notify({ pacientes: cachedState?.pacientes ?? [], loading: true, error: null })
  return fetchPacientes()
}

export function usePacientesAssim() {
  const [state, setState] = useState<State>(cachedState ?? INITIAL_STATE)

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
