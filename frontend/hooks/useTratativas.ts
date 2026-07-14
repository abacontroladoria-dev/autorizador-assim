"use client"

// Hook da tela "Análise de Tratativas" (escopo Terapêutico). Espelha o fluxo de
// upload de useRemunRP (hooks/useRemuneracao.ts), MAS:
//   • nunca busca taxas/diárias/contratos/PE — só os feriados (getFeriadosConfig),
//     necessários apenas para a classificação de sessões;
//   • não faz upload de PE (relatório monetário) — apenas a grade;
//   • entrega ProfTratativas[] (só contagens, sem nenhum campo em R$).
// Ver lib/remuneracao/tratativas.ts para o porquê da segurança.

import { useCallback, useEffect, useMemo, useState } from "react"
import { normalizarGradeParaSessao, classificarSessaoReal } from "@/lib/remuneracao/relatorio"
import { buscarPresencaFilaAutorizacoes, presencaDaSessao, type PresencaIndice } from "@/lib/remuneracao/presencaReal"
import { dataParaISO } from "@/lib/remuneracao/datas"
import { getFeriadosConfig } from "@/services/remuneracao.service"
import { resumirTratativas, type ProfTratativas } from "@/lib/remuneracao/tratativas"
import type { FeriadoInfo } from "@/types/remuneracao"

export function useTratativas() {
  const [feriados, setFeriados] = useState<Record<string, FeriadoInfo> | null>(null)
  const [feriadosLoading, setFeriadosLoading] = useState(true)
  const [feriadosError, setFeriadosError] = useState<string | null>(null)

  // Guardamos as linhas CRUAS da grade (não a versão já normalizada): assim a
  // classificação é re-derivada sempre que os feriados chegarem/mudarem — sem
  // isso, um upload feito antes do getFeriadosConfig() resolver classificaria a
  // grade sem feriados e nunca mais reclassificaria. Ver Config → Feriados.
  const [rawRows, setRawRows] = useState<Record<string, unknown>[] | null>(null)
  const [presencaIndice, setPresencaIndice] = useState<PresencaIndice>({ porId: new Map(), porChave: new Map() })
  const [csvName, setCsvName] = useState<string | null>(null)

  // Carrega SOMENTE os feriados — jamais taxas.
  useEffect(() => {
    let isMounted = true
    getFeriadosConfig()
      .then(({ feriados, error }) => {
        if (!isMounted) return
        setFeriados(feriados)
        setFeriadosError(error)
      })
      .finally(() => { if (isMounted) setFeriadosLoading(false) })
    return () => { isMounted = false }
  }, [])

  const carregarGrade = useCallback((rows: Record<string, unknown>[]) => {
    setRawRows(rows)
  }, [])

  const limparGrade = useCallback(() => {
    setRawRows(null)
    setPresencaIndice({ porId: new Map(), porChave: new Map() })
    setCsvName(null)
  }, [])

  // Normaliza/classifica a grade a partir das linhas cruas + feriados atuais.
  // Reage tanto ao upload (rawRows) quanto à chegada/alteração dos feriados.
  const evoRowsBase = useMemo(
    () => (rawRows ? normalizarGradeParaSessao(rawRows, feriados ?? undefined) : []),
    [rawRows, feriados],
  )

  // Cruza a grade com fila_autorizacoes para saber a presença real registrada
  // pela recepção (mesma fonte de Reposição de Faltas) — não é dado monetário.
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

  const evoRows = useMemo(() => {
    if (presencaIndice.porId.size === 0 && presencaIndice.porChave.size === 0) return evoRowsBase
    return evoRowsBase.map(r => {
      const presente = presencaDaSessao(r.id, r.paciente, r.data, r.hora, presencaIndice)
      if (presente === undefined) return r
      const presencaOrbita = presente ? "Sim" : "Não"
      if (presencaOrbita === r.presencaOrbita) return r
      const atualizado = { ...r, presencaOrbita }
      atualizado.classificacao = classificarSessaoReal(atualizado, feriados ?? undefined)
      return atualizado
    })
  }, [evoRowsBase, presencaIndice, feriados])

  const resultado: ProfTratativas[] | null = useMemo(() => {
    if (!evoRows.length) return null
    return resumirTratativas(evoRows, feriados ?? undefined)
  }, [evoRows, feriados])

  return {
    resultado,
    evoRows,
    csvName,
    setCsvName,
    carregarGrade,
    limparGrade,
    loading: feriadosLoading,
    error: feriadosError,
  }
}
