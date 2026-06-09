'use client'

import { X } from 'lucide-react'
import type { PacienteComPendencia } from './types'

interface Props {
  open: boolean
  onClose: () => void
  pacientes: PacienteComPendencia[]
  onPacienteClick?: (nomePaciente: string) => void
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
    'bg-rose-100 text-rose-700',
    'bg-amber-100 text-amber-700',
    'bg-teal-100 text-teal-700',
    'bg-indigo-100 text-indigo-700',
  ]
  let hash = 0
  for (const c of nome) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  evolucao_pendente: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  sem_autorizacao: { bg: 'bg-red-100', text: 'text-red-700' },
  glosa: { bg: 'bg-orange-100', text: 'text-orange-700' },
  falta_terapeuta: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  falta_paciente: { bg: 'bg-purple-100', text: 'text-purple-700' },
  autorizacao_pendente: { bg: 'bg-slate-100', text: 'text-slate-700' },
}

const TIPO_LABELS: Record<string, string> = {
  evolucao_pendente: 'Evolução',
  sem_autorizacao: 'Sem Auth',
  glosa: 'Glosa',
  falta_terapeuta: 'Falta T',
  falta_paciente: 'Falta P',
  autorizacao_pendente: 'Autorização',
}

export default function PacientesPendenciasModal({ open, onClose, pacientes, onPacienteClick }: Props) {
  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-foreground">Pacientes com Pendências</h2>
              <p className="text-xs text-foreground/40 mt-0.5">{pacientes.length} pacientes bloqueados</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <X size={20} className="text-foreground/60" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="divide-y divide-border">
              {pacientes.map(paciente => (
                <button
                  key={paciente.id}
                  onClick={() => onPacienteClick?.(paciente.nome)}
                  className="w-full text-left px-6 py-4 hover:bg-foreground/[0.02] transition-colors"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(paciente.nome)}`}>
                      {iniciais(paciente.nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{paciente.nome}</p>
                      <p className="text-xs text-foreground/40 mt-0.5">
                        {paciente.ocorrencias} {paciente.ocorrencias === 1 ? 'ocorrência' : 'ocorrências'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {paciente.tiposPendencia.map(tipo => {
                      const colors = TIPO_COLORS[tipo] || TIPO_COLORS.autorizacao_pendente
                      const label = TIPO_LABELS[tipo] || tipo
                      return (
                        <span
                          key={tipo}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${colors.bg} ${colors.text}`}
                        >
                          {label}
                        </span>
                      )
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
