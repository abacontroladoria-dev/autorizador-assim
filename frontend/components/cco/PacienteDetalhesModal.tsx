'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CCOSessaoDetalhada, Competencia } from './types'
import PacientePendenciasCard from './PacientePendenciasCard'
import PacienteHistoricoTabela from './PacienteHistoricoTabela'

type AbaAtiva = 'pendencias' | 'historico'

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

  // Pendências: sessões que não estão conciliadas
  const pendencias = pacienteSessoes.filter(s =>
    s.evolucaoStatus === 'PENDENTE' || s.substituicao || s.glosa
  )

  // Histórico: sessões evoluídas
  const historico = pacienteSessoes.filter(s => s.evolucaoStatus === 'EVOLUIDA')

  // Encontrar pendência mais antiga
  const pendenciaMaisAntiga = pendencias.length > 0
    ? Math.min(...pendencias.map(p => {
        const hoje = new Date()
        const dataPendencia = new Date(p.data)
        const diasAtraso = Math.floor((hoje.getTime() - dataPendencia.getTime()) / (1000 * 60 * 60 * 24))
        return diasAtraso
      }))
    : 0

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 transition-opacity" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl shadow-2xl w-[min(95vw,1000px)] max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header Compacto */}
          <div className="border-b border-border px-6 py-4 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-foreground truncate">{pacienteNome}</h2>
                <p className="text-xs text-foreground/60 mt-1">
                  Competência {String(competencia.mes).padStart(2, '0')}/{competencia.ano}
                </p>
              </div>
              {pendencias.length > 0 && (
                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground/60">Pendência mais antiga</p>
                  <p className="text-sm font-semibold text-amber-600">{pendenciaMaisAntiga} dias</p>
                </div>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-foreground/5 rounded-lg transition-colors shrink-0"
              >
                <X size={20} className="text-foreground/60" />
              </button>
            </div>
          </div>

          {/* Abas Simples */}
          <div className="flex items-center border-b border-border px-6 shrink-0 gap-6">
            <button
              onClick={() => setAbaAtiva('pendencias')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === 'pendencias'
                  ? 'border-blue-600 text-foreground'
                  : 'border-transparent text-foreground/60 hover:text-foreground'
              }`}
            >
              Pendências
              {pendencias.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-foreground/70">
                  ({pendencias.length})
                </span>
              )}
            </button>
            <button
              onClick={() => setAbaAtiva('historico')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === 'historico'
                  ? 'border-blue-600 text-foreground'
                  : 'border-transparent text-foreground/60 hover:text-foreground'
              }`}
            >
              Histórico
              {historico.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-foreground/70">
                  ({historico.length})
                </span>
              )}
            </button>
          </div>

          {/* Conteúdo das Abas */}
          <div className="flex-1 overflow-hidden">
            {abaAtiva === 'pendencias' && (
              <div className="overflow-y-auto h-full p-6">
                {pendencias.length > 0 ? (
                  <div className="space-y-4">
                    {pendencias.map(sessao => (
                      <PacientePendenciasCard
                        key={sessao.id}
                        sessao={sessao}
                        onAbrir={() => {
                          // Placeholder para ação futura de abrir detalhes expandidos
                          console.log('Abrir detalhes de:', sessao.id)
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-sm font-semibold text-green-600">✓ Nenhuma pendência</p>
                    <p className="text-xs text-foreground/60 mt-2">Todas as sessões estão conciliadas</p>
                  </div>
                )}
              </div>
            )}

            {abaAtiva === 'historico' && (
              <div className="overflow-y-auto h-full p-6">
                {historico.length > 0 ? (
                  <PacienteHistoricoTabela sessoes={historico} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <p className="text-sm font-semibold text-foreground/70">Sem histórico</p>
                    <p className="text-xs text-foreground/60 mt-2">Nenhuma sessão foi resolvida ainda</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
