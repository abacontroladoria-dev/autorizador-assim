'use client'

import { useState } from 'react'
import { Search, ChevronDown, Plus, X } from 'lucide-react'

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
  { id: '1', name: 'Maria Silva',    preview: 'Preciso reagendar a sessão de sexta...',   time: '09:41', status: 'waiting',  unread: 2 },
  { id: '2', name: 'João Santos',    preview: 'A guia do ASSIM foi aprovada?',            time: '09:15', status: 'open',     unread: 0 },
  { id: '3', name: 'Ana Costa',      preview: 'Obrigada! Até amanhã então.',              time: 'Ter',   status: 'assigned', unread: 0 },
  { id: '4', name: 'Pedro Alves',    preview: 'Pode me enviar o relatório de evolução?', time: 'Seg',   status: 'open',     unread: 1 },
  { id: '5', name: 'Carla Mendes',   preview: 'Preciso da declaração de comparecimento', time: 'Sex',   status: 'waiting',  unread: 3 },
  { id: '6', name: 'Lucas Ferreira', preview: 'Tudo certo para a semana que vem!',       time: 'Qui',   status: 'resolved', unread: 0 },
]

const DOT_COLOR: Record<Status, string> = {
  open:     'bg-emerald-400',
  waiting:  'bg-amber-400',
  assigned: 'bg-sky-400',
  resolved: 'bg-slate-400',
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'Todas'      },
  { key: 'open',     label: 'Abertas'    },
  { key: 'waiting',  label: 'Aguardando' },
  { key: 'assigned', label: 'Atribuídas' },
]

interface SidebarProps {
  isOpen:  boolean
  onClose: () => void
}

export default function ConversationSidebar({ isOpen, onClose }: SidebarProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const conversations = MOCK.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        aria-label="Lista de conversas"
        className={`bg-central-sidebar fixed inset-y-0 left-0 z-40 shrink-0 lg:static lg:z-auto lg:inset-auto w-80 flex flex-col border-r border-border overflow-hidden transition-transform duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="lg:hidden flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0">
          <span className="text-muted-foreground text-xs font-medium">Conversas</span>
          <button
            onClick={onClose}
            aria-label="Fechar conversas"
            className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/8 rounded-lg transition-colors -mr-2"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 pt-4 pb-3 shrink-0">
          <button className="w-full flex items-center justify-between bg-background hover:bg-muted border border-border rounded-xl px-3.5 py-2.5 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_var(--color-emerald-400)]" />
              <span className="text-sm font-medium text-foreground">WhatsApp Recepção</span>
            </div>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-4 pb-3 shrink-0">
          <label htmlFor="conv-search" className="sr-only">
            Buscar conversa
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <input
              id="conv-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full bg-background border border-border text-foreground placeholder:text-muted-foreground text-sm rounded-lg pl-9 pr-3 py-2 outline-none focus:border-brand/50 transition-all"
            />
          </div>
        </div>

        <div className="px-3 pb-2.5 flex items-center gap-1 shrink-0 border-b border-border">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                filter === f.key
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            aria-label="Nova conversa"
            className="ml-auto p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <div
          role="log"
          aria-live="polite"
          className="flex-1 overflow-y-auto"
        >
          {conversations.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-muted-foreground text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            conversations.map(conv => (
              <ConversationCard key={conv.id} conv={conv} />
            ))
          )}
        </div>
      </aside>
    </>
  )
}

function ConversationCard({ conv }: { conv: MockConversation }) {
  const initials = conv.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <button className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-foreground/5 transition-colors border-b border-border text-left">
      <div className="relative shrink-0">
        <div className="size-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-semibold">
          {initials}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 ${DOT_COLOR[conv.status]}`}
          style={{ borderColor: 'var(--color-central-sidebar)' }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{conv.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{conv.time}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.preview}</p>
      </div>

      {conv.unread > 0 && (
        <div className="size-5 rounded-full bg-brand flex items-center justify-center text-[10px] text-white font-bold shrink-0">
          {conv.unread}
        </div>
      )}
    </button>
  )
}
