'use client'

import {
  RefreshCcw,
  Download,
} from 'lucide-react'

interface Props {
  onRefresh?: () => void
}

export default function CentralHeader({
  onRefresh,
}: Props) {

  return (

    <div className="
      flex items-center justify-between
      mb-1
    ">

      {/* ESQUERDA */}
      <div>

        <h1 className="
          text-xl
          font-bold
          text-slate-800
          tracking-tight
        ">
          Central Terapêutica
        </h1>

        <p className="
          text-sm
          text-slate-500
          mt-0.5
        ">
          Monitoramento operacional em tempo real
        </p>

      </div>

      {/* DIREITA */}
      <div className="
        flex items-center gap-3
      ">

        <button
          onClick={onRefresh}
          className="
            h-10 px-4
            rounded-xl
            border border-slate-200
            bg-white
            hover:bg-slate-50
            transition
            text-sm font-medium
            flex items-center gap-2
            shadow-sm
          "
        >
          <RefreshCcw className="w-4 h-4" />
          Atualizar
        </button>

        <button
          className="
            h-10 px-4
            rounded-xl
            bg-violet-600
            hover:bg-violet-700
            text-white
            transition
            text-sm font-medium
            flex items-center gap-2
            shadow-lg shadow-violet-200
          "
        >
          <Download className="w-4 h-4" />
          Exportar
        </button>

      </div>

    </div>
  )
}