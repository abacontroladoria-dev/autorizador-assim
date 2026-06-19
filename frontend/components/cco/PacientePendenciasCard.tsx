'use client'

import { AlertCircle } from 'lucide-react'
import type { CCOSessaoDetalhada } from './types'

interface Props {
  sessao: CCOSessaoDetalhada
  onAbrir?: (sessao: CCOSessaoDetalhada) => void
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

function getTipoPendencia(sessao: CCOSessaoDetalhada): string {
  if (sessao.substituicao) return 'Substituição'
  if (sessao.glosa) return 'Glosa'
  if (sessao.evolucaoStatus === 'PENDENTE') return 'Evolução não registrada'
  return 'Pendência'
}

function getDiasAtraso(data: string): number {
  const hoje = new Date()
  const dataSessao = new Date(data)
  const diasAtraso = Math.floor((hoje.getTime() - dataSessao.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diasAtraso)
}

export default function PacientePendenciasCard({ sessao, onAbrir }: Props) {
  const tipo = getTipoPendencia(sessao)
  const diasAtraso = getDiasAtraso(sessao.data)

  return (
    <div className="border border-border rounded-lg p-4 hover:border-foreground/30 transition-colors">
      {/* Data e Hora + Dias de Atraso */}
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <p className="text-sm font-medium text-foreground/70">
          {formatData(sessao.data)} • {sessao.horario}
        </p>
        {diasAtraso > 0 && (
          <p className="text-xs font-semibold text-amber-600 shrink-0">
            {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'}
          </p>
        )}
      </div>

      {/* Especialidade */}
      <p className="text-sm font-semibold text-foreground mb-3">{sessao.terapia}</p>

      {/* Tipo de Problema */}
      <p className="text-xs text-foreground/70 mb-4">{tipo}</p>

      {/* Profissional */}
      {sessao.profissional && (
        <p className="text-xs text-foreground/70 mb-4">
          <span className="font-medium">Profissional:</span> <span className="text-foreground">{sessao.profissional}</span>
        </p>
      )}

      {/* Substituição */}
      {sessao.substituicao && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs space-y-2 flex-1">
              <p className="text-red-900 font-medium">Sessão com substituição</p>
              <p className="text-red-700"><span className="font-medium">Original:</span> {sessao.substituicao.original}</p>
              <p className="text-red-700"><span className="font-medium">Substituto:</span> {sessao.substituicao.substituto}</p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => onAbrir?.(sessao)}
        className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors mt-4 pt-4 border-t border-border w-full text-left"
      >
        Abrir detalhes
      </button>
    </div>
  )
}
