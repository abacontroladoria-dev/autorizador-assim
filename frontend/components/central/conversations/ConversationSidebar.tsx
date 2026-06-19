'use client'

import { useState } from 'react'
import { Search, ChevronDown, Plus } from 'lucide-react'

type Status = 'open' | 'waiting' | 'assigned' | 'resolved'
type Filter  = 'all' | Status

interface MockConversation {
  id:      string
  name:    string
  preview: string
  time:    string
  status:  Status
  unread:  number
}

const MOCK: MockConversation[] = [
  { id: '1', name: 'Maria Silva',    preview: 'Preciso reagendar a sessão de sexta...',    time: '09:41', status: 'waiting',  unread: 2 },
  { id: '2', name: 'João Santos',    preview: 'A guia do ASSIM foi aprovada?',             time: '09:15', status: 'open',     unread: 0 },
  { id: '3', name: 'Ana Costa',      preview: 'Obrigada! Até amanhã então.',               time: 'Ter',   status: 'assigned', unread: 0 },
  { id: '4', name: 'Pedro Alves',    preview: 'Pode me enviar o relatório de evolução?',  time: 'Seg',   status: 'open',     unread: 1 },
  { id: '5', name: 'Carla Mendes',   preview: 'Preciso da declaração de comparecimento',  time: 'Sex',   status: 'waiting',  unread: 3 },
  { id: '6', name: 'Lucas Ferreira', preview: 'Tudo certo para a semana que vem!',        time: 'Qui',   status: 'resolved', unread: 0 },
]

const STRIP_COLOR: Record<Status, string> = {
  open:     'bg-emerald-400',
  waiting:  'bg-amber-400',
  assigned: 'bg-violet-400',
  resolved: 'bg-slate-500',
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'Todas'      },
  { key: 'open',     label: 'Abertas'    },
  { key: 'waiting',  label: 'Aguardando' },
  { key: 'assigned', label: 'Atribuídas' },
]

export default function ConversationSidebar() {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const conversations = MOCK.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <aside
      style={{ backgroundColor: 'oklch(0.14 0.012 232)' }}
      className="w-80 shrink-0 flex flex-col border-r border-white/[0.08] overflow-hidden"
    >
      {/* Inbox selector */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <button className="w-full flex items-center justify-between bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] rounded-xl px-3.5 py-2.5 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
            <span className="text-sm font-medium text-white/80">WhatsApp Recepção</span>
          </div>
          <ChevronDown className="size-4 text-white/30" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/25 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="w-full bg-white/[0.05] border border-white/[0.08] text-white/80 placeholder:text-white/25 text-sm rounded-lg pl-9 pr-3 py-2 outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-3 pb-2.5 flex items-center gap-1 shrink-0 border-b border-white/[0.06]">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
              filter === f.key
                ? 'bg-brand text-white shadow-sm'
                : 'text-white/40 hover:text-white/65 hover:bg-white/[0.05]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button className="ml-auto p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-lg transition-colors">
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <p className="text-white/25 text-sm">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          conversations.map(conv => (
            <ConversationCard key={conv.id} conv={conv} />
          ))
        )}
      </div>
    </aside>
  )
}

function ConversationCard({ conv }: { conv: MockConversation }) {
  const initials = conv.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <button className="w-full flex items-stretch hover:bg-white/[0.04] transition-colors border-b border-white/[0.05]">
      {/* Status strip */}
      <div className={`w-[3px] shrink-0 self-stretch ${STRIP_COLOR[conv.status]}`} />

      <div className="flex items-center gap-3 px-4 py-3.5 flex-1 min-w-0 text-left">
        {/* Avatar */}
        <div className="size-9 rounded-full bg-white/[0.08] flex items-center justify-center text-white/60 text-xs font-semibold shrink-0">
          {initials}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-white/85 truncate">{conv.name}</span>
            <span className="text-[10px] text-white/30 shrink-0 tabular-nums">{conv.time}</span>
          </div>
          <p className="text-xs text-white/35 truncate mt-0.5">{conv.preview}</p>
        </div>

        {/* Unread badge */}
        {conv.unread > 0 && (
          <div className="size-5 rounded-full bg-brand flex items-center justify-center text-[10px] text-white font-bold shrink-0">
            {conv.unread}
          </div>
        )}
      </div>
    </button>
  )
}
