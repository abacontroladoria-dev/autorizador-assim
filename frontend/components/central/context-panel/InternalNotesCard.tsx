'use client'

import { useState } from 'react'
import { Lock, Send } from 'lucide-react'
import SectionHeader from './SectionHeader'

interface Note {
  id:       string
  author:   string
  initials: string
  body:     string
  time:     string
}

const MOCK_NOTES: Note[] = [
  {
    id: '1',
    author:   'Fernanda Santos',
    initials: 'FS',
    body:     'Verificar autorização ASSIM para próximo mês antes de confirmar o reagendamento.',
    time:     '09:45',
  },
  {
    id: '2',
    author:   'Rodrigo Lima',
    initials: 'RL',
    body:     'Família aguarda relatório de evolução do terapeuta. Solicitar até quinta.',
    time:     '10:02',
  },
]

export default function InternalNotesCard() {
  const [draft, setDraft] = useState('')

  return (
    <div className="px-5 py-4">
      <SectionHeader icon={Lock} title="Notas internas" />

      {/* Note list */}
      {MOCK_NOTES.length > 0 && (
        <div className="space-y-3 mb-3">
          {MOCK_NOTES.map(note => (
            <NoteItem key={note.id} note={note} />
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 overflow-hidden">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Nota para a equipe (não visível ao contato)..."
          rows={2}
          className="w-full bg-transparent text-xs text-foreground placeholder:text-amber-800/35 resize-none outline-none px-3 pt-2.5 pb-1 leading-relaxed"
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <span className="text-[10px] text-amber-600/60 flex items-center gap-1">
            <Lock className="size-2.5" />
            Visível apenas para a equipe
          </span>
          <button
            disabled={!draft.trim()}
            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-100 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

function NoteItem({ note }: { note: Note }) {
  return (
    <div className="flex gap-2.5">
      <div className="size-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-[9px] font-bold shrink-0 mt-0.5">
        {note.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[11px] font-semibold text-foreground">{note.author}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{note.time}</span>
        </div>
        <p className="text-xs text-foreground/65 leading-snug">{note.body}</p>
      </div>
    </div>
  )
}
