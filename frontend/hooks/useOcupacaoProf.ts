'use client'

import { useEffect, useMemo, useState } from 'react'
import { buscarGradeComoCSVRows } from '@/lib/cronograma/gradeService'
import { calcularOcupacaoSemanal, buildAllSlotsFromRows } from '@/lib/cronograma/ocupacaoProf'
import type { CsvRow } from '@/types/cronograma'
import type { DadosProfissional } from '@/types/ocupacaoProf'

// ─── HELPERS LOCAIS ───────────────────────────────────────────────────────────

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function mesLabel(ano: number, mes: number): string {
  return `${MESES_PT[mes - 1] ?? ''} ${ano}`
}

function monthRange(ano: number, mes: number): { inicio: string; fim: string } {
  const mm = String(mes).padStart(2, '0')
  const lastDay = new Date(ano, mes, 0).getDate()
  return {
    inicio: `${ano}-${mm}-01`,
    fim: `${ano}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export interface UseOcupacaoProfResult {
  dadosPorProf: DadosProfissional[]
  allTerps: string[]
  allUnits: string[]
  analMes: string
  loading: boolean
  error: string | null
}

export function useOcupacaoProf(inicio: string, fim: string, label: string): UseOcupacaoProfResult {
  const [rows, setRows]       = useState<CsvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    buscarGradeComoCSVRows(inicio, fim)
      .then(data => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch(err  => { if (!cancelled) { setError(String(err?.message ?? err)); setLoading(false) } })

    return () => { cancelled = true }
  }, [inicio, fim])

  const { dadosPorProf, allTerps, allUnits } = useMemo(() => {
    if (!rows.length) return { dadosPorProf: [], allTerps: [], allUnits: [] }

    const allSlots    = buildAllSlotsFromRows(rows)
    const terpsSet    = new Set<string>()
    const unitsSet    = new Set<string>()
    const terapiasMap: Record<string, Set<string>> = {}

    for (const r of rows) {
      const prof = String(r['Profissional'] ?? '').trim()
      const terp = String(r['Terapia']      ?? '').trim()
      if (!prof || !terp) continue
      if (!terapiasMap[prof]) terapiasMap[prof] = new Set()
      terapiasMap[prof].add(terp)
      terpsSet.add(terp)
    }

    const dadosPorProf: DadosProfissional[] = Object.keys(allSlots).map(prof => {
      const slotData = allSlots[prof]
      const ocupacao = calcularOcupacaoSemanal(slotData, prof)

      ocupacao.slots.forEach(s => { if (s.unidade) unitsSet.add(s.unidade) })

      return {
        prof,
        slotData,
        ocupacao,
        taxaOcupacao: ocupacao.pct,
        terapiaDetails: [...(terapiasMap[prof] ?? [])].sort().map(terp => ({ terp })),
      }
    })

    return {
      dadosPorProf,
      allTerps: [...terpsSet].sort(),
      allUnits:  [...unitsSet].sort(),
    }
  }, [rows])

  return { dadosPorProf, allTerps, allUnits, analMes: label, loading, error }
}
