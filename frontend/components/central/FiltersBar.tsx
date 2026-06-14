'use client'

import { memo } from 'react'
import { Search } from 'lucide-react'

interface Props {
  busca: string
  setBusca: (v: string) => void

  horario: string
  setHorario: (v: string) => void
  horarioOpcoes: string[]

  unidade: string
  setUnidade: (v: string) => void
  unidadeOpcoes: string[]

  terapia: string
  setTerapia: (v: string) => void
  terapiaOpcoes: string[]

  profissional: string
  setProfissional: (v: string) => void
  profissionalOpcoes: string[]

  data: string
  setData: (v: string) => void
}

function FiltersBar(props: Props) {
  return (
    <div
      className="
        bg-white/90
        backdrop-blur
        border border-white/50
        rounded-2xl
        p-3
        shadow-sm
      "
    >
      <div className="flex flex-wrap items-center gap-3">

        {/* DATA */}
        <input
          type="date"
          value={props.data}
          onChange={(e) => props.setData(e.target.value)}
          className={`${inputClass} w-37.5`}
        />

        {/* HORÁRIO */}
        <select
          value={props.horario}
          onChange={(e) => props.setHorario(e.target.value)}
          className={`${inputClass} w-32.5`}
        >
          <option value="">Todos horários</option>
          {props.horarioOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* BUSCA */}
        <div className="relative flex-1 min-w-50">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />

          <input
            placeholder="Buscar paciente ou terapeuta..."
            value={props.busca}
            onChange={(e) => props.setBusca(e.target.value)}
            className={`${inputClass} pl-11 w-full`}
          />
        </div>

        {/* UNIDADE */}
        <select
          value={props.unidade}
          onChange={(e) => props.setUnidade(e.target.value)}
          className={`${inputClass} w-37.5`}
        >
          <option value="">Todas unidades</option>
          {props.unidadeOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* TERAPIA */}
        <select
          value={props.terapia}
          onChange={(e) => props.setTerapia(e.target.value)}
          className={`${inputClass} w-37.5`}
        >
          <option value="">Todas terapias</option>
          {props.terapiaOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* PROFISSIONAL */}
        <select
          value={props.profissional}
          onChange={(e) => props.setProfissional(e.target.value)}
          className={`${inputClass} w-45`}
        >
          <option value="">Todos profissionais</option>
          {props.profissionalOpcoes.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

      </div>
    </div>
  )
}

export default memo(FiltersBar)

const inputClass = `
  h-10
  rounded-2xl
  border border-slate-200
  bg-white
  px-4
  text-sm
  outline-none
  focus:ring-4
  focus:ring-emerald-100
  focus:border-emerald-300
  transition
`
