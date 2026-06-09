'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { CCOSessaoDetalhada } from './types'
import TratativasBadges from './TratativasBadges'

interface Props {
  sessao: CCOSessaoDetalhada
}

function formatData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}`
}

function getTipoPendencia(sessao: CCOSessaoDetalhada): string {
  if (sessao.substituicao) return 'Substituição'
  if (sessao.glosa) return 'Glosa'
  if (sessao.evolucaoStatus === 'PENDENTE') return 'Sem evolução'
  return 'Pendência'
}

function getTipoColor(tipo: string): string {
  switch (tipo) {
    case 'Substituição':
      return 'bg-blue-50 border-blue-200'
    case 'Glosa':
      return 'bg-red-50 border-red-200'
    case 'Sem evolução':
      return 'bg-amber-50 border-amber-200'
    default:
      return 'bg-amber-50 border-amber-200'
  }
}

function getTipoIcon(tipo: string) {
  switch (tipo) {
    case 'Substituição':
      return <RefreshCw size={16} className="text-blue-600" />
    case 'Glosa':
      return <AlertTriangle size={16} className="text-red-600" />
    case 'Sem evolução':
      return <AlertTriangle size={16} className="text-amber-600" />
    default:
      return <AlertTriangle size={16} className="text-amber-600" />
  }
}

export default function PacientePendenciasCard({ sessao }: Props) {
  const tipo = getTipoPendencia(sessao)
  const tipoColor = getTipoColor(tipo)

  return (
    <div className={`border-l-4 rounded-lg p-5 backdrop-blur-sm ${tipoColor}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-bold text-foreground text-base">{formatData(sessao.data)} · {sessao.horario}</p>
          <p className="text-sm text-foreground/70 mt-1 font-medium">{sessao.terapia}</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 mb-4 py-2">
        {getTipoIcon(tipo)}
        <span className="text-sm font-semibold text-foreground">{tipo}</span>
      </div>

      {sessao.profissional && (
        <div className="mb-3 pt-3 border-t border-current border-opacity-15">
          <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wide mb-1">Profissional</p>
          <p className="text-sm font-semibold text-foreground">{sessao.profissional}</p>
        </div>
      )}

      {sessao.substituicao && (
        <div className="space-y-3 mb-3 pt-3 border-t border-current border-opacity-15 text-sm">
          <div>
            <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wide mb-1">Original</p>
            <p className="font-semibold text-foreground">{sessao.substituicao.original}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wide mb-1">Substituto</p>
            <p className="font-semibold text-foreground">{sessao.substituicao.substituto}</p>
          </div>
        </div>
      )}

      {(sessao.substituicao || sessao.glosa || (sessao.tratativas && sessao.tratativas.length > 0)) && (
        <div className="pt-3 border-t border-current border-opacity-15">
          <TratativasBadges
            substituicao={sessao.substituicao}
            glosa={sessao.glosa}
            tratativas={sessao.tratativas}
          />
        </div>
      )}
    </div>
  )
}
