"use client"

// Compõe o pipeline completo de sugestão de contratação (Tarefas 1-5): busca a
// grade da semana de referência + salas + valores de convênio + feriados, e
// roda os 5 estágios do motor em lib/cronograma/sugestaoContratacao.ts.

import { useMemo } from "react"
import { useGradeAgendamentos } from "./useGradeAgendamentos"
import { useOcupacaoSalas } from "./useOcupacaoSalas"
import { useConvenioValores } from "./useConvenioValores"
import { useFeriados } from "./useFeriados"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import {
  calcularTodosCombos, filtrarCombosPorFaixa, anexarModalidadeERemanejamento, filtrarPorDisponibilidadeInterna,
  anexarSala, anexarRemuneracaoEOrdenar, calcularGapMap, TODAS_FAIXAS_CASCATA,
  type ModoCascataOcupacao, type FaixaCascata,
} from "@/lib/cronograma/sugestaoContratacao"
import type { SugestaoContratacao } from "@/lib/cronograma/sugestaoContratacaoTypes"
import type { CsvRow } from "@/types/cronograma"

export interface UseSugestoesContratacaoResult {
  sugestoes: SugestaoContratacao[]
  loading: boolean
  error: string | null
  laudosCarregados: boolean
  refWeekLabel: string
  /** Linhas cruas da grade — usadas pelo modal de antes/depois do remanejamento. */
  cRows: CsvRow[]
}

export function useSugestoesContratacao(
  modo: ModoCascataOcupacao = "porTurno",
  faixasSelecionadas: ReadonlySet<FaixaCascata> = TODAS_FAIXAS_CASCATA,
): UseSugestoesContratacaoResult {
  const { cRows, loading: loadingGrade, error: errorGrade, refWeek } = useGradeAgendamentos()
  const { lRows } = useCronogramaData()
  const { salasComOcupacao, loading: loadingSalas, error: errorSalas } = useOcupacaoSalas(refWeek.inicio, refWeek.fim)
  const { regrasGerais, excecoesPaciente, loading: loadingValores, error: errorValores } = useConvenioValores()
  const { feriados, loading: loadingFeriados } = useFeriados()

  const mesReferencia = useMemo(() => {
    const [ano, mes] = refWeek.inicio.split("-").map(Number)
    return ano && mes ? { ano, mes } : null
  }, [refWeek.inicio])

  // Parte cara (varre unidade × especialidade × dia) — não depende de
  // faixasSelecionadas, então marcar/desmarcar uma faixa no filtro não repete
  // essa varredura, só o filtro leve abaixo.
  const todosCombos = useMemo(
    () => calcularTodosCombos(lRows, cRows, modo),
    [lRows, cRows, modo],
  )

  const sugestoes = useMemo((): SugestaoContratacao[] => {
    if (!cRows.length || !lRows.length) return []
    const gapMap = calcularGapMap(lRows, cRows)
    const base = filtrarCombosPorFaixa(todosCombos, faixasSelecionadas)
    const comRemanejamento = anexarModalidadeERemanejamento(base, cRows, gapMap)
    const comDisponibilidade = filtrarPorDisponibilidadeInterna(comRemanejamento, cRows, gapMap)
    const comSala = anexarSala(comDisponibilidade, salasComOcupacao)
    return anexarRemuneracaoEOrdenar(comSala, cRows, regrasGerais, excecoesPaciente, mesReferencia, feriados)
  }, [todosCombos, faixasSelecionadas, cRows, lRows, salasComOcupacao, regrasGerais, excecoesPaciente, mesReferencia, feriados])

  return {
    sugestoes,
    loading: loadingGrade || loadingSalas || loadingValores || loadingFeriados,
    error: errorGrade || errorSalas || errorValores || null,
    laudosCarregados: lRows.length > 0,
    refWeekLabel: refWeek.label,
    cRows,
  }
}
