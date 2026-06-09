'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CCOSessaoDetalhada, Competencia, ResumoSessoesPaciente } from './types'
import PacientePendenciasCard from './PacientePendenciasCard'
import PacienteSessoesTabela from './PacienteSessoesTabela'
import PacienteResumoOperacional from './PacienteResumoOperacional'

type AbaAtiva = 'pendencias' | 'sessoes' | 'resumo'

interface Props {
  open: boolean
  onClose: () => void
  pacienteNome: string
  competencia: Competencia
  sessoes: CCOSessaoDetalhada[]
}

export default function PacienteDetalhesModal({
  open,
  onClose,
  pacienteNome,
  competencia,
  sessoes,
}: Props) {
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('pendencias')

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const pacienteSessoes = sessoes.filter(s => s.paciente === pacienteNome).sort((a, b) => {
    return new Date(a.data).getTime() - new Date(b.data).getTime()
  })

  const resumo: ResumoSessoesPaciente = {
    total: pacienteSessoes.length,
    evoluidas: pacienteSessoes.filter(s => s.evolucaoStatus === 'EVOLUIDA').length,
    pendentes: pacienteSessoes.filter(s => s.evolucaoStatus === 'PENDENTE').length,
    substituicoes: pacienteSessoes.filter(s => s.substituicao).length,
    glosas: pacienteSessoes.filter(s => s.glosa).length,
  }

  // Pendências: sessões que não estão conciliadas
  const pendencias = pacienteSessoes.filter(s =>
    s.evolucaoStatus === 'PENDENTE' || s.substituicao || s.glosa
  )

  // Determinar status geral
  const statusGeral = resumo.pendentes > 0 || resumo.substituicoes > 0 || resumo.glosas > 0
    ? 'PENDENTE'
    : 'CONCILIADO'
  const statusColor = statusGeral === 'PENDENTE'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-green-50 text-green-700 border-green-200'

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-[min(95vw,1600px)] max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="border-b border-border px-8 py-6 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-foreground">{pacienteNome}</h2>
                <div className="flex items-center gap-3 mt-3">
                  <p className="text-sm text-foreground/70">
                    Competência: <span className="font-semibold">{String(competencia.mes).padStart(2, '0')}/{competencia.ano}</span>
                  </p>
                  <span className={`inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-full border uppercase tracking-wide ${statusColor}`}>
                    {statusGeral}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-foreground/5 rounded-lg transition-colors"
              >
                <X size={24} className="text-foreground/60" />
              </button>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="px-8 py-6 border-b border-border bg-foreground/2 shrink-0">
            <div className="grid grid-cols-5 gap-6">
              <button
                onClick={() => setAbaAtiva('sessoes')}
                className="text-center p-4 rounded-xl hover:bg-white/50 transition-colors cursor-pointer group"
              >
                <p className="text-3xl font-bold text-foreground group-hover:text-foreground/90 mb-1">{resumo.total}</p>
                <p className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 uppercase tracking-tight">Sessões</p>
              </button>
              <button
                onClick={() => setAbaAtiva('sessoes')}
                className="text-center p-4 rounded-xl hover:bg-green-50/50 transition-colors cursor-pointer group"
              >
                <p className="text-3xl font-bold text-green-600 group-hover:text-green-700 mb-1">{resumo.evoluidas}</p>
                <p className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 uppercase tracking-tight">Evoluídas</p>
              </button>
              <button
                onClick={() => setAbaAtiva('pendencias')}
                className="text-center p-4 rounded-xl hover:bg-amber-50/50 transition-colors cursor-pointer group"
              >
                <p className="text-3xl font-bold text-amber-600 group-hover:text-amber-700 mb-1">{resumo.pendentes}</p>
                <p className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 uppercase tracking-tight">Pendentes</p>
              </button>
              <button
                onClick={() => setAbaAtiva('pendencias')}
                className="text-center p-4 rounded-xl hover:bg-blue-50/50 transition-colors cursor-pointer group"
              >
                <p className="text-3xl font-bold text-blue-600 group-hover:text-blue-700 mb-1">{resumo.substituicoes}</p>
                <p className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 uppercase tracking-tight">Substit.</p>
              </button>
              <button
                onClick={() => setAbaAtiva('pendencias')}
                className="text-center p-4 rounded-xl hover:bg-red-50/50 transition-colors cursor-pointer group"
              >
                <p className="text-3xl font-bold text-red-600 group-hover:text-red-700 mb-1">{resumo.glosas}</p>
                <p className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 uppercase tracking-tight">Glosas</p>
              </button>
            </div>
          </div>

          {/* Abas */}
          <div className="flex items-center gap-0 border-b border-border px-8 shrink-0">
            <button
              onClick={() => setAbaAtiva('pendencias')}
              className={`px-0 py-4 text-sm font-semibold border-b-2 transition-colors mr-8 ${
                abaAtiva === 'pendencias'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-foreground/60 hover:text-foreground'
              }`}
            >
              Pendências
              {pendencias.length > 0 && <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-blue-600 text-white rounded-full">{pendencias.length}</span>}
            </button>
            <button
              onClick={() => setAbaAtiva('sessoes')}
              className={`px-0 py-4 text-sm font-semibold border-b-2 transition-colors mr-8 ${
                abaAtiva === 'sessoes'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-foreground/60 hover:text-foreground'
              }`}
            >
              Sessões
              {pacienteSessoes.length > 0 && <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-blue-600 text-white rounded-full">{pacienteSessoes.length}</span>}
            </button>
            <button
              onClick={() => setAbaAtiva('resumo')}
              className={`px-0 py-4 text-sm font-semibold border-b-2 transition-colors ${
                abaAtiva === 'resumo'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-foreground/60 hover:text-foreground'
              }`}
            >
              Resumo
            </button>
          </div>

          {/* Conteúdo das abas */}
          <div className="flex-1 overflow-hidden flex">
            {abaAtiva === 'pendencias' && (
              <div className="flex-1 overflow-hidden flex gap-8 p-8">
                {/* Pendências à esquerda */}
                <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                  {pendencias.length > 0 ? (
                    pendencias.map(sessao => (
                      <PacientePendenciasCard key={sessao.id} sessao={sessao} />
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-foreground/60 text-sm">Nenhuma pendência identificada</p>
                    </div>
                  )}
                </div>

                {/* Resumo à direita */}
                <div className="w-96 overflow-y-auto pl-8 border-l border-border pr-4">
                  <PacienteResumoOperacional
                    pacienteNome={pacienteNome}
                    competencia={competencia}
                    resumo={resumo}
                    statusGeral={statusGeral as 'CONCILIADO' | 'PENDENTE'}
                  />
                </div>
              </div>
            )}

            {abaAtiva === 'sessoes' && (
              <div className="flex-1 overflow-y-auto p-8">
                <PacienteSessoesTabela sessoes={pacienteSessoes} />
              </div>
            )}

            {abaAtiva === 'resumo' && (
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl">
                  <PacienteResumoOperacional
                    pacienteNome={pacienteNome}
                    competencia={competencia}
                    resumo={resumo}
                    statusGeral={statusGeral as 'CONCILIADO' | 'PENDENTE'}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
