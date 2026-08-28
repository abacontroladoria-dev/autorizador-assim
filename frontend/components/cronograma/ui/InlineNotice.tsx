// InlineNotice — bloco de aviso inline (loading/erro/vazio/atenção), usando o
// par tonal suave de tones.ts. Consolida o padrão `rounded-xl border ... p-3`
// com cor hardcoded que se repetia em cada tela do módulo Cronograma.

import type { ReactNode } from "react"
import { TONE_SOFT, type Tone } from "./tones"

interface InlineNoticeProps {
  tone: Tone
  icon?: ReactNode
  className?: string
  children: ReactNode
}

export function InlineNotice({ tone, icon, className = "", children }: InlineNoticeProps) {
  const t = TONE_SOFT[tone]
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-transparent px-3.5 py-3 text-xs ${t.bg} ${t.text} ${className}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  )
}
