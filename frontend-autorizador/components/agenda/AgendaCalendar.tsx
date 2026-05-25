'use client'

import { useRef, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type {
  EventClickArg,
  DatesSetArg,
  EventContentArg,
} from '@fullcalendar/core'
import type { AgendaEvent, AgendaMode } from '@/types/agenda'

type OverlapItem = NonNullable<AgendaEvent['extendedProps']['overlapEvents']>[number]
type OverlapModalState = { events: OverlapItem[]; startTime: string; mode: AgendaMode } | null

interface AgendaCalendarProps {
  mode: AgendaMode
  events: AgendaEvent[]
  currentDate: Date
  view?: 'semana' | 'dia'
  onEventClick?: (event: AgendaEvent) => void
  onDatesSet?: (arg: DatesSetArg) => void
}

export default function AgendaCalendar({
  mode,
  events,
  currentDate,
  view = 'semana',
  onEventClick,
  onDatesSet,
}: AgendaCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)
  const [overlapModal, setOverlapModal] = useState<OverlapModalState>(null)

  // Sempre navega para a segunda-feira da semana — evita que gotoDate com
  // fim-de-semana (sáb/dom) navegue para a semana errada com weekends=false
  const weekStart = useMemo(() => toWeekMonday(currentDate), [currentDate])

  // Na montagem o initialDate já posiciona o calendário; só navega quando a
  // semana efetivamente muda (evita gotoDate DEPOIS dos eventos aparecerem)
  const isFirstMount = useRef(true)
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return }
    const id = setTimeout(() => {
      calendarRef.current?.getApi()?.gotoDate(weekStart)
    }, 0)
    return () => clearTimeout(id)
  }, [weekStart])

  useEffect(() => {
    const id = setTimeout(() => {
      const api = calendarRef.current?.getApi()
      if (!api) return
      const next = resolveView(view)
      if (api.view.type !== next) api.changeView(next)
    }, 0)
    return () => clearTimeout(id)
  }, [view])

  const renderEventContent = useMemo(
    () => makeRenderEventContent(mode, setOverlapModal),
    [mode],
  )

  function handleEventClick(arg: EventClickArg) {
    if (!onEventClick) return
    const raw = arg.event as unknown as AgendaEvent
    onEventClick({
      id:              raw.id,
      title:           raw.title,
      start:           arg.event.startStr,
      end:             arg.event.endStr,
      backgroundColor: raw.backgroundColor,
      borderColor:     raw.borderColor,
      textColor:       raw.textColor,
      extendedProps:   arg.event.extendedProps as AgendaEvent['extendedProps'],
    })
  }

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] agenda-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={resolveView(view)}
          initialDate={weekStart}
          headerToolbar={false}
          locale={ptBrLocale}
          slotMinTime="08:00:00"
          slotMaxTime="18:00:00"
          slotDuration="00:40:00"
          expandRows={true}
          contentHeight="auto"
          slotLabelInterval="00:40:00"
          height="auto"
          allDaySlot={false}
          nowIndicator={false}
          editable={false}
          droppable={false}
          selectable={false}
          weekends={false}
          events={events}
          eventClick={handleEventClick}
          datesSet={onDatesSet}
          eventContent={renderEventContent}
          dayHeaderContent={(arg) => {
            const weekday = arg.date
              .toLocaleDateString('pt-BR', { weekday: 'short' })
              .replace('.', '')
              .toUpperCase()
            const day = arg.date.getDate()
            return (
              <div className="flex flex-col items-center gap-0.5 py-1.5">
                <span className="text-[10px] font-semibold tracking-widest text-slate-400">
                  {weekday}
                </span>
                <span
                  className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-full text-[17px] font-semibold leading-none',
                    arg.isToday ? 'bg-[#3A8FB7] text-white' : 'text-slate-600',
                  )}
                >
                  {day}
                </span>
              </div>
            )
          }}
          slotLaneClassNames={(arg) => {
            const hour = arg.date?.getHours()
            if (hour === 12) return ['fc-turno-intervalo']
            return []
          }}
          slotLabelContent={(arg: { text: string; date: Date }) => {
            const hour   = arg.date.getHours()
            const minute = arg.date.getMinutes()

            if ((hour === 12 && minute === 40) || (hour === 17 && minute === 40)) {
              return <></>
            }

            if (hour >= 13) {
              const adjustedTotal  = hour * 60 + minute - 20
              const adjustedHour   = Math.floor(adjustedTotal / 60)
              const adjustedMinute = adjustedTotal % 60
              return (
                <span className="text-[11px] font-medium text-slate-400 tabular-nums tracking-tight">
                  {String(adjustedHour).padStart(2, '0')}:
                  {String(adjustedMinute).padStart(2, '0')}
                </span>
              )
            }

            return (
              <span className="text-[11px] font-medium text-slate-400 tabular-nums tracking-tight">
                {arg.text}
              </span>
            )
          }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          businessHours={{
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '08:00',
            endTime:   '17:00',
          }}
        />
      </div>

      {/* Modal de atendimentos simultâneos */}
      {overlapModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
          onClick={() => setOverlapModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 w-80 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold text-slate-800 leading-tight">
                  {overlapModal.events.length} atendimentos simultâneos
                </p>
                <p className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                  {overlapModal.startTime}
                </p>
              </div>
              <button
                onClick={() => setOverlapModal(null)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors text-lg leading-none mt-0.5"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {overlapModal.events.map((ev, i) => {
                const primary =
                  overlapModal.mode === 'terapeutas' ? ev.paciente  :
                  overlapModal.mode === 'pacientes'  ? ev.terapia   :
                  ev.terapia
                const secondary =
                  overlapModal.mode === 'terapeutas' ? ev.terapia   :
                  overlapModal.mode === 'pacientes'  ? ev.terapeuta :
                  ev.terapeuta
                const detail = ev.sala || ev.unidade
                return (
                  <div
                    key={i}
                    className="flex flex-col gap-0.5 px-3 py-2.5 bg-slate-50 rounded-xl border-l-4 border border-slate-100"
                    style={{ borderLeftColor: ev.borderColor }}
                  >
                    <p className="text-[12px] font-semibold text-slate-700 leading-tight">
                      {primary || '—'}
                    </p>
                    {secondary && (
                      <p className="text-[11px] text-slate-500 leading-tight">{secondary}</p>
                    )}
                    {detail && (
                      <p className="text-[10px] text-slate-400 leading-tight">{detail}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function resolveView(view: 'semana' | 'dia'): string {
  return view === 'dia' ? 'timeGridDay' : 'timeGridWeek'
}

function toWeekMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function fmt(d: Date | null): string {
  if (!d) return ''
  const h = d.getHours()
  const m = d.getMinutes()
  // Reverte o +20min aplicado em toISO para exibir o horário original do banco
  if (h >= 13) {
    const total = h * 60 + m - 20
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type SetOverlapModal = (data: { events: OverlapItem[]; startTime: string; mode: AgendaMode }) => void

function makeRenderEventContent(mode: AgendaMode, onOverlapClick: SetOverlapModal) {
  return function renderEventContent(arg: EventContentArg) {
    const { extendedProps, start } = arg.event
    const terapia      = (extendedProps.terapia      as string) || ''
    const terapeuta    = (extendedProps.terapeuta    as string) || ''
    const paciente     = (extendedProps.paciente     as string) || ''
    const unidade      = (extendedProps.unidade      as string) || ''
    const sala         = (extendedProps.sala         as string) || ''
    const status       = (extendedProps.status       as string) || ''
    const overlapCount = (extendedProps.overlapCount as number) || 0
    const overlapEvents = (extendedProps.overlapEvents as OverlapItem[]) ?? []
    const startTime    = fmt(start)

    if (extendedProps.tipo === 'intervalo') {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-[11px] font-medium text-slate-500">
            Intervalo entre turnos
          </span>
        </div>
      )
    }

    if (extendedProps.tipo === 'livre') {
      return (
        <div className="px-2.5 py-1 h-full flex flex-col justify-center gap-px overflow-hidden">
          <p className="text-[10px] font-medium text-slate-400 tracking-wide leading-none">
            Horário Livre
          </p>
          {sala && (
            <p className="text-[9px] text-slate-400 truncate leading-none mt-0.5">{sala}</p>
          )}
        </div>
      )
    }

    if (status === 'livre') {
      return (
        <div className="px-2.5 h-full flex items-center">
          <span className="text-[10px] font-medium text-slate-400 tracking-wide">
            Disponível
          </span>
        </div>
      )
    }

    if (status === 'bloqueado') {
      return (
        <div className="px-2.5 h-full flex items-center">
          <span className="text-[10px] font-medium text-slate-400 tracking-wide">
            Bloqueado
          </span>
        </div>
      )
    }

    const overlapBadge = overlapCount > 1 ? (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onOverlapClick({ events: overlapEvents, startTime, mode })
        }}
        className="absolute bottom-1 right-1.5 inline-flex items-center justify-center h-3.5 min-w-3.5 px-1.5 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors text-[8px] font-bold text-white tabular-nums leading-none cursor-pointer"
      >
        +{overlapCount - 1}
      </button>
    ) : null

    if (mode === 'terapeutas') {
      return (
        <div className="relative px-2.5 py-1 h-full flex flex-col justify-center gap-px overflow-hidden">
          <p className="font-bold text-[11px] leading-none text-slate-700 truncate">
            {paciente || '—'}
          </p>
          <p className="text-[9.5px] leading-none text-slate-500 truncate tabular-nums">
            {startTime}{sala ? ` · ${sala}` : unidade ? ` · ${unidade}` : ''}
          </p>
          <p className="text-[9.5px] leading-none text-slate-400 truncate">
            {terapia || '—'}
          </p>
          {overlapBadge}
        </div>
      )
    }

    if (mode === 'pacientes') {
      return (
        <div className="relative px-2.5 py-1 h-full flex flex-col justify-center gap-px overflow-hidden">
          <p className="font-semibold text-[11px] leading-none text-slate-700 truncate">
            {terapia || '—'}
            {startTime && (
              <span className="font-normal text-slate-400 tabular-nums"> · {startTime}</span>
            )}
          </p>
          <p className="text-[9.5px] leading-none text-slate-500 truncate">
            {terapeuta || '—'}
          </p>
          <p className="text-[9.5px] leading-none text-slate-400 truncate">
            {sala || unidade || '—'}
          </p>
          {overlapBadge}
        </div>
      )
    }

    // salas
    return (
      <div className="relative px-2.5 py-1 h-full flex flex-col justify-center gap-px overflow-hidden">
        <p className="font-bold text-[11px] leading-none text-slate-700 truncate">
          {terapeuta || '—'}
        </p>
        <p className="text-[9.5px] leading-none text-slate-500 truncate">
          {paciente || '—'}
        </p>
        <p className="text-[9.5px] leading-none text-slate-400 tabular-nums truncate">
          {startTime || '—'}
        </p>
        {overlapBadge}
      </div>
    )
  }
}
