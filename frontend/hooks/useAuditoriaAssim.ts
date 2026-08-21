'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { listarAuditoriaAssim, listarFaltasAuditoria, buscarNotasEConferencias } from '@/services/auditoria-assim.service'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { AuditoriaAssimItem, AuditoriaFilters, KpisAuditoriaAssim } from '@/components/auditoria-assim/types'
import { situacaoNoRecorte } from '@/components/auditoria-assim/situacoes'

const PAGE_SIZE       = 30
const DEBOUNCE_MS     = 800
const DATE_DEBOUNCE_MS = 400

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
  const [rawDados, setRawDados] = useState<AuditoriaAssimItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMountedRef = useRef(false)
  const loadingRef = useRef(false)
  const [sortKey, setSortKey] = useState<SortKey>('hora_inicial')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [filters, setFiltersState] = useState<AuditoriaFilters>({
    paciente: '',
    situacao: '',
    data: getHojeLocal(),
    horario_bloco: '',
  })

  const filtersRef = useRef(filters)
  useEffect(() => { filtersRef.current = filters }, [filters])

  function setFilters(next: AuditoriaFilters) {
    setFiltersState((prev) => {
      // Trocar de data zera o recorte por KPI. O número que levou a pessoa a
      // clicar em "Glosas" era do dia anterior; carregar esse filtro para o dia
      // seguinte costuma devolver tela vazia, que se lê como bug e não como
      // filtro ativo. Os demais filtros (paciente, bloco) sobrevivem — só o
      // recorte por situação nasce da contagem daquele dia específico.
      //
      // Fica aqui, e não no seletor de data, porque este é o funil único: todo
      // controle da tela chama setFilters, então nenhum caminho novo escapa.
      if (next.data !== prev.data) return { ...next, situacao: '' }
      return next
    })
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
    if (loadingRef.current) return

    loadingRef.current = true
    if (!silent) setLoading(true)
    try {
      const data = filtersRef.current.data || getHojeLocal()
      const [registros, faltas] = await Promise.all([
        listarAuditoriaAssim(data),
        listarFaltasAuditoria(data),
      ])

      const seenBlocos = new Set<string | null>()
      const deduplicated: AuditoriaAssimItem[] = []

      for (const item of [...registros, ...faltas]) {
        if (!seenBlocos.has(item.bloco_id)) {
          seenBlocos.add(item.bloco_id)
          deduplicated.push(item)
        }
      }

      const blocoIds = deduplicated.map((item) => item.bloco_id).filter((id): id is string => !!id)
      const { notas, conferencias } = await buscarNotasEConferencias(blocoIds)

      const enriquecido = deduplicated.map((item) => {
        const nota = item.bloco_id ? notas.get(item.bloco_id) : undefined
        const conferencia = item.bloco_id ? conferencias.get(item.bloco_id) : undefined
        return {
          ...item,
          observacao_manual: nota?.texto ?? null,
          observacao_manual_atualizado_em: nota?.atualizado_em ?? null,
          observacao_manual_atualizado_por_nome: nota?.atualizado_por_nome ?? null,
          token_conferido: conferencia?.conferido ?? false,
          token_conferido_em: conferencia?.conferido_em ?? null,
          token_conferido_por_nome: conferencia?.conferido_por_nome ?? null,
        }
      })

      setRawDados(enriquecido)
    } catch (error) {
      console.error('Erro ao carregar dados de auditoria:', error)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }

  // KPIs derivados client-side — elimina o 3º round-trip ao banco.
  // De propósito, NÃO filtra por `filters.situacao`: esse filtro é o próprio
  // clique num KPI, e só deve recortar a tabela (`filtrados`/`totalFiltrados`).
  // Se entrasse aqui, selecionar um card colapsava todos os outros (e o Total
  // de Sessões, que é a soma deles) para a contagem só daquela situação — o
  // Total deixaria de ser âncora e passaria a mudar com o KPI selecionado.
  const kpis = useMemo((): KpisAuditoriaAssim | null => {
    if (loading) return null

    const dataFiltrada = rawDados.filter((item) => {
      if (
        filters.paciente &&
        !item.paciente_nome?.toLowerCase().includes(filters.paciente.toLowerCase())
      ) return false

      if (filters.horario_bloco && item.hora_inicial) {
        const [inicio, fim] = filters.horario_bloco.split('-')
        if (item.hora_inicial < inicio || item.hora_inicial >= fim) return false
      }

      return true
    })

    const registros = dataFiltrada.filter((d) => d.situacao !== 'FALTA' && d.situacao !== 'FALTA_TERAPEUTA')
    const faltas = dataFiltrada.filter((d) => d.situacao === 'FALTA')
    const faltasTerapeuta = dataFiltrada.filter((d) => d.situacao === 'FALTA_TERAPEUTA')
    const comToken = registros.filter((d) => d.teve_token === true).length
    return {
      total: registros.length,
      faltas: faltas.length,
      faltas_terapeuta: faltasTerapeuta.length,
      liberadas: registros.filter((d) => d.situacao === 'LIBERADA').length - comToken,
      // O card conta o grupo: a sessão cuja solicitação quebrou no meio
      // (SOLICITACAO_CANCELADA) não tem autorização nem resposta da ASSIM, e o
      // que falta nela é o mesmo que falta na que nunca foi solicitada. Contar
      // separado criaria um décimo card para dizer duas vezes "solicite isso".
      nao_solicitadas: registros.filter((d) => situacaoNoRecorte(d.situacao, 'NAO_SOLICITADA')).length,
      sincronizando: registros.filter((d) => d.situacao === 'SINCRONIZANDO').length,
      retorno_nao_confirmado: registros.filter((d) => d.situacao === 'RETORNO_NAO_CONFIRMADO' || d.situacao === 'AGUARDANDO_RETORNO').length,
      canceladas: registros.filter((d) => d.situacao === 'CANCELADA').length,
      // Comparação exata: GLOSA_RESOLVIDA não entra. Este card é o trabalho a
      // fazer, e uma glosa já coberta por vínculo não pede tratativa.
      glosas: registros.filter((d) => d.situacao === 'GLOSA').length,
      glosas_resolvidas: registros.filter((d) => d.situacao === 'GLOSA_RESOLVIDA').length,
      tokens: comToken,
    }
  }, [rawDados, loading, filters.paciente, filters.horario_bloco])

  useEffect(() => {
    carregarDados()
  }, [])

  // Debounce na troca de data — evita múltiplos fetches ao digitar a data manualmente
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    if (!filters.data) return
    if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current)
    dateDebounceRef.current = setTimeout(() => carregarDados(false), DATE_DEBOUNCE_MS)
    return () => {
      if (dateDebounceRef.current) clearTimeout(dateDebounceRef.current)
    }
  }, [filters.data])

  useEffect(() => {
    const supabase = getSupabaseClient()
    let isSubscribed = true

    function dispatchReload() {
      if (!isSubscribed) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => carregarDados(true), DEBOUNCE_MS)
    }

    const channel = supabase
      .channel('auditoria-assim-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_autorizacoes' }, dispatchReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'autorizacoes_assim' }, dispatchReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auditoria_atendimento_notas' }, dispatchReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auditoria_token_conferencias' }, dispatchReload)
      .subscribe()

    return () => {
      isSubscribed = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [])

  const filtrados = useMemo(() => {
    const filtered = rawDados.filter((item) => {
      if (
        filters.paciente &&
        !item.paciente_nome?.toLowerCase().includes(filters.paciente.toLowerCase())
      ) return false

      if (filters.situacao) {
        if (filters.situacao === 'TOKENS') {
          if (!item.teve_token) return false
        } else {
          // Mesma regra da contagem do KPI, de propósito: clicar num card tem
          // que devolver exatamente as linhas que ele somou.
          if (!situacaoNoRecorte(item.situacao, filters.situacao)) return false
        }
      }

      if (filters.horario_bloco && item.hora_inicial) {
        const [inicio, fim] = filters.horario_bloco.split('-')
        if (item.hora_inicial < inicio || item.hora_inicial >= fim) return false
      }

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
  }, [rawDados, filters.paciente, filters.situacao, filters.horario_bloco, sortKey, sortDir])

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
