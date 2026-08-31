"use client"

import { useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"

/**
 * O mapa terapia -> TUSS, servido pela RPC `listar_terapias_tuss()`.
 *
 * A RPC deriva os pares de `tuss_da_sessao()` — o mapa ÚNICO do sistema — através
 * de `agenda_tita_autorizacao`. Nunca reescrever esse CASE aqui em TypeScript: ele
 * já existiu em duas versões divergentes e o sintoma foi sessão sumindo de tela,
 * calada, por `codigo_tuss IS NOT NULL`.
 *
 * Cache em módulo compartilhado entre todas as instâncias montadas ao mesmo tempo,
 * mesmo padrão de `usePacientes.ts` e `useFeriados.ts`. A lista tem ~12 pares e
 * não muda dentro de uma sessão de trabalho, então uma busca por sessão basta.
 */
export type TerapiaTuss = {
  terapia: string
  codigo_tuss: string
}

type TerapiasState = {
  terapias: TerapiaTuss[]
  loading: boolean
  error: string | null
}

const INITIAL_STATE: TerapiasState = { terapias: [], loading: true, error: null }

let cachedState: TerapiasState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: TerapiasState) => void>()

function notify(state: TerapiasState) {
  cachedState = state
  subscribers.forEach((fn) => fn(state))
}

// `supabase.rpc()` devolve um PostgrestFilterBuilder, que é PromiseLike e não
// Promise — não tem `.finally`. Por isso o await mora dentro desta função async,
// mesmo padrão de `getPacientes` em services/pacientes.service.ts.
async function buscar(): Promise<void> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc("listar_terapias_tuss")

  if (error) {
    console.error("Erro ao buscar terapias/TUSS:", error)
    notify({ terapias: [], loading: false, error: error.message })
    return
  }

  notify({ terapias: (data ?? []) as unknown as TerapiaTuss[], loading: false, error: null })
}

function fetchTerapias(): Promise<void> {
  if (inflightFetch) return inflightFetch

  inflightFetch = buscar().finally(() => {
    inflightFetch = null
  })

  return inflightFetch
}

export function refetchTerapiasTuss(): Promise<void> {
  inflightFetch = null
  notify({ terapias: cachedState?.terapias ?? [], loading: true, error: null })
  return fetchTerapias()
}

export function useTerapiasTuss() {
  const [state, setState] = useState<TerapiasState>(cachedState ?? INITIAL_STATE)

  useEffect(() => {
    subscribers.add(setState)
    if (!cachedState || cachedState.error) {
      fetchTerapias()
    }
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  return state
}
