import { Phone, Mail, MapPin, ExternalLink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default function ContactCard() {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-border/60">
      {/* Avatar + name + badge */}
      <div className="flex items-start gap-3 mb-4">
        <div className="size-12 rounded-full bg-brand/15 flex items-center justify-center text-brand-fg font-semibold text-sm shrink-0">
          MS
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm leading-tight">Maria Silva</p>
          <span className="inline-flex items-center mt-1 text-[10px] font-medium text-brand-fg bg-brand-surface border border-brand/20 rounded-full px-2 py-0.5">
            Responsável
          </span>
        </div>
        <button
          title="Abrir contato"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <ContactRow icon={Phone} value="+55 11 9 8765-4321" />
        <ContactRow icon={Mail}  value="maria.silva@email.com" truncate />
        <ContactRow icon={MapPin} value="São Paulo, SP" />
      </div>
    </div>
  )
}

function ContactRow({
  icon: Icon,
  value,
  truncate,
}: {
  icon:     LucideIcon
  value:    string
  truncate?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className={`text-xs text-foreground/80 ${truncate ? 'truncate' : ''}`}>{value}</span>
    </div>
  )
}
