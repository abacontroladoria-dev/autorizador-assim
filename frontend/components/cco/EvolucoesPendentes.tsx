'use client'

import { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import type { CCOEvolucaoPendente, EvolucaoPendentePorTerapeuta } from './types'

interface Props {
  evolucoes: CCOEvolucaoPendente[]
  evolucoesPorTerapeuta?: EvolucaoPendentePorTerapeuta[]
  loading?: boolean
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

function getCargaIndicator(quantidade: number, max: number): { nivel: string; color: string } {
  const percentual = (quantidade / max) * 100
  if (percentual >= 70) return { nivel: 'Alta', color: 'text-red-600' }
  if (percentual >= 40) return { nivel: 'Média', color: 'text-amber-600' }
  return { nivel: 'Baixa', color: 'text-green-600' }
}

export default function EvolucoesPendentes({ evolucoes, evolucoesPorTerapeuta = [], loading }: Props) {
  const [expandedTerapeuta, setExpandedTerapeuta] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const evolucoesFiltradas = evolucoes.filter(ev =>
    ev.terapeuta.toLowerCase().includes(busca.toLowerCase())
  )

  const max = evolucoes[0]?.quantidade ?? 1
  const total = evolucoes.reduce((sum, ev) => sum + ev.quantidade, 0)

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Evoluções Pendentes</h3>
            <p className="text-xs text-foreground/60 mt-0.5">Ranking de carga por terapeuta</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-medium text-foreground/60">
            <span>
              Total: <span className="font-bold text-indigo-600">{total}</span>
            </span>
            <span>
              Terapeutas: <span className="font-bold text-foreground">{evolucoesFiltradas.length} de {evolucoes.length}</span>
            </span>
          </div>
        </div>

        <div className="relative">
          <label htmlFor="search-terapeutas" className="sr-only">
            Buscar terapeutas por nome
          </label>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" aria-hidden="true" />
          <input
            id="search-terapeutas"
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 py-3 text-sm bg-foreground/2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/10 transition-all"
            aria-label="Buscar terapeutas por nome"
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
      ) : evolucoesFiltradas.length > 0 ? (
        <div className="flex-1 overflow-y-auto space-y-3 -mr-2 pr-2">
          {evolucoesFiltradas.map((ev, idx) => {
            const pct = max > 0 ? (ev.quantidade / max) * 100 : 0
            const carga = getCargaIndicator(ev.quantidade, max)
            const terapeutaData = evolucoesPorTerapeuta.find(t => t.terapeuta === ev.terapeuta)
            const isExpanded = expandedTerapeuta === ev.terapeuta
            const percentualDoTotal = total > 0 ? ((ev.quantidade / total) * 100).toFixed(0) : '0'

            return (
              <div key={ev.terapeuta}>
                <button
                  onClick={() => setExpandedTerapeuta(isExpanded ? null : ev.terapeuta)}
                  className="w-full text-left border border-border rounded-lg p-4 hover:border-foreground/30 hover:bg-foreground/2 transition-all duration-200 group"
                  aria-expanded={isExpanded}
                  aria-label={`${ev.terapeuta}, ${ev.quantidade} evoluções pendentes. Clique para ${isExpanded ? 'recolher' : 'expandir'} pacientes`}
                >
                  {/* Ranking + Nome + Carga */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor(ev.terapeuta)}`}>
                          {iniciais(ev.terapeuta)}
                        </div>
                        <span className="absolute -top-1 -left-1 w-5 h-5 bg-foreground/20 rounded-full flex items-center justify-center text-xs font-bold text-foreground">
                          {idx + 1}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate group-hover:underline">
                          {ev.terapeuta}
                        </p>
                        <p className="text-xs text-foreground/50 mt-0.5">
                          {terapeutaData?.pacientes.length ?? 0} paciente{(terapeutaData?.pacientes.length ?? 0) !== 1 ? 's' : ''} com pendências
                        </p>
                      </div>
                    </div>

                    {/* Badge de Carga */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${carga.color === 'text-red-600' ? 'bg-red-50 border border-red-200' : carga.color === 'text-amber-600' ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'} shrink-0`}>
                      <span className={`text-xs font-semibold ${carga.color}`}>
                        ● {carga.nivel}
                      </span>
                    </div>

                    <ChevronRight size={20} className={`text-foreground/30 group-hover:text-foreground/60 transition-all shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>

                  {/* Barra de progresso */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground/60">Carga operacional</span>
                      <span className="text-xs font-semibold text-foreground">
                        {ev.quantidade} ({percentualDoTotal}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: 'var(--chart-1)',
                        }}
                      />
                    </div>
                  </div>
                </button>

                {/* Expanded: Lista de Pacientes */}
                {isExpanded && terapeutaData && (
                  <div className="mt-2 border border-border rounded-lg bg-foreground/[0.01] p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground/60 px-1">
                      Pacientes com pendências:
                    </p>
                    {terapeutaData.pacientes.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-foreground/[0.02] transition-colors"
                      >
                        <span className="text-xs text-foreground/70 truncate">{p.nome}</span>
                        <span className="text-xs font-semibold text-indigo-600 ml-2 shrink-0 tabular-nums">
                          {p.quantidade}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-foreground/60">
          <p className="text-sm font-medium">
            {busca ? 'Nenhum terapeuta encontrado' : 'Nenhuma evolução pendente'}
          </p>
          {busca && (
            <p className="text-xs mt-1 text-foreground/40">Tente ajustar sua busca</p>
          )}
        </div>
      )}
    </div>
  )
}
