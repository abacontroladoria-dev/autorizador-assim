"use client"

import { useEffect, useState } from "react"
import {
  listarConvenioValores, listarConvenioValoresPaciente, listarConvenioPacoteAvaliacao,
  listarConvenioValoresCalculo, listarConvenioValoresPacienteCalculo, listarConvenioPacoteAvaliacaoCalculo,
  listarOpcoesAgenda,
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

    // As três listas da agenda vêm juntas de uma requisição só (vw_grade_opcoes)
    // — antes eram três varreduras paginadas da grade inteira.
    Promise.all([
      listarConvenioValores(),
      listarConvenioValoresPaciente(),
      listarConvenioPacoteAvaliacao(),
      listarOpcoesAgenda(),
    ])
      .then(([gerais, excecoes, pacotes, opcoes]) => {
        if (cancelled) return
        setRegrasGerais(gerais)
        setExcecoesPaciente(excecoes)
        setPacotesAvaliacao(pacotes)
        setConveniosAgenda(opcoes.convenios)
        setTerapiasAgenda(opcoes.terapias)
        setPacientesAgenda(opcoes.pacientes)
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

export interface UseConvenioValoresCalculoResult {
  regrasGerais: ConvenioValor[]
  excecoesPaciente: ConvenioValorPaciente[]
  pacotesAvaliacao: ConvenioPacoteAvaliacao[]
  loading: boolean
  error: string | null
}

/**
 * Mesmos valores de `useConvenioValores`, mas via RPC (`*Calculo`, migration
 * 20260824160000) em vez da tabela crua — para telas de CÁLCULO (Simulação,
 * Sugestões de Contratação, Previsão de Receitas) que não devem exigir acesso
 * a Cadastro de Valores (restrito a admin/diretoria). Sem `conveniosAgenda`/
 * `terapiasAgenda`/`pacientesAgenda` nem `recarregar`: essas telas só leem,
 * não alimentam formulário de cadastro.
 */
export function useConvenioValoresCalculo(): UseConvenioValoresCalculoResult {
  const [regrasGerais, setRegrasGerais] = useState<ConvenioValor[]>([])
  const [excecoesPaciente, setExcecoesPaciente] = useState<ConvenioValorPaciente[]>([])
  const [pacotesAvaliacao, setPacotesAvaliacao] = useState<ConvenioPacoteAvaliacao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      listarConvenioValoresCalculo(),
      listarConvenioValoresPacienteCalculo(),
      listarConvenioPacoteAvaliacaoCalculo(),
    ])
      .then(([gerais, excecoes, pacotes]) => {
        if (cancelled) return
        setRegrasGerais(gerais)
        setExcecoesPaciente(excecoes)
        setPacotesAvaliacao(pacotes)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { regrasGerais, excecoesPaciente, pacotesAvaliacao, loading, error }
}
