'use client'

import { useRouter } from 'next/navigation'
import { Search, UserSearch, ArrowLeftRight, FileBarChart2 } from 'lucide-react'

export default function AcoesRapidas() {
  const router = useRouter()

  const handleBuscarPaciente = () => router.push('/central-pacientes')
  const handleBuscarTerapeuta = () => router.push('/central-terapeutas')

  return (
    <div className="h-full flex flex-col gap-4 rounded-xl border border-border bg-card p-5 dark:border-border/50">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground leading-tight">Ações Rápidas</p>
          <p className="text-xs text-foreground/50">Navegação operacional</p>
        </div>
      </div>

      {/* Botões empilhados verticalmente */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Buscar Paciente */}
        <button
          onClick={handleBuscarPaciente}
          className="h-12 w-full rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition bg-teal-600 hover:bg-teal-700 text-white"
        >
          <Search className="h-4 w-4" />
          <span>Buscar Paciente</span>
        </button>

        {/* Buscar Terapeuta */}
        <button
          onClick={handleBuscarTerapeuta}
          className="h-12 w-full rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <UserSearch className="h-4 w-4" />
          <span>Buscar Terapeuta</span>
        </button>

        {/* Substituições - Desabilitado */}
        <button
          disabled
          title="Em breve"
          className="h-12 w-full rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition bg-slate-100 text-slate-400 cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-500"
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span>Substituições</span>
        </button>

        {/* Relatório - Desabilitado */}
        <button
          disabled
          title="Em breve"
          className="h-12 w-full rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition bg-slate-100 text-slate-400 cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-500"
        >
          <FileBarChart2 className="h-4 w-4" />
          <span>Relatório</span>
        </button>
      </div>
    </div>
  )
}
