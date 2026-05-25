'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarX, DoorOpen } from 'lucide-react'
import { useHeader } from '@/contexts/HeaderContext'
import { useAgenda } from '@/hooks/useAgenda'
import { buscarSugestoesSalas } from '@/services/agenda.service'
import AgendaToolbar from '@/components/agenda/AgendaToolbar'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'

export default function AgendaSalasPage() {
  const { setHeader } = useHeader()
  const [view, setView] = useState<'semana' | 'dia'>('semana')
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHeader('Central de Agenda — Salas', 'Visualize a ocupação das salas por horário')
  }, [setHeader])

  const agenda = useAgenda('salas', { autoLoad: false })

  useEffect(() => {
    if (!showSuggestions || inputValue.trim().length < 2) {
      setSuggestions([])
      return
    }
    buscarSugestoesSalas(inputValue.trim()).then(setSuggestions)
  }, [inputValue, showSuggestions])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value)
    setShowSuggestions(true)
  }

  function handleSearch() {
    setShowSuggestions(false)
    agenda.buscar(inputValue.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') setShowSuggestions(false)
  }

  function handleClear() {
    setInputValue('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  function handleSuggestionSelect(value: string) {
    setInputValue(value)
    setShowSuggestions(false)
    agenda.buscar(value)
  }

  return (
    <div className="flex flex-col gap-5">

      <AgendaToolbar
        weekRange={agenda.weekRange}
        currentDate={agenda.currentDate}
        searchQuery={agenda.searchQuery}
        setSearchQuery={agenda.setSearchQuery}
        navegarSemana={agenda.navegarSemana}
        irParaHoje={agenda.irParaHoje}
        loading={agenda.loading}
        view={view}
        onViewChange={setView}
        searchMode="button"
        searchPlaceholder="Buscar por sala..."
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onSearch={handleSearch}
        onClear={handleClear}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        suggestions={suggestions}
        onSuggestionSelect={handleSuggestionSelect}
      />

      {agenda.hasSearched ? (
        !agenda.loading && agenda.events.length === 0 ? (
          <SemResultados />
        ) : (
          <AgendaCalendar
            mode="salas"
            events={agenda.events}
            currentDate={agenda.currentDate}
            view={view}
          />
        )
      ) : (
        <EmptyState />
      )}

    </div>
  )
}

function SemResultados() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center min-h-105 gap-4">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
        <CalendarX size={20} className="text-slate-300" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-[13px] font-semibold text-slate-500 tracking-tight">
          Nenhuma sessão encontrada
        </p>
        <p className="text-[13px] text-slate-400 font-normal leading-relaxed">
          Esta sala não tem atendimentos nesta semana.
          Use as setas para navegar para outra semana.
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center min-h-105 gap-4">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
        <DoorOpen size={20} className="text-slate-300" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-[13px] font-semibold text-slate-500 tracking-tight">
          Nenhuma sala selecionada
        </p>
        <p className="text-[13px] text-slate-400 font-normal leading-relaxed">
          Pesquise uma sala para visualizar os atendimentos
        </p>
      </div>
    </div>
  )
}
