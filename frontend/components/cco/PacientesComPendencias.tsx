'use client'

import { Search, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { PacienteComPendencia } from './types'

interface Props {
  pacientes: PacienteComPendencia[]
  loading?: boolean
  onPacienteClick?: (nomePaciente: string) => void
}

const TIPOS_LABELS_AMIGAVEIS: Record<string, string> = {
  EVOLUCAO_ATRASADA: 'Evolução não registrada',
  SESSAO_SEM_AUTORIZACAO: 'Sem autorização',
  GLOSA: 'Cobrança bloqueada',
  FALTA_TERAPEUTA: 'Sem profissional atribuído',
  FALTA_PACIENTE: 'Paciente não compareceu',
  AUTORIZACAO_PENDENTE: 'Aguardando autorização',
  SUBSTITUICAO: 'Sessão com substituição',
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

function getUrgenciaLabel(diasAtraso: number): { label: string; color: string } {
  if (diasAtraso >= 5) {
    return {
      label: 'Ação Imediata',
      color: 'bg-red-50 border-red-200 text-red-700',
    }
  }
  return {
    label: 'Acompanhamento',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  }
}

function agruparOcorrenciasPorTipo(tipos: string[]): Record<string, number> {
  const agrupado: Record<string, number> = {}
  tipos.forEach(tipo => {
    agrupado[tipo] = (agrupado[tipo] || 0) + 1
  })
  return agrupado
}

function pluralizar(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural
}

export default function PacientesComPendencias({
  pacientes,
  loading,
  onPacienteClick,
}: Props) {
  const [busca, setBusca] = useState('')

  const pacientesFiltrados = pacientes.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Pacientes com Pendências</h3>
            <p className="text-xs text-foreground/60 mt-0.5">Ordenado por número de pendências</p>
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
            <div key={i} className="h-20 bg-border/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : pacientesFiltrados.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-3 -mr-2 pr-2">
          {pacientesFiltrados.map(p => {
            const urgencia = getUrgenciaLabel(p.diasAtrasoMaisAntigo)
            const ocorrenciasPorTipo = agruparOcorrenciasPorTipo(p.tiposPendencia)
            const tiposComContagem = Object.entries(ocorrenciasPorTipo)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])

            const diasTexto = p.diasAtrasoMaisAntigo === 1 ? 'dia' : 'dias'
            const pendenciasTexto = pluralizar(p.ocorrencias, 'pendência', 'pendências')

            return (
              <button
                key={p.id}
                onClick={() => onPacienteClick?.(p.nome)}
                className="w-full text-left border border-border rounded-lg p-4 hover:border-foreground/30 hover:bg-foreground/2 transition-all duration-200 group"
                aria-label={`${p.nome}, ${p.ocorrencias} ${pendenciasTexto} • mais antiga há ${p.diasAtrasoMaisAntigo} ${diasTexto}`}
              >
                {/* Linha 1: Avatar + Nome + Badge de Urgência */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor(p.nome)}`}>
                      {iniciais(p.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:underline">
                        {p.nome}
                      </p>
                      <p className="text-xs text-foreground/50 mt-0.5">
                        {p.ocorrencias} {pendenciasTexto} • mais antiga há {p.diasAtrasoMaisAntigo} {diasTexto}
                      </p>
                    </div>
                  </div>

                  {/* Badge de Urgência */}
                  <div className={`px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 ${urgencia.color}`}>
                    {urgencia.label}
                  </div>
                </div>

                {/* Linha 2: Tipos de Pendência com rótulos amigáveis */}
                {tiposComContagem.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tiposComContagem.map(([tipo, count]) => {
                      const label = TIPOS_LABELS_AMIGAVEIS[tipo] || tipo

                      return (
                        <div
                          key={tipo}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-foreground/5 border border-foreground/10 text-foreground/70"
                        >
                          <span className="text-xs font-medium">{label}</span>
                          {count > 1 && <span className="text-xs font-semibold text-foreground/50">({count})</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
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
