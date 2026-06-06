'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { buscarAgenda, buscarGradeSlots, buscarOpcoesFiltro } from '@/services/agenda.service'
import type {
  AgendaEvent,
  AgendaFilterOptions,
  AgendaFilters,
  AgendaKpis,
  AgendaMode,
} from '@/types/agenda'

const DEFAULT_FILTERS: AgendaFilters = {
  unidade:   '',
  terapeuta: '',
  terapia:   '',
  sala:      '',
}

function toLocalDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getWeekRange(date: Date): { inicio: string; fim: string } {
  const d = new Date(date)
  const day = d.getDay()                  // 0=dom, horário local
  const diff = day === 0 ? -6 : 1 - day  // ancora em segunda-feira
  d.setDate(d.getDate() + diff)
  const inicio = toLocalDateStr(d)
  d.setDate(d.getDate() + 6)
  const fim = toLocalDateStr(d)
  return { inicio, fim }
}

function calcularKpis(events: AgendaEvent[], now: Date): AgendaKpis {
  const agendados = events.filter(
    (e) => e.extendedProps.status !== 'livre' && e.extendedProps.status !== 'bloqueado',
  )

  // 5 dias úteis × 13 slots de 40min (08:00–12:00 = 6 slots + 13:00–17:40 = 7 slots)
  const totalSlots = 5 * 13
  const ocupacaoPercent = Math.min(100, Math.round((agendados.length / totalSlots) * 100))
  const livresCount = Math.max(0, totalSlots - agendados.length)
  const totalMin = livresCount * 40
  const horas = Math.floor(totalMin / 60)
  const minutos = totalMin % 60
  const horasLivresTotal = `${horas}h${minutos > 0 ? ` ${minutos}m` : ''}`

  const nowISO = now.toISOString().slice(0, 16).replace('T', 'T')
  const proximos = agendados
    .filter((e) => e.start > nowISO)
    .sort((a, b) => a.start.localeCompare(b.start))

  const proximo = proximos[0]
  const proximoAtendimento = proximo
    ? {
        hora:     proximo.start.split('T')[1]?.slice(0, 5) ?? '',
        paciente: proximo.extendedProps.paciente,
      }
    : null

  return { ocupacaoPercent, horasLivresTotal, totalAtendimentos: agendados.length, proximoAtendimento }
}

function collapseOverlaps(events: AgendaEvent[]): AgendaEvent[] {
  const groups = new Map<string, AgendaEvent[]>()
  for (const e of events) {
    const existing = groups.get(e.start)
    if (existing) existing.push(e)
    else groups.set(e.start, [e])
  }
  const result: AgendaEvent[] = []
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue }
    const overlapEvents = group.map((e) => ({
      paciente:    e.extendedProps.paciente,
      terapeuta:   e.extendedProps.terapeuta,
      terapia:     e.extendedProps.terapia,
      sala:        e.extendedProps.sala    ?? '',
      unidade:     e.extendedProps.unidade ?? '',
      borderColor: e.borderColor,
    }))
    result.push({
      ...group[0],
      extendedProps: { ...group[0].extendedProps, overlapCount: group.length, overlapEvents },
    })
  }
  return result
}

export function useAgenda(mode: AgendaMode, options?: { autoLoad?: boolean }) {
  const autoLoad = options?.autoLoad ?? true
  const [currentDate, setCurrentDate]   = useState<Date>(() => new Date())
  const [events, setEvents]             = useState<AgendaEvent[]>([])
  const [filters, setFilters]           = useState<AgendaFilters>(DEFAULT_FILTERS)
  const [searchQuery, setSearchQuery]   = useState('')
  const [loading, setLoading]           = useState(false)
  const [hasSearched, setHasSearched]   = useState(autoLoad)
  const [opcoes, setOpcoes]             = useState<AgendaFilterOptions>({
    unidades: [], terapeutas: [], terapias: [], salas: [], pacientes: [],
  })

  const weekRange = useMemo(() => getWeekRange(currentDate), [currentDate])

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const fetchGrade =
        mode === 'terapeutas' && filters.terapeuta
          ? buscarGradeSlots(filters.terapeuta, weekRange.inicio, weekRange.fim)
          : Promise.resolve([])

      const [data, gradeData] = await Promise.all([
        buscarAgenda(mode, weekRange.inicio, weekRange.fim, filters),
        fetchGrade,
      ])
      const realSlotStarts = new Set(data.map(e => e.start))
      const uniqueGrade = gradeData.filter(e => !realSlotStarts.has(e.start))
      setEvents(collapseOverlaps([...data, ...uniqueGrade]))
    } finally {
      setLoading(false)
    }
  }, [mode, weekRange.inicio, weekRange.fim, filters])

  useEffect(() => { buscarOpcoesFiltro().then(setOpcoes) }, [])
  useEffect(() => {
    if (!hasSearched) return
    carregarDados()
  }, [carregarDados, hasSearched])

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events
    const q = searchQuery.toLowerCase()
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.extendedProps.terapeuta.toLowerCase().includes(q) ||
        e.extendedProps.paciente.toLowerCase().includes(q) ||
        e.extendedProps.terapia.toLowerCase().includes(q),
    )
  }, [events, searchQuery])

  const kpis = useMemo(
    () => calcularKpis(filteredEvents, new Date()),
    [filteredEvents],
  )

  const navegarSemana = useCallback((direcao: 1 | -1) => {
    setCurrentDate((d) => {
      const novo = new Date(d)
      novo.setDate(novo.getDate() + direcao * 7)
      return novo
    })
  }, [])

  const irParaHoje = useCallback(() => setCurrentDate(new Date()), [])

  const buscar = useCallback((query: string) => {
    setLoading(true)
    setFilters((prev) => {
      if (mode === 'terapeutas') return { ...prev, terapeuta: query }
      if (mode === 'salas')      return { ...prev, sala: query }
      return { ...prev, paciente: query }
    })
    setHasSearched(true)
  }, [mode])

  return {
    currentDate,
    weekRange,
    events: filteredEvents,
    filters,
    setFilters,
    loading,
    kpis,
    searchQuery,
    setSearchQuery,
    opcoes,
    navegarSemana,
    irParaHoje,
    recarregar: carregarDados,
    hasSearched,
    buscar,
  }
}
