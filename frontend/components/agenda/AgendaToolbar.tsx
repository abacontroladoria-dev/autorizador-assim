'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, X, CalendarDays, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function formatWeekLabel(inicio: string, fim: string): string {
  const [anoI, mesI, diaI] = inicio.split('-').map(Number)
  const [anoF, mesF, diaF] = fim.split('-').map(Number)
  if (mesI === mesF) {
    return `${diaI} – ${diaF} de ${MONTHS_PT[mesI - 1]} de ${anoI}`
  }
  return `${diaI} de ${MONTHS_PT[mesI - 1]} – ${diaF} de ${MONTHS_PT[mesF - 1]} de ${anoF}`
}

type View = 'semana' | 'dia'

interface AgendaToolbarProps {
  weekRange: { inicio: string; fim: string }
  currentDate: Date
  searchQuery: string
  setSearchQuery: (v: string) => void
  navegarSemana: (direcao: 1 | -1) => void
  irParaHoje: () => void
  view?: View
  onViewChange?: (v: View) => void
  loading?: boolean
  searchMode?: 'simple' | 'button'
  searchPlaceholder?: string
  inputValue?: string
  onInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSearch?: () => void
  onClear?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  inputRef?: React.RefObject<HTMLInputElement | null>
  suggestions?: string[]
  onSuggestionSelect?: (value: string) => void
}

export default function AgendaToolbar({
  weekRange,
  currentDate,
  searchQuery,
  setSearchQuery,
  navegarSemana,
  irParaHoje,
  view = 'semana',
  onViewChange,
  loading,
  searchMode,
  searchPlaceholder,
  inputValue,
  onInputChange,
  onSearch,
  onClear,
  onKeyDown,
  inputRef,
  suggestions,
  onSuggestionSelect,
}: AgendaToolbarProps) {
  const weekLabel = formatWeekLabel(weekRange.inicio, weekRange.fim)
  const isHoje = new Date().toDateString() === currentDate.toDateString()
  const [selectedIndex, setSelectedIndex] = useState(-1)

  useEffect(() => { setSelectedIndex(-1) }, [suggestions])

  function handleInternalKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const total = suggestions?.length ?? 0
    if (e.key === 'ArrowDown' && total > 0) {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, total - 1))
      return
    }
    if (e.key === 'ArrowUp' && total > 0) {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, -1))
      return
    }
    if (e.key === 'Enter' && selectedIndex >= 0 && suggestions?.[selectedIndex]) {
      e.preventDefault()
      onSuggestionSelect?.(suggestions[selectedIndex])
      setSelectedIndex(-1)
      return
    }
    onKeyDown?.(e)
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-2.5 flex items-center gap-3 flex-wrap shadow-[0_1px_4px_rgba(0,0,0,0.05)]">

      {/* Navegação: Hoje + setas */}
      <div className="flex items-center gap-2">
        <button
          onClick={irParaHoje}
          className={cn(
            'px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all',
            isHoje
              ? 'bg-[#3A8FB7] text-white border-[#3A8FB7] shadow-sm'
              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700',
          )}
        >
          Hoje
        </button>
        <button
          onClick={() => navegarSemana(-1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => navegarSemana(1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
          aria-label="Próxima semana"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Label da semana */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-slate-700 font-semibold text-[14px] tracking-tight truncate">
          {weekLabel}
        </span>
        {loading && (
          <span className="w-3.5 h-3.5 border-[1.5px] border-[#3A8FB7] border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </div>

      {/* Busca simples inline */}
      {searchMode === 'simple' && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/20 focus:border-[#3A8FB7]/50 w-52 bg-slate-50/80 transition-all"
          />
        </div>
      )}

      {/* Busca com botão + dropdown de sugestões */}
      {searchMode === 'button' && (
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={handleInternalKeyDown}
            placeholder={searchPlaceholder ?? 'Buscar por nome...'}
            className="w-full pl-8 pr-24 py-1.5 rounded-xl border border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3A8FB7]/20 focus:border-[#3A8FB7]/50 bg-slate-50/80 transition-all"
          />
          <button
            onClick={onClear}
            tabIndex={inputValue ? 0 : -1}
            aria-hidden={!inputValue}
            className={cn(
              'absolute right-19 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all',
              inputValue ? 'text-slate-300 hover:text-slate-500' : 'text-transparent pointer-events-none',
            )}
          >
            <X size={13} />
          </button>
          <button
            onClick={onSearch}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-3 bg-[#3A8FB7] text-white text-[12px] font-semibold rounded-lg hover:bg-[#2d7a9f] active:bg-[#236484] transition-colors shadow-sm"
          >
            Buscar
          </button>

          {suggestions && suggestions.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); onSuggestionSelect?.(s) }}
                  className={cn(
                    'px-3 py-2 text-[13px] cursor-pointer transition-colors',
                    i === selectedIndex
                      ? 'bg-[#3A8FB7]/10 text-[#3A8FB7]'
                      : 'text-slate-700 hover:bg-[#3A8FB7]/5 hover:text-[#3A8FB7]',
                  )}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Toggle Semana / Dia */}
      {onViewChange && (
        <div className="flex bg-slate-50 rounded-xl p-0.5 text-[13px] font-medium">
          <button
            onClick={() => onViewChange('semana')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] transition-all',
              view === 'semana'
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-600',
            )}
          >
            <CalendarDays size={14} />
            Semana
          </button>
          <button
            onClick={() => onViewChange('dia')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] transition-all',
              view === 'dia'
                ? 'bg-white text-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-600',
            )}
          >
            <Clock size={14} />
            Dia
          </button>
        </div>
      )}
    </div>
  )
}
