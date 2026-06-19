'use client'

import { UserX } from 'lucide-react'
import type { TerapeutaComPendencias } from './types'

interface Props {
  terapeutas: TerapeutaComPendencias[]
  loading?: boolean
}

function formatarUltimaEvolucao(dias: number | null): string {
  if (dias === null) return 'Sem registro'
  if (dias === 0) return 'Hoje'
  return `${dias} dia${dias !== 1 ? 's' : ''}`
}

export default function TopTerapeutasPendencias({ terapeutas, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-5 shrink-0">
          <UserX className="w-5 h-5 text-amber-500" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Top 10 Terapeutas com Mais Pendências</h2>
        </div>
        <div className="flex-1 overflow-auto">
          {/* Desktop skeleton */}
          <div className="hidden lg:block space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 bg-border/40 rounded animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
          {/* Mobile skeleton */}
          <div className="lg:hidden space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 bg-border/40 rounded animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (terapeutas.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-5 shrink-0">
          <UserX className="w-5 h-5 text-amber-500" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Top 10 Terapeutas com Mais Pendências</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <UserX className="w-12 h-12 text-foreground/20 mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground/70">Nenhum terapeuta com pendências</p>
          <p className="text-xs text-foreground/50 mt-1">Todos os terapeutas estão em dia com evoluções</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <UserX className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
        <h2 className="text-base font-semibold text-foreground">Top 10 Terapeutas com Mais Pendências</h2>
      </div>

      {/* Desktop: Table view */}
      <div className="hidden lg:flex flex-1 overflow-hidden -mx-6">
        <div className="px-6 overflow-y-auto w-full">
          <table className="w-full text-sm table-layout-fixed">
            <colgroup>
              <col style={{ width: '6%' }} />
              <col style={{ width: '52%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '21%' }} />
            </colgroup>
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="text-center py-3 px-2 font-semibold text-foreground/60 text-xs">#</th>
                <th className="text-left py-3 px-3 font-semibold text-foreground/60 text-xs">Terapeuta</th>
                <th className="text-center py-3 px-2 font-semibold text-foreground/60 text-xs">Evoluções Atrasadas</th>
                <th className="text-center py-3 px-2 font-semibold text-foreground/60 text-xs">Última Evolução</th>
              </tr>
            </thead>
            <tbody>
              {terapeutas.map((t, idx) => (
                <tr
                  key={t.terapeuta}
                  className="border-b border-border hover:bg-foreground/2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  tabIndex={0}
                >
                  <td className="py-3 px-2 text-foreground/70 font-medium text-center text-sm">{idx + 1}</td>
                  <td className="py-3 px-3 text-foreground font-medium truncate text-sm">{t.terapeuta}</td>
                  <td className="py-3 px-2 text-center">
                    <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-semibold text-xs">
                      {t.evolucoes_atrasadas}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center text-foreground/80 text-xs">{formatarUltimaEvolucao(t.ultima_evolucao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tablet: Compact table */}
      <div className="hidden md:flex lg:hidden flex-1 overflow-hidden -mx-6">
        <div className="px-3 overflow-y-auto w-full">
          <table className="w-full text-xs table-layout-fixed">
            <colgroup>
              <col style={{ width: '60%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="text-left py-3 px-3 font-semibold text-foreground/60">Terapeuta</th>
                <th className="text-center py-3 px-3 font-semibold text-foreground/60">Atrasadas</th>
                <th className="text-center py-3 px-3 font-semibold text-foreground/60">Última</th>
              </tr>
            </thead>
            <tbody>
              {terapeutas.map((t, idx) => (
                <tr
                  key={t.terapeuta}
                  className="border-b border-border hover:bg-foreground/2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  tabIndex={0}
                >
                  <td className="py-3 px-3 text-foreground font-medium truncate">
                    <span className="inline-flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200 w-5 h-5 rounded font-semibold text-xs mr-2 shrink-0 text-center">
                      {idx + 1}
                    </span>
                    <span className="truncate">{t.terapeuta}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-semibold text-xs">
                      {t.evolucoes_atrasadas}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center text-xs text-foreground/80">{formatarUltimaEvolucao(t.ultima_evolucao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: Card layout */}
      <div className="md:hidden flex-1 overflow-hidden -mx-6 px-6">
        <div className="space-y-3 py-3 overflow-y-auto h-full">
          {terapeutas.map((t, idx) => (
          <div
            key={t.terapeuta}
            className="border border-border rounded-lg p-4 hover:bg-foreground/2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            tabIndex={0}
            role="button"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-semibold text-sm truncate">{t.terapeuta}</p>
              </div>
              <span className="inline-flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-200 w-7 h-7 rounded-full font-semibold text-xs shrink-0">
                {idx + 1}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/60">Evoluções atrasadas</span>
                <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-semibold text-xs">
                  {t.evolucoes_atrasadas}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/60">Última evolução</span>
                <span className="text-foreground font-medium">{formatarUltimaEvolucao(t.ultima_evolucao)}</span>
              </div>
            </div>
          </div>
          ))}
        </div>
      </div>
    </div>
  )
}
