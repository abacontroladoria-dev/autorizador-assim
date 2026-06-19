'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { listarAtendimentosCCO, type CCOAtendimentoRow } from '@/services/cco.service'
import type {
  CCOData,
  CCOKpis,
  CCOMotivoPendencia,
  CCOSessaoRevisao,
  CCOEvolucaoPendente,
  PacienteComPendencia,
  EvolucaoPendentePorTerapeuta,
  CCOSessaoDetalhada,
  PacientePendencia,
  TerapeutaComPendencias,
} from '@/components/cco/types'

const DEBOUNCE_MS = 400

const OCCURRENCE_META: Record<string, { label: string; color: string }> = {
  AUTORIZACAO_PENDENTE:   { label: 'Autorização Pendente',  color: '#8b5cf6' },
  SESSAO_SEM_AUTORIZACAO: { label: 'Sem Autorização',       color: '#ef4444' },
  EVOLUCAO_ATRASADA:      { label: 'Evolução Atrasada',     color: '#f59e0b' },
  FALTA_TERAPEUTA:        { label: 'Falta Terapeuta',       color: '#3b82f6' },
  SUBSTITUICAO:           { label: 'Substituição',          color: '#06b6d4' },
  FALTA_PACIENTE:         { label: 'Falta Paciente',        color: '#10b981' },
  GLOSA:                  { label: 'Glosa',                 color: '#f43f5e' },
}

function getHojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildCCOData(rows: CCOAtendimentoRow[], hoje: string, dataFim: string): CCOData {
  // Excluir entradas administrativas/placeholder que não são pacientes reais
  rows = rows.filter(row => {
    const nome = (row.paciente_nome ?? '').toLowerCase()
    if (nome.includes('administrativo')) return false
    if (nome.includes('ainda') && nome.includes('selecionado')) return false
    return true
  })

  const totalSessoes = rows.length

  // ─── Sessões categorizadas ───────────────────────────────────────────────
  const sessoesEmRevisao  = rows.filter(r => r.tipos_ocorrencia.includes('SUBSTITUICAO'))
  const sessoesPendentes  = rows.filter(r =>
    r.tipos_ocorrencia.length > 0 && !r.tipos_ocorrencia.includes('SUBSTITUICAO'),
  )
  const sessoesProntas    = rows.filter(r => r.tipos_ocorrencia.length === 0)

  // ─── KPIs por paciente ───────────────────────────────────────────────────
  const pacientesRevisao  = new Set(sessoesEmRevisao.map(r => r.paciente_nome))
  const pacientesPendentes = new Set(sessoesPendentes.map(r => r.paciente_nome))
  // conciliado = não aparece em revisão nem pendente
  const todosPacientes    = new Set(rows.map(r => r.paciente_nome))
  const pacientesConciliados = new Set(
    [...todosPacientes].filter(p => !pacientesRevisao.has(p) && !pacientesPendentes.has(p)),
  )

  const kpis: CCOKpis = {
    total_sessoes:           totalSessoes,
    sessoes_prontas:         sessoesProntas.length,
    sessoes_em_revisao:      sessoesEmRevisao.length,
    sessoes_pendentes:       sessoesPendentes.length,
    total_pacientes:         todosPacientes.size,
    pacientes_conciliados:   pacientesConciliados.size,
    pacientes_em_revisao:    pacientesRevisao.size,
    pacientes_pendentes:     pacientesPendentes.size,
    evolucoes_pendentes:     rows.filter(r => !r.possui_tratativa).length,
    evolucoes_atrasadas:     rows.filter(r => r.data_sessao < hoje && !r.possui_tratativa).length,
    total_pacientes_assim:   todosPacientes.size,
    total_sessoes_assim:     totalSessoes,
  }

  // ─── Motivos de pendências ───────────────────────────────────────────────
  const tipoCount: Record<string, number> = {}
  for (const row of rows) {
    for (const tipo of row.tipos_ocorrencia) {
      tipoCount[tipo] = (tipoCount[tipo] ?? 0) + 1
    }
  }
  const totalOcorrencias = Object.values(tipoCount).reduce((s, n) => s + n, 0)
  const motivosPendencias: CCOMotivoPendencia[] = Object.entries(tipoCount)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, quantidade]) => ({
      motivo:     tipo.toLowerCase(),
      label:      OCCURRENCE_META[tipo]?.label ?? tipo,
      quantidade,
      percentual: totalOcorrencias > 0 ? parseFloat(((quantidade / totalOcorrencias) * 100).toFixed(1)) : 0,
      color:      OCCURRENCE_META[tipo]?.color ?? '#94a3b8',
    }))

  // ─── Sessões em revisão (substituição) ──────────────────────────────────
  const sessoesRevisao: CCOSessaoRevisao[] = sessoesEmRevisao.map(r => ({
    id:                 r.session_key,
    paciente:           r.paciente_nome,
    terapeutaOriginal:  r.profissional ?? '',
    terapeutaSubstituto: r.profissional_substituto ?? '',
    data:               r.data_sessao,
    status:             'EM_REVISAO' as const,
  }))

  // ─── Evoluções pendentes por terapeuta ───────────────────────────────────
  const semTratativa = rows.filter(r => !r.possui_tratativa)

  const evolByTerapeuta: Record<string, number> = {}
  for (const r of semTratativa) {
    const t = r.profissional ?? 'Sem terapeuta'
    evolByTerapeuta[t] = (evolByTerapeuta[t] ?? 0) + 1
  }
  const evolucoesPendentes: CCOEvolucaoPendente[] = Object.entries(evolByTerapeuta)
    .sort((a, b) => b[1] - a[1])
    .map(([terapeuta, quantidade]) => ({ terapeuta, quantidade }))

  // ─── Pacientes com pendências ─────────────────────────────────────────────
  const pendenciaByPaciente: Record<string, { count: number; tipos: Set<string> }> = {}
  for (const row of rows) {
    if (row.tipos_ocorrencia.length === 0) continue
    if (!pendenciaByPaciente[row.paciente_nome]) {
      pendenciaByPaciente[row.paciente_nome] = { count: 0, tipos: new Set() }
    }
    pendenciaByPaciente[row.paciente_nome].count += row.tipos_ocorrencia.length
    row.tipos_ocorrencia.forEach(t => pendenciaByPaciente[row.paciente_nome].tipos.add(t))
  }

  // ─── Evoluções pendentes por terapeuta (nested) ──────────────────────────
  const evolNested: Record<string, Record<string, number>> = {}
  for (const r of semTratativa) {
    const t = r.profissional ?? 'Sem terapeuta'
    const p = r.paciente_nome
    if (!evolNested[t]) evolNested[t] = {}
    evolNested[t][p] = (evolNested[t][p] ?? 0) + 1
  }
  const pacientesEvolucaoPendentePorTerapeuta: EvolucaoPendentePorTerapeuta[] =
    Object.entries(evolNested)
      .sort((a, b) => {
        const totalA = Object.values(a[1]).reduce((s, n) => s + n, 0)
        const totalB = Object.values(b[1]).reduce((s, n) => s + n, 0)
        return totalB - totalA
      })
      .map(([terapeuta, pacMap]) => ({
        terapeuta,
        pacientes: Object.entries(pacMap)
          .sort((a, b) => b[1] - a[1])
          .map(([nome, quantidade]) => ({ id: nome, nome, quantidade })),
      }))

  // ─── Sessões detalhadas por paciente ─────────────────────────────────────
  const sessoesByPaciente: Record<string, CCOSessaoDetalhada[]> = {}
  for (const r of rows) {
    if (!sessoesByPaciente[r.paciente_nome]) sessoesByPaciente[r.paciente_nome] = []

    let evolucaoStatus: CCOSessaoDetalhada['evolucaoStatus']
    if (r.possui_tratativa) {
      evolucaoStatus = 'EVOLUIDA'
    } else if (r.data_sessao < hoje) {
      evolucaoStatus = 'PENDENTE'
    } else {
      evolucaoStatus = 'NENHUMA'
    }

    sessoesByPaciente[r.paciente_nome].push({
      id:              r.session_key,
      paciente:        r.paciente_nome,
      data:            r.data_sessao,
      horario:         r.hora_inicio,
      terapia:         r.terapia ?? '',
      profissional:    r.profissional ?? '',
      evolucaoStatus,
      evolucaoAutor:   r.profissional_tratativa ?? undefined,
      evolucaoDataHora: r.data_tratativa ?? undefined,
      substituicao:    r.profissional_substituto
        ? { original: r.profissional ?? '', substituto: r.profissional_substituto }
        : undefined,
      glosa: r.authorization_status === 'GLOSA' || r.tipos_ocorrencia.includes('GLOSA'),
      tratativas: r.profissional_tratativa ? [r.profissional_tratativa] : [],
    })
  }

  // ─── Pacientes com pendência ordenados por maior atraso ─────────────────────
  // Coleção intermediária reutilizada pelas Sprints 2 e 3 (evita recálculo)
  const [hy, hm, hd] = hoje.split('-').map(Number)
  const hojeMs = new Date(hy, hm - 1, hd).getTime()

  const [dy, dm, dd] = dataFim.split('-').map(Number)
  const dataFimMs = new Date(dy, dm - 1, dd).getTime()

  const atrasoPorPaciente = new Map<string, number>()
  for (const row of rows) {
    if (!row.possui_tratativa && row.data_sessao < dataFim) {
      const [sy, sm, sd] = row.data_sessao.split('-').map(Number)
      const dias = Math.floor((dataFimMs - new Date(sy, sm - 1, sd).getTime()) / 86_400_000)
      if (dias > 0) {
        const atual = atrasoPorPaciente.get(row.paciente_nome) ?? 0
        if (dias > atual) atrasoPorPaciente.set(row.paciente_nome, dias)
      }
    }
  }

  // Completar pacientesComPendencias com diasAtrasoMaisAntigo (reutilizando atrasoPorPaciente calculado acima)
  const pacientesComPendencias: PacienteComPendencia[] = Object.entries(pendenciaByPaciente)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([nome, { count, tipos }]) => ({
      id:                     nome,
      nome,
      ocorrencias:            count,
      tiposPendencia:         [...tipos],
      diasAtrasoMaisAntigo:   atrasoPorPaciente.get(nome) ?? 0,
    }))

  const pacientesPendentesOrdenados: PacientePendencia[] = Array.from(
    atrasoPorPaciente.entries(),
  )
    .map(([pacienteNome, diasAtraso]) => ({ pacienteNome, diasAtraso }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso)

  // Sprint 2 — Ação Imediata: >= 5 dias
  const pacientesAcaoImediata = pacientesPendentesOrdenados.filter(
    (p) => p.diasAtraso >= 5,
  )

  // Sprint 3 — Acompanhamento: 1 a 4 dias
  const pacientesAcompanhamento = pacientesPendentesOrdenados.filter(
    (p) => p.diasAtraso >= 1 && p.diasAtraso <= 4,
  )

  // ─── Sprint 5 — Top 10 Terapeutas com Mais Pendências ──────────────────────
  const atrasoPorTerapeuta: Record<string, number> = {}
  const ultimaEvolucaoPorTerapeuta: Record<string, number | null> = {}

  for (const row of rows) {
    const t = row.profissional ?? 'Sem terapeuta'
    if (!row.possui_tratativa && row.data_sessao < dataFim) {
      atrasoPorTerapeuta[t] = (atrasoPorTerapeuta[t] ?? 0) + 1
    }
  }

  for (const row of rows) {
    if (!row.possui_tratativa || !row.profissional_tratativa || !row.data_tratativa) continue
    const t = row.profissional_tratativa
    const [sy, sm, sd] = row.data_tratativa.split('-').map(Number)
    const dias = Math.floor((dataFimMs - new Date(sy, sm - 1, sd).getTime()) / 86_400_000)
    const atual = ultimaEvolucaoPorTerapeuta[t]
    if (atual == null || dias < atual) {
      ultimaEvolucaoPorTerapeuta[t] = dias
    }
  }

  const topTerapeutas: TerapeutaComPendencias[] = Object.entries(atrasoPorTerapeuta)
    .map(([terapeuta, evolucoes_atrasadas]) => ({
      terapeuta,
      evolucoes_atrasadas,
      ultima_evolucao: ultimaEvolucaoPorTerapeuta[terapeuta] ?? null,
    }))
    .sort((a, b) => {
      if (b.evolucoes_atrasadas !== a.evolucoes_atrasadas) {
        return b.evolucoes_atrasadas - a.evolucoes_atrasadas
      }
      const ultimaA = a.ultima_evolucao ?? Infinity
      const ultimaB = b.ultima_evolucao ?? Infinity
      if (ultimaB !== ultimaA) {
        return ultimaB - ultimaA
      }
      return a.terapeuta.localeCompare(b.terapeuta, 'pt-BR')
    })
    .slice(0, 10)

  return {
    kpis,
    motivosPendencias,
    sessoesRevisao,
    evolucoesPendentes,
    pacientesComPendencias,
    pacientesEvolucaoPendentePorTerapeuta,
    pacientesSessoes: sessoesByPaciente,
    pacientesAcaoImediata,
    pacientesAcompanhamento,
    topTerapeutasComPendencias: topTerapeutas,
  }
}

export function useCCO(dataInicio: string, dataFim: string) {
  const [rawRows, setRawRows] = useState<CCOAtendimentoRow[]>([])
  const [loading, setLoading] = useState(true)
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingRef      = useRef(false)
  const hasMountedRef   = useRef(false)

  async function carregarDados(silent = false) {
    if (loadingRef.current) return
    loadingRef.current = true
    if (!silent) setLoading(true)
    try {
      const rows = await listarAtendimentosCCO(dataInicio, dataFim)
      setRawRows(rows)
    } catch (err) {
      console.error('[CCO] Erro inesperado:', err)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }

  // Carga inicial
  useEffect(() => {
    carregarDados()
  }, [])

  // Recarrega ao mudar período (debounce 400ms)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregarDados(false), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [dataInicio, dataFim])

  const hoje = getHojeLocal()

  const dados = useMemo<CCOData | null>(() => {
    if (rawRows.length === 0) return null
    return buildCCOData(rawRows, hoje, dataFim)
  }, [rawRows, hoje, dataFim])

  return { dados, loading, carregarDados }
}
