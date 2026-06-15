'use client'

import { resolverStatus, SEVERIDADE_UI } from '@/lib/central/severity'

interface Props {
  /** registro completo (preferido) … */
  item?: any
  /** … ou string de status crua (compatibilidade) */
  status?: string
  /** 'word' (ícone + palavra, padrão) | 'pill' (preenchido) */
  variant?: 'word' | 'pill'
}

/**
 * Sinal de status enxuto: ícone + palavra, cor pela severidade.
 * Um único badge por linha — sem empilhar pills coloridas.
 */
export default function StatusBadge({
  item,
  status,
  variant = 'word',
}: Props) {
  const token = resolverStatus(item ?? { status_operacional: status })
  const ui = SEVERIDADE_UI[token.severidade]
  const Icon = token.icon

  if (variant === 'pill') {
    return (
      <span
        className={`
          inline-flex items-center gap-1.5
          px-2.5 py-1 rounded-full
          text-xs font-medium
          border ${ui.soft} ${ui.softBorder} ${ui.text}
        `}
      >
        <Icon className={`w-3.5 h-3.5 ${token.spin ? 'animate-spin' : ''}`} />
        {token.label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ui.text}`}>
      <Icon className={`w-3.5 h-3.5 ${token.spin ? 'animate-spin' : ''}`} />
      {token.label}
    </span>
  )
}
