'use client'

import { useEffect, useRef, useState } from 'react'
import { PanelRight, MoreVertical, UserPlus, CheckCheck, Paperclip, Send, Smile, MessageSquare } from 'lucide-react'
import type { Message, Contact } from '@/modules/atendimento/types/central.types'
import { useMensagens, horaDoRelogio, iniciais } from '../useCentralData'

interface Props {
  contextPanelOpen:     boolean
  onToggleContextPanel: () => void
  conversationId:       string | null
  contato:              Contact | null
}

export default function ChatPane({
  contextPanelOpen, onToggleContextPanel, conversationId, contato,
}: Props) {
  const { mensagens, carregando, erro } = useMensagens(conversationId)
  const [texto, setTexto]       = useState('')
  const [enviando, setEnviando] = useState(false)
  const [falhaEnvio, setFalhaEnvio] = useState<string | null>(null)

  const fim = useRef<HTMLDivElement>(null)
  // Rola para o fim quando a contagem muda. Depende do COMPRIMENTO, não do
  // array: o polling substitui o array a cada 5s e rolar a cada tique roubaria
  // a rolagem de quem está lendo o histórico.
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [mensagens.length])

  async function enviar() {
    const corpo = texto.trim()
    if (!corpo || !conversationId || enviando) return
    setEnviando(true)
    setFalhaEnvio(null)
    try {
      const res = await fetch('/api/central/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversationId, body: corpo }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Falhou com ${res.status}`)
      }
      // Só limpa o campo depois do 200: se o envio falhou, o texto do operador
      // continua ali para ele tentar de novo em vez de precisar reescrever.
      setTexto('')
    } catch (e) {
      setFalhaEnvio((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 bg-background gap-3">
        <MessageSquare className="size-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">Selecione uma conversa</p>
      </div>
    )
  }

  const nome = contato?.name ?? contato?.display_phone ?? 'Contato sem nome'

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">

      <div className="h-14 shrink-0 flex items-center px-5 gap-3 border-b border-border bg-card">
        <div className="size-9 rounded-full bg-brand/15 flex items-center justify-center text-brand-fg text-xs font-semibold shrink-0">
          {iniciais(nome)}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground leading-tight truncate">{nome}</h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <p className="text-xs text-muted-foreground truncate">
              {contato?.display_phone ? `${contato.display_phone} · ` : ''}WhatsApp Recepção
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg px-3 min-h-11 transition-colors">
            <CheckCheck className="size-3.5" />
            Resolver
          </button>
          <button className="flex items-center gap-1.5 text-xs font-medium text-foreground bg-muted hover:bg-muted/70 border border-border rounded-lg px-3 min-h-11 transition-colors">
            <UserPlus className="size-3.5" />
            Atribuir
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button
            onClick={onToggleContextPanel}
            aria-pressed={contextPanelOpen}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 min-h-11 transition-colors ${
              contextPanelOpen
                ? 'text-brand bg-brand-surface border border-brand/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
            }`}
          >
            <PanelRight className="size-3.5" />
            Detalhes
          </button>
          <button
            aria-label="Mais opções"
            className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <MoreVertical className="size-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-2">
        {carregando && (
          <p className="text-muted-foreground text-sm text-center py-4">Carregando mensagens...</p>
        )}
        {erro && (
          <p className="text-rose-500 text-sm text-center py-4">
            Não foi possível carregar as mensagens.
            <span className="block text-muted-foreground text-xs mt-1">{erro}</span>
          </p>
        )}
        {!carregando && !erro && mensagens.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">
            Nenhuma mensagem nesta conversa.
          </p>
        )}

        {/* O separador de dia era fixo em "Hoje" no mock. Agora é derivado: um
            separador quando o dia muda em relação à mensagem anterior. */}
        {mensagens.map((msg, i) => {
          const anterior = mensagens[i - 1]
          const novoDia  = !anterior || !mesmoDia(anterior.created_at, msg.created_at)
          return (
            <div key={msg.id} className="contents">
              {novoDia && (
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-medium px-2">
                    {rotuloDoDia(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <MessageBubble msg={msg} />
            </div>
          )
        })}
        <div ref={fim} />
      </div>

      <div className="shrink-0 border-t border-border bg-card px-5 py-4">
        <label htmlFor="chat-composer" className="sr-only">
          Escreva uma mensagem
        </label>
        <div className="flex items-end gap-2">
          <button
            aria-label="Anexar arquivo"
            className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
          >
            <Paperclip className="size-4" />
          </button>

          <div className="flex-1 bg-background border border-border rounded-2xl px-4 py-3 focus-within:border-brand/50 transition-colors">
            <textarea
              id="chat-composer"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              // Enter envia, Shift+Enter quebra linha — convenção de WhatsApp,
              // que é o que o operador tem na mão do lado.
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
              placeholder="Escreva uma mensagem..."
              rows={1}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed max-h-36"
            />
          </div>

          <button
            aria-label="Inserir emoji"
            className="min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
          >
            <Smile className="size-4" />
          </button>

          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            aria-label="Enviar mensagem"
            className="size-11 rounded-full bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors shrink-0"
          >
            <Send className="size-3.75" />
          </button>
        </div>

        {/* O envio passa pelo provider da Meta e pode falhar por motivo que o
            operador precisa ver (janela de 24h fechada, token expirado). Falha
            silenciosa aqui significa paciente sem resposta. */}
        {falhaEnvio && (
          <p className="text-rose-500 text-xs mt-2">{falhaEnvio}</p>
        )}
      </div>
    </div>
  )
}

function mesmoDia(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function rotuloDoDia(iso: string): string {
  const d     = new Date(iso)
  const hoje  = new Date()
  const ontem = new Date(hoje.getTime() - 86_400_000)
  if (d.toDateString() === hoje.toDateString())  return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}

function MessageBubble({ msg }: { msg: Message }) {
  const out = msg.direction === 'outbound'

  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[66%] px-4 py-2.5 ${
          out
            ? 'bg-brand-surface text-foreground rounded-2xl rounded-br-sm'
            : 'bg-muted text-foreground border border-border rounded-2xl rounded-bl-sm'
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
        <div className={`flex items-center gap-1 mt-1.5 ${out ? 'justify-end' : ''}`}>
          {/* Quem escreveu importa: uma resposta da atendente virtual e uma
              resposta digitada pela recepção são coisas diferentes para quem
              audita a conversa depois. */}
          {msg.sent_by_ai && (
            <span className="text-[10px] font-medium text-brand-fg mr-1">IA</span>
          )}
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {horaDoRelogio(msg.sent_at ?? msg.created_at)}
          </span>
          {out && (
            <CheckCheck
              className={`size-3 ${msg.status === 'read' ? 'text-brand-fg' : 'text-brand-fg/40'}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}
