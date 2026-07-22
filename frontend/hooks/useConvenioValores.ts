"use client"

import { useEffect, useState } from "react"
import {
  listarConvenioValores, listarConvenioValoresPaciente, listarConvenioPacoteAvaliacao,
  listarConveniosAgenda, listarTerapiasAgenda, listarPacientesAgenda,
  type OpcaoTerapia, type OpcaoPaciente,
} from "@/services/convenioValores.service"
import type { ConvenioValor, ConvenioValorPaciente, ConvenioPacoteAvaliacao } from "@/lib/cronograma/convenioValoresTypes"

export interface UseConvenioValoresResult {
  regrasGerais: ConvenioValor[]
  excecoesPaciente: ConvenioValorPaciente[]
  /** Valor fixo do pacote de Avaliação Neuropsicológica por convênio (cobrado uma vez por paciente, não por sessão). */
  pacotesAvaliacao: ConvenioPacoteAvaliacao[]
  /** Convênios, terapias e pacientes distintos vistos na agenda real (csv_grades_profissionais) — únicas opções válidas pros formulários. */
  conveniosAgenda: string[]
  terapiasAgenda: OpcaoTerapia[]
  pacientesAgenda: OpcaoPaciente[]
  loading: boolean
  error: string | null
  recarregar: () => void
}

/** Carrega as regras de valor por convênio/terapia + exceções por paciente + pacote de avaliação, e as opções reais da agenda pros formulários — usado tanto pela tela de cadastro quanto pela Previsão de Receitas. */
export function useConvenioValores(): UseConvenioValoresResult {
  const [regrasGerais, setRegrasGerais] = useState<ConvenioValor[]>([])
  const [excecoesPaciente, setExcecoesPaciente] = useState<ConvenioValorPaciente[]>([])
  const [pacotesAvaliacao, setPacotesAvaliacao] = useState<ConvenioPacoteAvaliacao[]>([])
  const [conveniosAgenda, setConveniosAgenda] = useState<string[]>([])
  const [terapiasAgenda, setTerapiasAgenda] = useState<OpcaoTerapia[]>([])
  const [pacientesAgenda, setPacientesAgenda] = useState<OpcaoPaciente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      listarConvenioValores(),
      listarConvenioValoresPaciente(),
      listarConvenioPacoteAvaliacao(),
      listarConveniosAgenda(),
      listarTerapiasAgenda(),
      listarPacientesAgenda(),
    ])
      .then(([gerais, excecoes, pacotes, convenios, terapias, pacientes]) => {
        if (cancelled) return
        setRegrasGerais(gerais)
        setExcecoesPaciente(excecoes)
        setPacotesAvaliacao(pacotes)
        setConveniosAgenda(convenios)
        setTerapiasAgenda(terapias)
        setPacientesAgenda(pacientes)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [refreshKey])

  return {
    regrasGerais, excecoesPaciente, pacotesAvaliacao, conveniosAgenda, terapiasAgenda, pacientesAgenda,
    loading, error, recarregar: () => setRefreshKey(k => k + 1),
  }
}
