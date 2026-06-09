'use client'

import { ArrowRight } from 'lucide-react'
import type { CCOSessaoRevisao } from './types'

interface Props {
  sessoes: CCOSessaoRevisao[]
  loading?: boolean
  onViewDetails?: () => void
}

function iniciais(nome: string): string {
  return nome
    .split(' ')
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()
}

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
]

function avatarColor(nome: string): string {
  let hash = 0
  for (const c of nome) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function OcorrenciasRevisao({ sessoes, loading, onViewDetails }: Props) {
  const lista = sessoes.slice(0, 20)

  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Ocorrências em Revisão</h3>
          <span className="text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
            {sessoes.length} substituições
          </span>
        </div>
        <p className="text-xs text-foreground/40 mt-0.5">Sessões realizadas por profissional substituto</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-border/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto max-h-96 -mr-2 pr-2">
          {lista.map(s => (
            <div
              key={s.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-foreground/2 transition-colors"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(s.paciente)}`}>
                {iniciais(s.paciente)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{s.paciente}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[11px] text-foreground/40 truncate max-w-[90px]">{s.terapeutaOriginal.split(' ')[0]}</span>
                  <ArrowRight size={10} className="text-foreground/25 shrink-0" />
                  <span className="text-[11px] text-foreground/70 font-medium truncate max-w-[90px]">{s.terapeutaSubstituto.split(' ')[0]}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="text-xs text-foreground/40">{formatData(s.data)}</span>
                <div className="mt-0.5">
                  <span className="text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full">
                    Em revisão
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
