'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { loadAceites } from '@/lib/cronograma/reposicaoStorage'
import type { CategoriaReposicao, PacienteSemana } from '@/types/reposicao'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fimSemana(inicio: string): string {
  const d = new Date(`${inicio}T12:00:00`)
  d.setDate(d.getDate() + 4)
  return d.toISOString().slice(0, 10)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVisaoGeralFaltas(semanaInicio: string) {
  const [pacientes, setPacientes] = useState<PacienteSemana[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const semanaFim = useMemo(() => fimSemana(semanaInicio), [semanaInicio])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function carregar() {
      const sb = getSupabaseClient()

      // Q1: todas as faltas elegíveis da semana (sem filtro de paciente)
      const { data: faltasRaw, error: e1 } = await sb
        .from('fila_autorizacoes')
        .select('id, paciente_id, paciente_nome, tita_agendamento_id, data_atendimento')
        .eq('status', 'falta')
        .is('cancelado_em', null)
        .is('falta_revertida_em', null)
        .gte('data_atendimento', semanaInicio)
        .lte('data_atendimento', semanaFim)

      if (e1 || cancelled) {
        if (!cancelled) setError(e1?.message ?? 'Erro ao carregar faltas')
        if (!cancelled) setLoading(false)
        return
      }

      const faltas = faltasRaw ?? []

      // Q_CT: controle_terapeutico para filtrar só faltas com CT indisponível
      const titaIds = faltas.map((r: any) => r.tita_agendamento_id).filter(Boolean)

      let ctSet = new Set<string>()

      if (titaIds.length > 0) {
        const { data: ctData, error: ctError } = await sb
          .from('controle_terapeutico')
          .select('tita_agendamento_id')
          .in('tita_agendamento_id', titaIds)
          .eq('status', 'indisponivel')

        if (ctError || cancelled) {
          if (!cancelled) setError(ctError?.message ?? 'Erro ao carregar controle terapêutico')
          if (!cancelled) setLoading(false)
          return
        }

        ctSet = new Set((ctData ?? []).map((ct: any) => String(ct.tita_agendamento_id)))
      }

      if (cancelled) return

      // Filtra faltas elegíveis: sem tita_id (sem dados) ou CT indisponível
      const faltasElegiveis = faltas.filter(
        (r: any) => !r.tita_agendamento_id || ctSet.has(String(r.tita_agendamento_id))
      )

      // Carrega aceites do localStorage
      const aceites = loadAceites()

      // Agrupa por paciente e categoriza
      const porPaciente = new Map<string, { nome: string; total: number; resolvidas: number; irrecuperaveis: number }>()

      for (const f of faltasElegiveis) {
        const pid = String(f.paciente_id)
        if (!porPaciente.has(pid)) {
          porPaciente.set(pid, { nome: f.paciente_nome ?? '', total: 0, resolvidas: 0, irrecuperaveis: 0 })
        }
        const entry = porPaciente.get(pid)!
        entry.total++
        // Irrecuperável: falta na sexta (semanaFim) — sem dias restantes na semana
        if (f.data_atendimento === semanaFim) entry.irrecuperaveis++
        const aceite = aceites[f.id]
        if (aceite?.status === 'aceito' || aceite?.status === 'recusado') {
          entry.resolvidas++
        }
      }

      // Pacientes sem nenhuma falta elegível na semana → todos_comparecidos
      // Para isso precisamos da lista de todos os pacientes com sessões na semana.
      // Limitamos aqui a quem tem falta: pacientes sem falta não aparecem na visão.
      // (Os "todos comparecidos" seriam pacientes do csv_grades_profissionais sem faltas —
      //  isso requer uma query extra e é opt-in futuro.)

      const resultado: PacienteSemana[] = []

      for (const [pacienteId, { nome, total, resolvidas, irrecuperaveis }] of porPaciente) {
        let categoria: CategoriaReposicao

        if (total === 0) {
          categoria = 'todos_comparecidos'
        } else if (resolvidas === 0) {
          categoria = 'sem_reposicao'
        } else if (resolvidas < total) {
          categoria = 'reposicao_parcial'
        } else {
          categoria = 'reposicao_completa'
        }

        resultado.push({ pacienteId, pacienteNome: nome, categoria, totalFaltas: total, totalResolvidas: resolvidas, totalIrrecuperaveis: irrecuperaveis })
      }

      // Ordena: sem_reposicao primeiro, parcial, completo
      const ORDER: CategoriaReposicao[] = ['sem_reposicao', 'reposicao_parcial', 'reposicao_completa', 'todos_comparecidos']
      resultado.sort((a, b) => ORDER.indexOf(a.categoria) - ORDER.indexOf(b.categoria))

      if (!cancelled) {
        setPacientes(resultado)
        setLoading(false)
      }
    }

    carregar().catch(err => {
      if (!cancelled) {
        setError(err?.message ?? 'Erro inesperado')
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [semanaInicio])

  return { pacientes, loading, error }
}
