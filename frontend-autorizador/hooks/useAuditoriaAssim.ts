'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { listarAuditoriaAssim, listarFaltasAuditoria, buscarKpisAuditoriaAssim } from '@/services/auditoria-assim.service'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { AuditoriaAssimItem, AuditoriaFilters, KpisAuditoriaAssim } from '@/components/auditoria-assim/types'

const PAGE_SIZE    = 30
const POLL_MS      = 60_000
const DEBOUNCE_MS  = 800

function getHojeLocal() {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export type SortKey = keyof AuditoriaAssimItem
export type SortDir = 'asc' | 'desc'

export function useAuditoriaAssim() {
  const [dados, setDados] = useState<AuditoriaAssimItem[]>([])
  const [kpis, setKpis] = useState<KpisAuditoriaAssim | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMountedRef = useRef(false)
  const [sortKey, setSortKey] = useState<SortKey>('hora_inicial')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [filters, setFiltersState] = useState<AuditoriaFilters>({
    paciente: '',
    situacao: '',
    data: getHojeLocal(),
    tuss: '',
  })

  const filtersRef = useRef(filters)
  useEffect(() => { filtersRef.current = filters }, [filters])

  function setFilters(next: AuditoriaFilters) {
    setFiltersState(next)
    setPagina(1)
  }

  function setSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPagina(1)
  }

  async function carregarDados(silent = false) {
    if (!silent) setLoading(true)
    const data = filtersRef.current.data || getHojeLocal()
    const [registros, faltas, kpisData] = await Promise.all([
      listarAuditoriaAssim(data),
      listarFaltasAuditoria(data),
      buscarKpisAuditoriaAssim(data),
    ])
    setDados([...registros, ...faltas])
    setKpis(kpisData)
    setLoading(false)
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Recarrega dados completos quando a data muda (evita duplo load no mount)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    if (!filters.data) return
    carregarDados(false)
  }, [filters.data])

  useEffect(() => {
    const supabase = getSupabaseClient()

    function dispatchReload() {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => carregarDados(true), DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('auditoria-assim-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_autorizacoes' }, dispatchReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'autorizacoes_assim' }, dispatchReload)
      .subscribe()

    const poll = setInterval(dispatchReload, POLL_MS)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const filtrados = useMemo(() => {
    const filtered = dados.filter((item) => {
      if (
        filters.paciente &&
        !item.paciente_nome?.toLowerCase().includes(filters.paciente.toLowerCase())
      ) return false

      if (filters.situacao && item.situacao !== filters.situacao) return false

      if (
        filters.tuss &&
        !item.codigo_tuss?.toLowerCase().includes(filters.tuss.toLowerCase())
      ) return false

      return true
    })

    return [...filtered].sort((a, b) => {
      const va = String(a[sortKey] ?? '')
      const vb = String(b[sortKey] ?? '')
      const primary = va.localeCompare(vb, 'pt-BR', { numeric: true })
      if (primary !== 0) return sortDir === 'asc' ? primary : -primary

      // tiebreaker: hora_inicial → paciente_nome
      if (sortKey !== 'hora_inicial') {
        const horaCmp = String(a.hora_inicial ?? '').localeCompare(String(b.hora_inicial ?? ''))
        if (horaCmp !== 0) return horaCmp
      }
      if (sortKey !== 'paciente_nome') {
        return (a.paciente_nome ?? '').localeCompare(b.paciente_nome ?? '', 'pt-BR')
      }
      return 0
    })
  }, [dados, filters.paciente, filters.situacao, filters.tuss, sortKey, sortDir])

  const totalPaginas = useMemo(
    () => Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE)),
    [filtrados.length]
  )

  const paginados = useMemo(() => {
    const inicio = (pagina - 1) * PAGE_SIZE
    return filtrados.slice(inicio, inicio + PAGE_SIZE)
  }, [filtrados, pagina])

  return {
    dados: paginados,
    kpis,
    loading,
    filters,
    setFilters,
    pagina,
    setPagina,
    totalPaginas,
    totalFiltrados: filtrados.length,
    sortKey,
    sortDir,
    setSort,
    carregarDados,
  }
}
