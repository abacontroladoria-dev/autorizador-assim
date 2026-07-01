'use client'

import { useEffect, useMemo, useState } from 'react'
import { buscarGradeComoCSVRows } from '@/lib/cronograma/gradeService'
import { calcularOcupacaoSemanal, parseUnidadeSala } from '@/lib/cronograma/ocupacaoProf'
import { normTxt } from '@/lib/cronograma/constants'
import type { CsvRow } from '@/types/cronograma'
import type { DadosProfissional, SlotData, SlotDetalhe } from '@/types/ocupacaoProf'

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

// ─── PACIENTES FICTÍCIOS (bloqueios, alinhamentos, supervisão de slot) ────────

const PACIENTES_FICTICIOS_EXATOS = new Set([
  'notificacao previa',
  'horario bloqueado',
  'horario administrativo',
  'ainda nao selecionado',
])

function isPacienteFicticio(pac: string): boolean {
  if (!pac.trim()) return true
  const n = normTxt(pac)
  if (PACIENTES_FICTICIOS_EXATOS.has(n)) return true
  if (n.startsWith('alinhamento ')) return true
  if (n.startsWith('supervisor ') || n.startsWith('supervisora ')) return true
  return false
}

// ─── BRIDGE: CsvRow[] → slotData por profissional ────────────────────────────

export function buildAllSlotsFromRows(rows: CsvRow[]): Record<string, SlotData> {
  const allSlots: Record<string, SlotData> = {}

  const seenAgendados = new Set<string>()
  const seenLivres    = new Set<string>()

  const DOW_FROM_NOME: Record<string, number> = {
    'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5,
  }

  for (const r of rows) {
    const prof      = String(r['Profissional']          ?? '').trim()
    const terp      = String(r['Terapia']               ?? '').trim()
    const date      = String(r['Data']                  ?? '').trim()
    const status    = String(r['Status do Agendamento'] ?? '')
    const pac       = String(r['Nome Favorecido']        ?? '').trim()
    const sala      = String(r['Sala']                  ?? '')
    const diaSemana = String(r['Dia da Semana']         ?? '').trim()

    if (!prof || !date) continue

    // Usa 'Dia da Semana' da view — NÃO computa de `data` pois a data representativa
    // pode não bater com o dia da semana real da sessão recorrente.
    const dow = DOW_FROM_NOME[diaSemana] ?? new Date(`${date}T12:00:00`).getDay()
    if (dow < 1 || dow > 5) continue

    const row = r as Record<string, unknown>
    const ini = typeof row.HI === 'number' ? row.HI : null
    const hf  = typeof row.HF === 'number' ? row.HF : null
    const fim = hf ?? (ini !== null ? ini + 40 : null)
    const unidade = parseUnidadeSala(sala)

    if (!allSlots[prof]) allSlots[prof] = { diasInfo: {}, terpDays: {} }
    const profSlots = allSlots[prof]

    // Chave por dow (não por date): sessões recorrentes do mesmo dia da semana
    // são consolidadas independente da data representativa na view.
    const diKey = String(dow)
    if (!profSlots.diasInfo[diKey]) {
      profSlots.diasInfo[diKey] = {
        dow, inicioMin: 9999, fimMin: 0, ag: 0, liv: 0, slotDetails: {},
      }
    }
    const di = profSlots.diasInfo[diKey]

    if (ini !== null && ini < di.inicioMin) di.inicioMin = ini
    if (fim !== null && fim > di.fimMin)    di.fimMin    = fim

    // "Em Conflito" = sessão existe mas tem conflito de agenda; conta como ocupado
    const agendado = status === 'Agendado' || status === 'Em Conflito'

    if (ini !== null && fim !== null) {
      const sk = `${terp}|${unidade}|${ini}|${fim}`

      if (agendado) {
        const ficticio = isPacienteFicticio(pac)
        const dedupKey = `${prof}|${diKey}|${sk}|${pac || '_anon'}`
        if (seenAgendados.has(dedupKey)) continue
        seenAgendados.add(dedupKey)

        if (!di.slotDetails[sk]) {
          di.slotDetails[sk] = {
            date, dow, terp, unidade, ini, fim,
            ag: 0, liv: 0, realAg: 0, technicalAg: 0, patients: [],
          }
        }
        const sd = di.slotDetails[sk] as SlotDetalhe & { patients: string[] }
        if (ficticio) {
          sd.technicalAg++
        } else {
          di.ag++; sd.ag++; sd.realAg++
          if (pac) sd.patients.push(pac)
        }
      } else {
        // Slot livre: conta apenas uma vez por (prof, dow, sk)
        const dedupKey = `${prof}|${diKey}|${sk}`
        if (seenLivres.has(dedupKey)) continue
        seenLivres.add(dedupKey)

        if (!di.slotDetails[sk]) {
          di.slotDetails[sk] = {
            date, dow, terp, unidade, ini, fim,
            ag: 0, liv: 0, realAg: 0, technicalAg: 0, patients: [],
          }
        }
        di.liv++; di.slotDetails[sk].liv++
      }
    } else {
      if (agendado) {
        const ficticio = isPacienteFicticio(pac)
        const dedupKey = `${prof}|${diKey}|_noslot_|${pac || '_anon'}`
        if (!seenAgendados.has(dedupKey)) {
          seenAgendados.add(dedupKey)
          if (!ficticio) di.ag++
        }
      } else {
        const dedupKey = `${prof}|${diKey}|_noslot_`
        if (!seenLivres.has(dedupKey)) { seenLivres.add(dedupKey); di.liv++ }
      }
    }

    if (!profSlots.terpDays![terp]) profSlots.terpDays![terp] = {}
    ;(profSlots.terpDays![terp] as Record<string, number>)[diKey] = dow
  }

  return allSlots
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
