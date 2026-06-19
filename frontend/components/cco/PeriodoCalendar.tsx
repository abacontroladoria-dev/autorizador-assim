'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

function parseDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

interface Props {
  dataInicio: string
  dataFim: string
  onDataInicioChange: (data: string) => void
  onDataFimChange: (data: string) => void
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function getFirstDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
}

function isSaturday(day: number): boolean {
  return day === 6
}

function isSunday(day: number): boolean {
  return day === 0
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export default function PeriodoCalendar({
  dataInicio,
  dataFim,
  onDataInicioChange,
  onDataFimChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(() => parseDateLocal(dataInicio))
  const [tempDataInicio, setTempDataInicio] = useState(dataInicio)
  const [tempDataFim, setTempDataFim] = useState(dataFim)
  const [selectingEnd, setSelectingEnd] = useState(false)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfMonth(currentMonth)

  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const handleDateSelect = (day: number) => {
    const date = formatDate(year, month, day)
    if (!selectingEnd) {
      setTempDataInicio(date)
      setSelectingEnd(true)
    } else {
      if (date >= tempDataInicio) {
        setTempDataFim(date)
      } else {
        setTempDataInicio(date)
        setTempDataFim(tempDataInicio)
      }
      setSelectingEnd(false)
    }
  }

  const handleConfirm = () => {
    onDataInicioChange(tempDataInicio)
    onDataFimChange(tempDataFim)
    setIsOpen(false)
  }

  const handleClear = () => {
    const today = new Date()
    const firstOfMonth = formatDate(today.getFullYear(), today.getMonth(), 1)
    const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate())
    setTempDataInicio(firstOfMonth)
    setTempDataFim(todayStr)
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectingEnd(false)
  }

  const prev = () => setCurrentMonth(new Date(year, month - 1, 1))
  const next = () => setCurrentMonth(new Date(year, month + 1, 1))

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

  const dataInicioDate = parseDateLocal(dataInicio)
  const dataFimDate = parseDateLocal(dataFim)

  return (
    <div className="relative inline-block">
      {/* Display */}
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          setTempDataInicio(dataInicio)
          setTempDataFim(dataFim)
          setSelectingEnd(false)
          setCurrentMonth(parseDateLocal(dataInicio))
        }}
        className="flex items-center gap-2 px-4 py-2.5 bg-foreground/2 border border-border rounded-lg hover:border-foreground/30 transition-colors"
        aria-label="Abrir seletor de período"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="text-sm font-medium text-foreground">
          {dataInicioDate.toLocaleDateString('pt-BR')} até {dataFimDate.toLocaleDateString('pt-BR')}
        </span>
        {isOpen ? <X size={18} className="text-foreground/60" /> : <ChevronRight size={18} className="text-foreground/60" />}
      </button>

      {/* Calendário */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            className="absolute top-full right-0 mt-2 bg-card border border-border rounded-lg shadow-xl z-50 p-4 w-80"
            role="dialog"
            aria-modal="true"
            aria-label="Seletor de período"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prev}
                className="p-1 hover:bg-foreground/5 rounded transition-colors"
                aria-label={`Mês anterior: ${monthNames[month === 0 ? 11 : month - 1]}`}
              >
                <ChevronLeft size={20} className="text-foreground/60" />
              </button>
              <h3 className="text-sm font-semibold text-foreground">
                {monthNames[month]} {year}
              </h3>
              <button
                onClick={next}
                className="p-1 hover:bg-foreground/5 rounded transition-colors"
                aria-label={`Próximo mês: ${monthNames[month === 11 ? 0 : month + 1]}`}
              >
                <ChevronRight size={20} className="text-foreground/60" />
              </button>
            </div>

            {/* Days header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map(day => (
                <div key={day} className="text-center text-xs font-medium text-foreground/60 h-8 flex items-center justify-center">
                  {day}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {days.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-8 sm:h-10" />
                }

                const dayOfWeek = (firstDay + day - 1) % 7
                const isWeekend = isSaturday(dayOfWeek) || isSunday(dayOfWeek)
                const currentDate = formatDate(year, month, day)
                const isInRange = tempDataInicio && tempDataFim && currentDate >= tempDataInicio && currentDate <= tempDataFim
                const isStart = currentDate === tempDataInicio
                const isEnd = currentDate === tempDataFim

                return (
                  <button
                    key={day}
                    onClick={() => handleDateSelect(day)}
                    className={`h-10 sm:h-8 rounded text-xs font-medium transition-colors flex items-center justify-center ${
                      isStart || isEnd
                        ? 'bg-indigo-600 text-white'
                        : isInRange
                          ? 'bg-indigo-50 text-indigo-600'
                          : isWeekend
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-foreground hover:bg-foreground/5'
                    }`}
                    aria-label={`${day} de ${monthNames[month]}, ${isStart ? 'data inicial selecionada' : isEnd ? 'data final selecionada' : isInRange ? 'data no intervalo' : ''}`}
                    aria-current={isStart || isEnd ? 'date' : undefined}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* Info */}
            <div className="pt-3 border-t border-border mb-4 text-xs text-foreground/60">
              <p className="mb-2">
                {!selectingEnd && tempDataInicio && tempDataFim
                  ? `Selecionado: ${parseDateLocal(tempDataInicio).toLocaleDateString('pt-BR')} até ${parseDateLocal(tempDataFim).toLocaleDateString('pt-BR')}`
                  : selectingEnd
                    ? 'Selecione a data final'
                    : 'Selecione a data inicial'}
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-2">
              <button
                onClick={handleClear}
                className="flex-1 px-3 py-2 text-sm font-medium text-foreground/60 bg-foreground/5 border border-border rounded-lg hover:bg-foreground/10 transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={handleConfirm}
                disabled={!tempDataInicio || !tempDataFim}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
