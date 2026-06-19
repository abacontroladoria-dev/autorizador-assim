'use client'

import { PanelRight, MoreVertical, UserPlus, CheckCheck, Paperclip, Send, Smile } from 'lucide-react'

interface Props {
  contextPanelOpen:     boolean
  onToggleContextPanel: () => void
}

type Direction = 'inbound' | 'outbound'
type MsgStatus = 'sent' | 'delivered' | 'read'

interface MockMessage {
  id:        string
  direction: Direction
  body:      string
  time:      string
  status:    MsgStatus
}

const MOCK_MESSAGES: MockMessage[] = [
  {
    id: '1', direction: 'inbound', status: 'read', time: '09:32',
    body: 'Olá! Queria confirmar se a sessão de amanhã às 9h está mantida.',
  },
  {
    id: '2', direction: 'outbound', status: 'read', time: '09:34',
    body: 'Bom dia, Maria! Sim, sessão confirmada com a terapeuta Ana. 😊',
  },
  {
    id: '3', direction: 'inbound', status: 'read', time: '09:35',
    body: 'Ótimo! E a guia do ASSIM para o próximo mês já foi liberada?',
  },
  {
    id: '4', direction: 'outbound', status: 'read', time: '09:36',
    body: 'Ainda aguardamos a confirmação do convênio. Assim que sair te aviso aqui.',
  },
  {
    id: '5', direction: 'inbound', status: 'delivered', time: '09:41',
    body: 'Perfeito, obrigada! Pode me reagendar a de sexta para segunda às 10h?',
  },
]

export default function ChatPane({ contextPanelOpen, onToggleContextPanel }: Props) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">

      {/* Chat Header */}
      <div className="h-14 shrink-0 flex items-center px-5 gap-3 border-b border-border bg-card">
        <div className="size-9 rounded-full bg-brand/15 flex items-center justify-center text-brand-fg text-xs font-semibold shrink-0">
          MS
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">Maria Silva</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <p className="text-xs text-muted-foreground">+55 11 9 8765-4321 · WhatsApp Recepção</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 py-1.5 transition-colors">
            <CheckCheck className="size-3.5" />
            Resolver
          </button>
          <button className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-muted hover:bg-muted/70 border border-border rounded-lg px-3 py-1.5 transition-colors">
            <UserPlus className="size-3.5" />
            Atribuir
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button
            onClick={onToggleContextPanel}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
              contextPanelOpen
                ? 'text-brand bg-brand-surface border border-brand/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
            }`}
          >
            <PanelRight className="size-3.5" />
            Detalhes
          </button>
          <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
            <MoreVertical className="size-4" />
          </button>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-2">
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase px-2">
            Hoje
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {MOCK_MESSAGES.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>

      {/* Message composer */}
      <div className="shrink-0 border-t border-border bg-card px-5 py-4">
        <div className="flex items-end gap-2">
          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors mb-0.5">
            <Paperclip className="size-4" />
          </button>

          <div className="flex-1 bg-background border border-border rounded-2xl px-4 py-3 flex items-end gap-2 focus-within:border-brand/50 transition-colors">
            <textarea
              placeholder="Escreva uma mensagem..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed max-h-36"
            />
            <button className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 mb-0.5">
              <Smile className="size-4" />
            </button>
          </div>

          <button className="size-9 rounded-full bg-brand hover:bg-brand-dark flex items-center justify-center text-white transition-colors shrink-0 mb-0.5">
            <Send className="size-3.75" />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: MockMessage }) {
  const out = msg.direction === 'outbound'

  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[66%] px-4 py-2.5 ${
          out
            ? 'bg-brand text-white rounded-2xl rounded-br-sm'
            : 'bg-muted text-foreground rounded-2xl rounded-bl-sm'
        }`}
      >
        <p className="text-sm leading-relaxed">{msg.body}</p>
        <div className={`flex items-center gap-1 mt-1.5 ${out ? 'justify-end' : ''}`}>
          <span className={`text-[10px] tabular-nums ${out ? 'text-white/55' : 'text-muted-foreground'}`}>
            {msg.time}
          </span>
          {out && (
            <CheckCheck
              className={`size-3 ${msg.status === 'read' ? 'text-sky-200' : 'text-white/45'}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}
