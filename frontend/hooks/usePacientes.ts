"use client"

import { useEffect, useState } from "react"
import { getPacientes } from "@/services/pacientes.service"
import { getTelefonesDosResponsaveis } from "@/services/responsaveis.service"
import type { Paciente } from "@/types/paciente"

type PacientesState = {
  pacientes: Paciente[]
  /**
   * `id_paciente` -> celular do responsável de maior prioridade. Vem junto do
   * paciente porque a listagem mostra os dois lado a lado no cartão, e uma
   * segunda rodada de carregamento faria o telefone piscar depois do nome.
   */
  telefonesResponsaveis: Map<number, string>
  loading: boolean
  error: string | null
}

const INITIAL_STATE: PacientesState = {
  pacientes: [],
  telefonesResponsaveis: new Map(),
  loading: true,
  error: null,
}

let cachedState: PacientesState | null = null
let inflightFetch: Promise<void> | null = null
const subscribers = new Set<(state: PacientesState) => void>()

function notify(state: PacientesState) {
  cachedState = state
  subscribers.forEach((fn) => fn(state))
}

function fetchPacientes(): Promise<void> {
  if (inflightFetch) return inflightFetch
  // Traz TUDO (fictícios e inativos inclusos) — o único consumidor hoje
  // (PacientesCadastro) decide o que mostrar com o filtro de Situação. Buscar
  // tudo uma vez é mais barato que refazer a requisição a cada combinação do
  // filtro.
  // As duas consultas são independentes — em paralelo, e o telefone não pode
  // derrubar a listagem: sem responsável cadastrado o cartão só perde uma linha,
  // enquanto sem paciente não há tela. Por isso o erro do telefone é registrado
  // no console, não propagado para `error`.
  inflightFetch = Promise.all([
    getPacientes({ incluirFicticios: true, incluirInativos: true }),
    getTelefonesDosResponsaveis(),
  ])
    .then(([{ data, error }, telefones]) =>
      notify({
        pacientes: data,
        telefonesResponsaveis: telefones.data,
        loading: false,
        error,
      })
    )
    .finally(() => {
      inflightFetch = null
    })
  return inflightFetch
}

// Mesmo padrão de frontend/hooks/useFeriados.ts — cache compartilhado entre
// todas as instâncias do hook montadas ao mesmo tempo.
export function refetchPacientes(): Promise<void> {
  inflightFetch = null
  notify({
    pacientes: cachedState?.pacientes ?? [],
    telefonesResponsaveis: cachedState?.telefonesResponsaveis ?? new Map(),
    loading: true,
    error: null,
  })
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
