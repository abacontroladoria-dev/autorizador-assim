'use client'

import { Search, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { PacienteComPendencia, CCOSessaoDetalhada } from './types'

interface Props {
  pacientes: PacienteComPendencia[]
  sessoes?: CCOSessaoDetalhada[]
  loading?: boolean
  onPacienteClick?: (nomePaciente: string) => void
}

const TIPO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  evolucao_pendente: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  sem_autorizacao: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  glosa: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  falta_terapeuta: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  falta_paciente: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  autorizacao_pendente: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
}

const TIPO_LABELS: Record<string, string> = {
  evolucao_pendente: 'Evolução',
  sem_autorizacao: 'Sem Autorização',
  glosa: 'Glosa',
  falta_terapeuta: 'Falta Terapeuta',
  falta_paciente: 'Falta Paciente',
  autorizacao_pendente: 'Autorização',
}

function iniciais(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()
}

function avatarColor(nome: string): string {
  const colors = [
    'bg-violet-100 text-violet-700',
    'bg-sky-100 text-sky-700',
    'bg-pink-100 text-pink-700',
    'bg-amber-100 text-amber-700',
    'bg-teal-100 text-teal-700',
    'bg-indigo-100 text-indigo-700',
  ]
  let hash = 0
  for (const c of nome) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}

function getCriticidade(ocorrencias: number): { nivel: string; color: string; icon: string } {
  if (ocorrencias >= 15) return { nivel: 'Alto', color: 'text-red-600', icon: '●' }
  if (ocorrencias >= 8) return { nivel: 'Médio', color: 'text-amber-600', icon: '●' }
  return { nivel: 'Baixo', color: 'text-green-600', icon: '●' }
}

function agruparOcorrenciasPorTipo(tipos: string[]): Record<string, number> {
  const agrupado: Record<string, number> = {}
  tipos.forEach(tipo => {
    agrupado[tipo] = (agrupado[tipo] || 0) + 1
  })
  return agrupado
}

export default function PacientesComPendencias({
  pacientes,
  sessoes = [],
  loading,
  onPacienteClick,
}: Props) {
  const [busca, setBusca] = useState('')

  const pacientesFiltrados = pacientes.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase())
  )

  const calcularConciliacao = (nomePaciente: string): number => {
    const pacienteSessoes = sessoes.filter(s => s.paciente === nomePaciente)
    if (pacienteSessoes.length === 0) return 0
    const evoluidas = pacienteSessoes.filter(s => s.evolucaoStatus === 'EVOLUIDA').length
    return Math.round((evoluidas / pacienteSessoes.length) * 100)
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Pacientes com Pendências</h3>
            <p className="text-xs text-foreground/60 mt-0.5">Ordenado por criticidade</p>
          </div>
          <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
            {pacientesFiltrados.length} de {pacientes.length}
          </span>
        </div>

        <div className="relative">
          <label htmlFor="search-pacientes" className="sr-only">
            Buscar pacientes por nome
          </label>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" aria-hidden="true" />
          <input
            id="search-pacientes"
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-3 text-sm bg-foreground/2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-all"
            aria-label="Buscar pacientes por nome"
          />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-border/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : pacientesFiltrados.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-3 -mr-2 pr-2">
          {pacientesFiltrados.map(p => {
            const criticidade = getCriticidade(p.ocorrencias)
            const percentualConciliacao = calcularConciliacao(p.nome)
            const ocorrenciasPorTipo = agruparOcorrenciasPorTipo(p.tiposPendencia)

            return (
              <button
                key={p.id}
                onClick={() => onPacienteClick?.(p.nome)}
                className="w-full text-left border border-border rounded-lg p-4 hover:border-foreground/30 hover:bg-foreground/2 transition-all duration-200 group"
                aria-label={`${p.nome}, ${p.ocorrencias} ocorrência${p.ocorrencias !== 1 ? 's' : ''} bloqueada${p.ocorrencias !== 1 ? 's' : ''}. Clique para ver detalhes`}
              >
                {/* Primeira linha: Avatar + Nome + Criticidade */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor(p.nome)}`}>
                      {iniciais(p.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:underline">
                        {p.nome}
                      </p>
                      <p className="text-xs text-foreground/50 mt-0.5">
                        {p.ocorrencias} ocorrência{p.ocorrencias !== 1 ? 's' : ''} bloqueada{p.ocorrencias !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Badge de Criticidade */}
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${criticidade.color === 'text-red-600' ? 'bg-red-50 border-red-200' : criticidade.color === 'text-amber-600' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'} shrink-0`}>
                    <span className={`text-xs font-semibold ${criticidade.color}`}>
                      {criticidade.icon} {criticidade.nivel}
                    </span>
                  </div>

                  <ChevronRight size={20} className="text-foreground/30 group-hover:text-foreground/60 transition-colors shrink-0" />
                </div>

                {/* Segunda linha: Barra de progresso + % Conciliado */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={14} className="text-foreground/60" />
                      <span className="text-xs font-medium text-foreground/60">Conciliação</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{percentualConciliacao}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${percentualConciliacao}%`,
                        backgroundColor: 'var(--chart-2)',
                      }}
                    />
                  </div>
                </div>

                {/* Terceira linha: Tipos de Pendência Agrupados */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ocorrenciasPorTipo).map(([tipo, count]) => {
                    const colors = TIPO_COLORS[tipo] || TIPO_COLORS.autorizacao_pendente
                    const label = TIPO_LABELS[tipo] || tipo

                    return (
                      <div
                        key={tipo}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${colors.bg} ${colors.text} ${colors.border} border`}
                      >
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-xs font-bold opacity-70">({count})</span>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-foreground/60">
          <AlertTriangle size={32} className="mb-2 opacity-30" />
          <p className="text-sm font-medium">Nenhum paciente encontrado</p>
          <p className="text-xs mt-1">Tente ajustar sua busca</p>
        </div>
      )}
    </div>
  )
}
