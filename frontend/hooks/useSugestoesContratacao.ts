"use client"

// Compõe o pipeline completo de sugestão de contratação (Tarefas 1-5): busca a
// grade da semana de referência + salas + valores de convênio + feriados, e
// roda os 5 estágios do motor em lib/cronograma/sugestaoContratacao.ts.

import { useEffect, useMemo, useState } from "react"
import { useGradeAgendamentos } from "./useGradeAgendamentos"
import { useOcupacaoSalas } from "./useOcupacaoSalas"
import { useConvenioValores } from "./useConvenioValores"
import { useFeriados } from "./useFeriados"
import { listarExclusividadesTerapia } from "@/services/salas.service"
import type { SalaTerapiaExclusiva } from "@/lib/cronograma/salasTypes"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { filtrarCapacidadeLivreReservada } from "@/lib/cronograma/helpers"
import {
  calcularTodosCombos, filtrarCombosPorFaixa, anexarModalidadeERemanejamento, filtrarPorDisponibilidadeInterna,
  anexarSala, anexarRemuneracaoEOrdenar, calcularGapMap, TODAS_FAIXAS_CASCATA,
  type ModoCascataOcupacao, type FaixaCascata,
} from "@/lib/cronograma/sugestaoContratacao"
import type { GapItem } from "@/lib/cronograma/simulacaoNovoPrestador"
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
  /** Mapa de gap por paciente+especialidade — usado pra recalcular uma combinação
   *  isolada (sem o teto global entre sugestões) no Ponto de Equilíbrio de cada card. */
  gapMap: Record<string, GapItem>
}

export function useSugestoesContratacao(
  modo: ModoCascataOcupacao = "porTurno",
  faixasSelecionadas: ReadonlySet<FaixaCascata> = TODAS_FAIXAS_CASCATA,
): UseSugestoesContratacaoResult {
  const { cRows: cRowsBrutos, loading: loadingGrade, error: errorGrade, refWeek } = useGradeAgendamentos()
  // Amanda Ribeiro/Gracielle Rayane têm muitos horários "Livre" DE PROPÓSITO
  // (não é capacidade real) — as sugestões automáticas de contratação (parte
  // da tab "Simulação de Novo Prestador") não podem descontar esses horários
  // como disponibilidade interna já existente.
  const cRows = useMemo(() => filtrarCapacidadeLivreReservada(cRowsBrutos), [cRowsBrutos])
  const { lRows } = useCronogramaData()
  const { salasComOcupacao, loading: loadingSalas, error: errorSalas } = useOcupacaoSalas(refWeek.inicio, refWeek.fim)
  const { regrasGerais, excecoesPaciente, loading: loadingValores, error: errorValores } = useConvenioValores()
  const { feriados, loading: loadingFeriados } = useFeriados()

  const [exclusividades, setExclusividades] = useState<SalaTerapiaExclusiva[]>([])
  useEffect(() => {
    let cancelled = false
    listarExclusividadesTerapia().then(r => { if (!cancelled) setExclusividades(r) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

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

  const gapMap = useMemo(
    () => (cRows.length && lRows.length ? calcularGapMap(lRows, cRows) : {}),
    [lRows, cRows],
  )

  const sugestoes = useMemo((): SugestaoContratacao[] => {
    if (!cRows.length || !lRows.length) return []
    const base = filtrarCombosPorFaixa(todosCombos, faixasSelecionadas)
    const comRemanejamento = anexarModalidadeERemanejamento(base, cRows, gapMap)
    const comDisponibilidade = filtrarPorDisponibilidadeInterna(comRemanejamento, cRows, gapMap)
    const comSala = anexarSala(comDisponibilidade, salasComOcupacao, exclusividades)
    return anexarRemuneracaoEOrdenar(comSala, cRows, regrasGerais, excecoesPaciente, mesReferencia, feriados)
  }, [todosCombos, faixasSelecionadas, cRows, lRows, gapMap, salasComOcupacao, exclusividades, regrasGerais, excecoesPaciente, mesReferencia, feriados])

  return {
    sugestoes,
    loading: loadingGrade || loadingSalas || loadingValores || loadingFeriados,
    error: errorGrade || errorSalas || errorValores || null,
    laudosCarregados: lRows.length > 0,
    refWeekLabel: refWeek.label,
    cRows,
    gapMap,
  }
}
