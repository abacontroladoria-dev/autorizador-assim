'use client'

import type { AlertaOrigem } from './types'

type Props = {
  origem: AlertaOrigem
  /** Nome da regra (origem=sistema) ou do autor (origem=manual). */
  detalhe?: string | null
  className?: string
}

/**
 * Tag de origem do alerta.
 *
 * Existe para responder, seis meses depois, se aquele alerta nasceu de uma regra
 * automática ou da decisão de uma pessoa — e, no segundo caso, de quem.
 *
 * O nome do autor vem de alertas_eventos.autor_nome (snapshot gravado no momento
 * do evento), não de um join em usuarios: o histórico precisa continuar legível
 * mesmo que a pessoa troque de nome, mude de setor ou seja desativada.
 */
export default function OrigemTag({ origem, detalhe, className = '' }: Props) {
  const sistema = origem === 'sistema'

  return (
    <span
      title={detalhe ?? undefined}
      className={`
        inline-flex items-center gap-1 rounded-full px-2 py-0.5
        text-[11px] font-semibold whitespace-nowrap ring-1
        ${sistema
          ? 'bg-slate-50 text-slate-600 ring-slate-300'
          : 'bg-amber-50 text-amber-700 ring-amber-300'
        }
        ${className}
      `}
    >
      <span aria-hidden>{sistema ? '🤖' : '👤'}</span>
      {sistema ? 'Sistema' : 'Manual'}
    </span>
  )
}
