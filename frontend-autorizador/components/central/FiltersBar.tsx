'use client'

import {
  Search,
  Filter,
} from 'lucide-react'

interface Props {
  busca: string
  setBusca: (v: string) => void

  status: string
  setStatus: (v: string) => void

  unidade: string
  setUnidade: (v: string) => void

  terapeuta: string
  setTerapeuta: (v: string) => void

  convenio: string
  setConvenio: (v: string) => void

  data: string
  setData: (v: string) => void
}

export default function FiltersBar(props: Props) {
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
      <div className="
  grid
  grid-cols-[170px_1fr_170px_170px_170px_140px]
  gap-3
">

        {/* DATA */}
        <input
          type="date"
          value={props.data}
          onChange={(e) => props.setData(e.target.value)}
          className={inputClass}
        />

        {/* BUSCA */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />

          <input
            placeholder="Buscar paciente..."
            value={props.busca}
            onChange={(e) => props.setBusca(e.target.value)}
            className={`${inputClass} pl-11 w-full`}
          />
        </div>

        {/* STATUS */}
        <select
          value={props.status}
          onChange={(e) => props.setStatus(e.target.value)}
          className={inputClass}
        >
          <option value="">Todos status</option>
          <option value="autorizado">Autorizado</option>
          <option value="executando">Processando</option>
          <option value="erro">Erro</option>
          <option value="pendente">Pendente</option>
        </select>

        {/* UNIDADE */}
        <input
          placeholder="Unidade"
          value={props.unidade}
          onChange={(e) => props.setUnidade(e.target.value)}
          className={inputClass}
        />

        {/* TERAPEUTA */}
        <input
          placeholder="Terapeuta"
          value={props.terapeuta}
          onChange={(e) => props.setTerapeuta(e.target.value)}
          className={inputClass}
        />

        {/* CONVÊNIO */}
        <input
          placeholder="Convênio"
          value={props.convenio}
          onChange={(e) => props.setConvenio(e.target.value)}
          className={inputClass}
        />

      </div>
    </div>
  )
}

const inputClass = `
  h-10
  rounded-2xl
  border border-slate-200
  bg-white
  px-4
  text-sm
  outline-none
  focus:ring-4
  focus:ring-violet-100
  focus:border-violet-300
  transition
`