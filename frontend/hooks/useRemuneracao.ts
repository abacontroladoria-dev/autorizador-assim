"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { buscarGradeParaAnalise } from "@/lib/remuneracao/gradeRemuneracao"
import {
  calcularAnaliseFutura, calcularRemuneracaoReal, calcularPEProporcional,
  normalizarRelatorioPE, parsePeriodoArquivo, PE_INATIVO,
  type AnaliseFuturaResult, type ProfRemunReal, type PERow, type ContratoAntigoInfo, type CadastroContratual,
} from "@/lib/remuneracao/calculo"
import { normalizarGradeParaSessao, classificarSessaoReal, type SessaoReal, type CsvGradeRow } from "@/lib/remuneracao/relatorio"
import { buscarPresencaFilaAutorizacoes, presencaDaSessao, type PresencaIndice } from "@/lib/remuneracao/presencaReal"
import { dataParaISO, mesAnoDeLinhas } from "@/lib/remuneracao/datas"
import { getContratosAntigos, getContratosAtuais, getCapacidades } from "@/services/remuneracao.service"
import { useRemuneracaoConfig } from "./useRemuneracaoConfig"
import type { CsvRow } from "@/types/cronograma"

export function useAnaliseFutura() {
  const { config, loading: configLoading, error: configError } = useRemuneracaoConfig()
  const [rows, setRows] = useState<CsvRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(true)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const [antigos, setAntigos] = useState<Record<string, ContratoAntigoInfo>>({})
  const [limites, setLimites] = useState<Record<string, number>>({})
  const [cadastroPrestadores, setCadastroPrestadores] = useState<Record<string, CadastroContratual>>({})
  const refWeek = useMemo(() => getRefWeek(), [])

  useEffect(() => {
    let isMounted = true
    async function load() {
      setRowsLoading(true)
      try {
        const data = await buscarGradeParaAnalise(refWeek.inicio, refWeek.fim)
        if (isMounted) setRows(data)
      } catch (e) {
        if (isMounted) setRowsError(e instanceof Error ? e.message : "Erro ao buscar grade.")
      } finally {
        if (isMounted) setRowsLoading(false)
      }
    }
    load()
    return () => { isMounted = false }
  }, [refWeek])

  // Contratos antigos (comparação) e capacidade/limite de CC por profissional —
  // cadastrados em Config, não dependem da semana de referência.
  useEffect(() => {
    let isMounted = true
    async function loadContratuais() {
      const [{ data: antigosData }, { data: capacidadesData }, { data: atuaisData }] = await Promise.all([
        getContratosAntigos(),
        getCapacidades(),
        getContratosAtuais(),
      ])
      if (!isMounted) return

      const antigosMap: Record<string, ContratoAntigoInfo> = {}
      ;(antigosData ?? []).forEach((r: any) => {
        antigosMap[r.profissional_nome] = { salario: r.salario, chSemanal: r.ch_semanal, contrato: r.contrato }
      })

      const limitesMap: Record<string, number> = {}
      ;(capacidadesData ?? []).forEach((r: any) => {
        if (r.limite_cc != null) limitesMap[r.profissional_nome] = r.limite_cc
      })

      const cadastroMap: Record<string, CadastroContratual> = {}
      ;(atuaisData ?? []).forEach((r: any) => {
        cadastroMap[r.profissional_nome] = {
          nome: r.profissional_nome,
          contratosAtuais: Array.isArray(r.contratos_atuais) ? r.contratos_atuais : [],
        }
      })

      setAntigos(antigosMap)
      setLimites(limitesMap)
      setCadastroPrestadores(cadastroMap)
    }
    loadContratuais()
    return () => { isMounted = false }
  }, [])

  const resultado: AnaliseFuturaResult | null = useMemo(() => {
    if (!config || !rows.length) return null
    return calcularAnaliseFutura(rows, {
      taxasPA: config.taxas_pa,
      diarias: config.diarias,
      etaBonus: config.eta_bonus_default,
      ccPA: config.cc_pa_default,
      ccPE: config.cc_pe_default,
      ccLimDefault: config.cc_lim_default,
      presenca: config.presenca_padrao,
      feriados: config.feriados,
      limites,
      antigos,
      cadastroPrestadores,
    })
  }, [config, rows, antigos, limites, cadastroPrestadores])

  const analMes = useMemo(() => (rows.length ? mesAnoDeLinhas(rows as unknown as Record<string, unknown>[]) : null), [rows])

  return {
    resultado,
    refWeek,
    analMes,
    presenca: config?.presenca_padrao ?? null,
    loading: configLoading || rowsLoading,
    error: configError || rowsError,
    gradeVazia: !rowsLoading && rows.length === 0,
    totalGrade: rows.length,
  }
}

export function useRemunRP() {
  const { config, loading: configLoading, error: configError } = useRemuneracaoConfig()
  const [evoRowsBase, setEvoRowsBase] = useState<SessaoReal[]>([])
  const [presencaIndice, setPresencaIndice] = useState<PresencaIndice>({ porId: new Map(), porChave: new Map() })
  const [csvName, setCsvName] = useState<string | null>(null)
  const [peRows, setPeRows] = useState<PERow[]>([])
  const [peName, setPeName] = useState<string | null>(null)
  const [antigos, setAntigos] = useState<Record<string, ContratoAntigoInfo>>({})
  const [cadastroPrestadores, setCadastroPrestadores] = useState<Record<string, CadastroContratual>>({})

  // Contratos antigos (comparação) e cadastro contratual atual (PA por contrato) —
  // cadastrados em Config, não dependem da grade importada.
  useEffect(() => {
    let isMounted = true
    async function loadContratuais() {
      const [{ data: antigosData }, { data: atuaisData }] = await Promise.all([
        getContratosAntigos(),
        getContratosAtuais(),
      ])
      if (!isMounted) return

      const antigosMap: Record<string, ContratoAntigoInfo> = {}
      ;(antigosData ?? []).forEach((r: any) => {
        antigosMap[r.profissional_nome] = { salario: r.salario, chSemanal: r.ch_semanal, contrato: r.contrato }
      })

      const cadastroMap: Record<string, CadastroContratual> = {}
      ;(atuaisData ?? []).forEach((r: any) => {
        cadastroMap[r.profissional_nome] = {
          nome: r.profissional_nome,
          contratosAtuais: Array.isArray(r.contratos_atuais) ? r.contratos_atuais : [],
        }
      })

      setAntigos(antigosMap)
      setCadastroPrestadores(cadastroMap)
    }
    loadContratuais()
    return () => { isMounted = false }
  }, [])

  const carregarGrade = useCallback((rows: Record<string, unknown>[]) => {
    setEvoRowsBase(normalizarGradeParaSessao(rows))
  }, [])

  const limparGrade = useCallback(() => {
    setEvoRowsBase([])
    setPresencaIndice({ porId: new Map(), porChave: new Map() })
    setCsvName(null)
  }, [])

  // Cruza a grade carregada com fila_autorizacoes (mesma tabela usada por
  // cronograma/reposicao) para saber a presença real registrada pela recepção —
  // sem isso, presencaOrbita ("Presença Recep.") sai sempre "Sim" (ver
  // normalizarGradeParaSessao).
  useEffect(() => {
    const datasIso = evoRowsBase.map(r => dataParaISO(r.data)).filter(Boolean)
    if (datasIso.length === 0) {
      setPresencaIndice({ porId: new Map(), porChave: new Map() })
      return
    }
    let cancelled = false
    const dataMin = datasIso.reduce((a, b) => (b < a ? b : a))
    const dataMax = datasIso.reduce((a, b) => (b > a ? b : a))
    buscarPresencaFilaAutorizacoes(dataMin, dataMax).then(indice => {
      if (!cancelled) setPresencaIndice(indice)
    })
    return () => { cancelled = true }
  }, [evoRowsBase])

  // evoRows final: sobrepõe presencaOrbita conforme fila_autorizacoes — casando
  // primeiro pelo id do agendamento (mais confiável) e só then por
  // paciente+data+hora. Sessões sem registro na fila mantêm o fallback "Sim"
  // (mesmo comportamento de antes).
  const evoRows = useMemo(() => {
    if (presencaIndice.porId.size === 0 && presencaIndice.porChave.size === 0) return evoRowsBase
    return evoRowsBase.map(r => {
      const presente = presencaDaSessao(r.id, r.paciente, r.data, r.hora, presencaIndice)
      if (presente === undefined) return r
      const presencaOrbita = presente ? "Sim" : "Não"
      if (presencaOrbita === r.presencaOrbita) return r
      const atualizado = { ...r, presencaOrbita }
      atualizado.classificacao = classificarSessaoReal(atualizado)
      return atualizado
    })
  }, [evoRowsBase, presencaIndice])

  const carregarPE = useCallback((rows: CsvGradeRow[], fileName: string) => {
    setPeRows(normalizarRelatorioPE(rows, parsePeriodoArquivo(fileName)))
    setPeName(fileName)
  }, [])

  const limparPE = useCallback(() => {
    setPeRows([])
    setPeName(null)
  }, [])

  // Coordenadores de Caso "ativos": aparecem com essa especialidade na própria
  // grade enviada (adaptação — a calc original usava dadosPorProf da Análise
  // Futura, mas aqui as duas abas têm janelas de dados diferentes).
  const coordsAtivos = useMemo(
    () => [...new Set(evoRows.filter(r => r.especialidade === "Coordenador de Caso").map(r => r.profAgenda).filter(Boolean))],
    [evoRows]
  )

  const peAnaliseCompleta = evoRows.length > 0 && peRows.length > 0
  const peStatusMensagem = peAnaliseCompleta
    ? "PE calculado com relatórios 1 e 2."
    : "PE bloqueado: importe csv_grade_profissionais e agendamentos_profissionais para calcular com segurança."

  const peProporcional = useMemo(() => {
    if (!config || !peAnaliseCompleta) return PE_INATIVO
    return calcularPEProporcional(peRows, config.cc_pe_default, evoRows, coordsAtivos)
  }, [config, peAnaliseCompleta, peRows, evoRows, coordsAtivos])

  const resultado: ProfRemunReal[] | null = useMemo(() => {
    if (!config || !evoRows.length) return null
    return calcularRemuneracaoReal(evoRows, {
      taxasPA: config.taxas_pa,
      diarias: config.diarias,
      etaBonus: config.eta_bonus_default,
      ccPA: config.cc_pa_default,
      ccPE: config.cc_pe_default,
      antigos,
      cadastroPrestadores,
      peAnaliseCompleta,
      peProporcional,
      peStatusMensagem,
    })
  }, [config, evoRows, antigos, cadastroPrestadores, peAnaliseCompleta, peProporcional, peStatusMensagem])

  return {
    resultado,
    presenca: config?.presenca_padrao ?? 80,
    evoRows,
    csvName,
    setCsvName,
    carregarGrade,
    limparGrade,
    peRows,
    peName,
    carregarPE,
    limparPE,
    peAnaliseCompleta,
    peStatusMensagem,
    cadastroPrestadores,
    loading: configLoading,
    error: configError,
  }
}
