'use client'

import { useEffect, useRef, useState } from 'react'
import { User } from 'lucide-react'
import { useHeader } from '@/contexts/HeaderContext'
import { useAgenda } from '@/hooks/useAgenda'
import { buscarSugestoesTerapeutas } from '@/services/agenda.service'
import AgendaToolbar from '@/components/agenda/AgendaToolbar'
import AgendaCalendar from '@/components/agenda/AgendaCalendar'

export default function AgendaTerapeutasPage() {
  const { setHeader } = useHeader()
  const [view, setView] = useState<'semana' | 'dia'>('semana')
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setHeader('Central de Agenda — Terapeutas', 'Visualize e gerencie os agendamentos por terapeuta')
  }, [setHeader])

  const agenda = useAgenda('terapeutas', { autoLoad: false })

  useEffect(() => {
    if (!showSuggestions || inputValue.trim().length < 2) {
      setSuggestions([])
      return
    }
    buscarSugestoesTerapeutas(inputValue.trim()).then(setSuggestions)
  }, [inputValue, showSuggestions])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value)
    setShowSuggestions(true)
  }

  function handleSearch() {
    setShowSuggestions(false)
    setView('semana')
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
    setView('semana')
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
        searchPlaceholder="Buscar por terapeuta..."
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
        <AgendaCalendar
          mode="terapeutas"
          events={agenda.events}
          currentDate={agenda.currentDate}
          view={view}
        />
      ) : (
        <EmptyState />
      )}

    </div>
  )
}

function EmptyState() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center min-h-105 gap-4">
      <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
        <User size={20} className="text-slate-300" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-[13px] font-semibold text-slate-500 tracking-tight">
          Nenhum terapeuta selecionado
        </p>
        <p className="text-[13px] text-slate-400 font-normal leading-relaxed">
          Pesquise um terapeuta para visualizar os atendimentos
        </p>
      </div>
    </div>
  )
}
