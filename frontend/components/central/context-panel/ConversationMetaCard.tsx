import { MessageSquare, Inbox, Globe, UserCircle, Clock, Tag, Calendar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import SectionHeader from './SectionHeader'

interface HistoryEntry {
  id:       string
  preview:  string
  date:     string
  resolved: boolean
}

const MOCK_HISTORY: HistoryEntry[] = [
  { id: '1', preview: 'Dúvida sobre guia ASSIM',      date: 'Semana passada', resolved: true  },
  { id: '2', preview: 'Reagendamento sessão Ana',     date: '14/06/2026',     resolved: true  },
  { id: '3', preview: 'Confirmação retorno escolar',  date: '02/06/2026',     resolved: true  },
]

export default function ConversationMetaCard() {
  return (
    <div className="px-5 py-4 border-b border-border/60 space-y-5">
      {/* Conversation info */}
      <div>
        <SectionHeader icon={MessageSquare} title="Informações" />
        <div className="space-y-2.5">
          <MetaRow icon={Inbox}      label="Caixa"       value="WhatsApp Recepção"  />
          <MetaRow icon={Globe}      label="Canal"       value="Evolution · WhatsApp" />
          <MetaRow icon={UserCircle} label="Atribuído a" value="—"                  />
          <MetaRow icon={Clock}      label="Iniciado"    value="Hoje, 09:32"        />
          <StatusRow />
          <TagsRow />
        </div>
      </div>

      {/* History */}
      <div>
        <SectionHeader icon={Calendar} title="Histórico" count={MOCK_HISTORY.length} />
        <div className="space-y-0.5">
          {MOCK_HISTORY.map(entry => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MetaRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="text-foreground/80 font-medium">{value}</span>
    </div>
  )
}

function StatusRow() {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="size-3.5 flex items-center justify-center shrink-0">
        <div className="size-2 rounded-full bg-amber-400" />
      </div>
      <span className="text-muted-foreground flex-1">Status</span>
      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium px-2 py-0.5">
        Aguardando
      </span>
    </div>
  )
}

function TagsRow() {
  return (
    <div className="flex items-start gap-2 text-xs">
      <Tag className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <span className="text-muted-foreground flex-1">Tags</span>
      <div className="flex flex-wrap gap-1 justify-end">
        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">ASSIM</span>
        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">Agendamento</span>
      </div>
    </div>
  )
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <button className="w-full flex items-start gap-2.5 py-2 px-2 rounded-lg hover:bg-black/[0.04] transition-colors text-left">
      <div className={`size-1.5 rounded-full mt-1.5 shrink-0 ${entry.resolved ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/75 leading-snug">{entry.preview}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{entry.date}</p>
      </div>
    </button>
  )
}
