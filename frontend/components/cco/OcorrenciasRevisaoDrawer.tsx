'use client'

import { X } from 'lucide-react'
import { useState } from 'react'
import type { CCOSessaoRevisao } from './types'

interface Props {
  open: boolean
  onClose: () => void
  sessoes: CCOSessaoRevisao[]
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

interface PacienteAgrupado {
  nome: string
  sesses: CCOSessaoRevisao[]
  count: number
}

export default function OcorrenciasRevisaoDrawer({ open, onClose, sessoes }: Props) {
  const [expandedPaciente, setExpandedPaciente] = useState<string | null>(null)

  const pacientesMap = sessoes.reduce((acc, sessao) => {
    if (!acc[sessao.paciente]) {
      acc[sessao.paciente] = []
    }
    acc[sessao.paciente].push(sessao)
    return acc
  }, {} as Record<string, CCOSessaoRevisao[]>)

  const pacientesAgrupados: PacienteAgrupado[] = Object.entries(pacientesMap)
    .map(([nome, sesses]) => ({ nome, sesses, count: sesses.length }))
    .sort((a, b) => b.count - a.count)

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card border-l border-border z-50 shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Ocorrências em Revisão</h2>
            <p className="text-xs text-foreground/40 mt-0.5">{pacientesAgrupados.length} pacientes · {sessoes.length} substituições</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-foreground/[0.05] rounded-lg transition-colors"
          >
            <X size={20} className="text-foreground/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-border">
            {pacientesAgrupados.map(paciente => {
              const isExpanded = expandedPaciente === paciente.nome
              return (
                <div key={paciente.nome}>
                  <button
                    onClick={() => setExpandedPaciente(isExpanded ? null : paciente.nome)}
                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-foreground/[0.02] transition-colors text-left"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(paciente.nome)}`}>
                      {iniciais(paciente.nome)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{paciente.nome}</p>
                      <p className="text-xs text-foreground/40 mt-0.5">
                        {paciente.count} {paciente.count === 1 ? 'substituição' : 'substituições'}
                      </p>
                    </div>

                    <span className="text-foreground/40 text-xs font-medium shrink-0">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="bg-foreground/[0.01] px-6 py-3 space-y-3 border-t border-border">
                      {paciente.sesses.map(sessao => (
                        <div key={sessao.id} className="flex items-center justify-between text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground/60 font-medium">{formatData(sessao.data)}</p>
                            <p className="text-foreground/50 text-[11px] mt-0.5">
                              {sessao.terapeutaOriginal.split(' ')[0]} → {sessao.terapeutaSubstituto.split(' ')[0]}
                            </p>
                          </div>
                          <span className="text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full ml-2 shrink-0">
                            Revisão
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
