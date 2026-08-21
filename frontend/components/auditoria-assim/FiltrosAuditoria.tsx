'use client'

import { useState } from 'react'
import { CalendarDays, CalendarSearch, Clock, KeySquare, Search, SlidersHorizontal } from 'lucide-react'
import type { AuditoriaFilters } from './types'
import ModalTokenMensal from './ModalTokenMensal'

type Props = {
  filters: AuditoriaFilters
  onChange: (filters: AuditoriaFilters) => void
  /** Abre a Análise de Reincidência na semana da data filtrada, sem paciente. */
  onAbrirAnalise: () => void
}

// `NAO_SOLICITADA` aqui é o grupo (inclui Solicitação Cancelada), o mesmo
// significado que o card de KPI aplica — os dois controles escrevem no mesmo
// campo e não podem querer coisas diferentes com o mesmo valor. A entrada
// seguinte é o recorte exato de quem quer só as tentativas que quebraram.
const SITUACOES = [
  { value: 'NAO_SOLICITADA', label: 'Não Solicitadas (todas)' },
  { value: 'SOLICITACAO_CANCELADA', label: 'Solicitação Cancelada' },
  { value: 'SINCRONIZANDO', label: 'Sincronizando' },
  { value: 'RETORNO_NAO_CONFIRMADO', label: 'Retorno Não Confirmado' },
  { value: 'LIBERADA', label: 'Liberada' },
  { value: 'GLOSA', label: 'Glosa' },
  { value: 'GLOSA_RESOLVIDA', label: 'Glosa Resolvida' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'FALTA', label: 'Falta Paciente' },
  { value: 'FALTA_TERAPEUTA', label: 'Falta Terapeuta' },
]

const HORARIOS_BLOCOS = [
  { value: '08:00-08:40', label: '08:00 - 08:40' },
  { value: '08:40-09:20', label: '08:40 - 09:20' },
  { value: '09:20-10:00', label: '09:20 - 10:00' },
  { value: '10:00-10:40', label: '10:00 - 10:40' },
  { value: '10:40-11:20', label: '10:40 - 11:20' },
  { value: '11:20-12:00', label: '11:20 - 12:00' },
  { value: '13:00-13:40', label: '13:00 - 13:40' },
  { value: '13:40-14:20', label: '13:40 - 14:20' },
  { value: '14:20-15:00', label: '14:20 - 15:00' },
  { value: '15:00-15:40', label: '15:00 - 15:40' },
  { value: '15:40-16:20', label: '15:40 - 16:20' },
  { value: '16:20-17:00', label: '16:20 - 17:00' },
  { value: '17:00-17:40', label: '17:00 - 17:40' },
]

export default function FiltrosAuditoria({ filters, onChange, onAbrirAnalise }: Props) {
  const [conferenciaAberta, setConferenciaAberta] = useState(false)

  function update<K extends keyof AuditoriaFilters>(key: K, value: AuditoriaFilters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="bg-white/90 backdrop-blur border border-white/50 rounded-2xl p-3 shadow-sm">
      {/* A faixa única de seis colunas só a partir de `xl`.
          Medido: ela pede 1021px, e a área de conteúdo tem ~990px numa tela de
          1280 (a sidebar fixa come 256px) — ou seja, a barra estourava
          horizontalmente no laptop mais comum. Já estourava antes do botão de
          reincidência, abaixo de 1024; o botão novo levou o problema para o
          1280. Duas colunas no intervalo médio resolvem os dois casos sem
          apertar nenhum controle: a barra fica mais alta, nunca mais estreita
          que o conteúdo. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[180px_1fr_200px_180px_auto_auto]">

        <label className="relative">
          <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={filters.data}
            onChange={(e) => update('data', e.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        <label className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar paciente"
            value={filters.paciente}
            onChange={(e) => update('paciente', e.target.value)}
            className={`${inputClass} pl-11`}
          />
        </label>

        <label className="relative">
          <SlidersHorizontal className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={filters.situacao}
            onChange={(e) => update('situacao', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Status</option>
            {SITUACOES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="relative">
          <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={filters.horario_bloco}
            onChange={(e) => update('horario_bloco', e.target.value)}
            className={`${inputClass} pl-11`}
          >
            <option value="">Todos os horários</option>
            {HORARIOS_BLOCOS.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setConferenciaAberta(true)}
          className="flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-brand-fg px-4 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          <KeySquare size={16} />
          Conferência de Filipetas
        </button>

        {/* Brand Outline, e não um segundo preenchido: a barra já tem uma ação
            primária. Dois botões de steel cheio ao lado um do outro diriam que
            as duas são a ação principal desta tela — e nenhuma é: conferir
            filipeta é rotina diária, analisar reincidência é diagnóstico. */}
        <button
          type="button"
          onClick={onAbrirAnalise}
          title="Cota semanal por TUSS: agendado × autorizado"
          className="flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-brand bg-white px-4 text-sm font-semibold text-brand-fg transition hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <CalendarSearch size={16} />
          Reincidência
        </button>

      </div>

      <ModalTokenMensal open={conferenciaAberta} onClose={() => setConferenciaAberta(false)} />
    </div>
  )
}

const inputClass = `
  h-11
  w-full
  rounded-2xl
  border border-slate-200
  bg-white
  px-4
  text-sm
  text-slate-700
  outline-none
  focus:ring-4
  focus:ring-brand/15
  focus:border-brand
  transition
`
