"use client"

import { useEffect, useMemo, useState } from "react"
import { listarSalas, listarAlocacoes, buscarLinhasAgendaParaSalas } from "@/services/salas.service"
import { calcularOcupacaoDaSala, calcularResumoUnidades } from "@/lib/cronograma/salas"
import { calcularDashboardPacientes } from "@/lib/cronograma/pacientesDashboard"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { normTxt } from "@/lib/cronograma/constants"
import type { Sala, SalaComOcupacao, ResumoUnidadeSalas, AgendaSalaRow, AlocacaoSala, ResumoPacientesSalas } from "@/lib/cronograma/salasTypes"

/**
 * Período padrão de análise. `csv_grades_profissionais` é sincronizado pelo TITA
 * em janelas específicas (não necessariamente cobrindo a semana-calendário
 * corrente) — o resto do módulo Cronograma já usa `getRefWeek()` (primeira
 * segunda-feira do mês seguinte) como "semana de referência" com dados
 * garantidamente sincronizados. Reaproveitado aqui para não cair numa janela
 * vazia por coincidência de data.
 */
export function semanaCorrenteRange(): { inicio: string; fim: string } {
  const { inicio, fim } = getRefWeek()
  return { inicio, fim }
}

/** Onde uma alocação (profissional) já se encontra — usado para detectar conflito ao mover. */
export interface AlocacaoAtual {
  alocacao: AlocacaoSala
  sala: Sala
}

export interface UseOcupacaoSalasResult {
  salas: Sala[]
  alocacoes: AlocacaoSala[]
  salasComOcupacao: SalaComOcupacao[]
  resumoUnidades: ResumoUnidadeSalas[]
  dashboardPacientes: ResumoPacientesSalas
  loading: boolean
  error: string | null
  recarregar: () => void
  /** Encontra onde um profissional já está alocado (dow+turno específicos), exceto a própria alocação (se informada). */
  encontrarAlocacaoDoProfissional: (profissionalNome: string, dow: number, turno: "Manhã" | "Tarde", excetoAlocacaoId?: string) => AlocacaoAtual | null
}

export function useOcupacaoSalas(inicio?: string, fim?: string): UseOcupacaoSalasResult {
  const periodo = useMemo(() => {
    if (inicio && fim) return { inicio, fim }
    return semanaCorrenteRange()
  }, [inicio, fim])

  const [salas, setSalas] = useState<Sala[]>([])
  const [alocacoes, setAlocacoes] = useState<AlocacaoSala[]>([])
  const [linhas, setLinhas] = useState<AgendaSalaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      listarSalas(),
      listarAlocacoes(),
      buscarLinhasAgendaParaSalas(periodo.inicio, periodo.fim),
    ])
      .then(([salasData, alocacoesData, linhasData]) => {
        if (cancelled) return
        setSalas(salasData)
        setAlocacoes(alocacoesData)
        setLinhas(linhasData)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(String(err?.message ?? err))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [periodo.inicio, periodo.fim, refreshKey])

  const salasComOcupacao = useMemo(
    () => salas.map(sala => calcularOcupacaoDaSala(sala, alocacoes, linhas)),
    [salas, alocacoes, linhas],
  )

  const resumoUnidades = useMemo(
    () => calcularResumoUnidades(salas, alocacoes, linhas),
    [salas, alocacoes, linhas],
  )

  const dashboardPacientes = useMemo(
    () => calcularDashboardPacientes(linhas),
    [linhas],
  )

  const encontrarAlocacaoDoProfissional = useMemo(() => {
    return (profissionalNome: string, dow: number, turno: "Manhã" | "Tarde", excetoAlocacaoId?: string): AlocacaoAtual | null => {
      const alvo = normTxt(profissionalNome)
      const encontrada = alocacoes.find(a =>
        a.id !== excetoAlocacaoId
        && a.dow === dow
        && a.turno === turno
        && normTxt(a.profissional_nome) === alvo,
      )
      if (!encontrada) return null
      const sala = salas.find(s => s.id === encontrada.sala_id)
      if (!sala) return null
      return { alocacao: encontrada, sala }
    }
  }, [alocacoes, salas])

  return {
    salas,
    alocacoes,
    salasComOcupacao,
    resumoUnidades,
    dashboardPacientes,
    loading,
    error,
    recarregar: () => setRefreshKey(k => k + 1),
    encontrarAlocacaoDoProfissional,
  }
}