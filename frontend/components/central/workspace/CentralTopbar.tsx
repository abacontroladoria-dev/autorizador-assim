'use client'

import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'

export default function CentralTopbar() {
  return (
    <header
      style={{ backgroundColor: 'oklch(0.17 0.015 232)' }}
      className="h-12 shrink-0 flex items-center px-4 gap-4 border-b border-white/[0.08] z-50"
    >
      <Link
        href="/"
        className="flex items-center gap-1.5 text-white/50 hover:text-white/80 transition-colors text-sm"
      >
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">Pulsar</span>
      </Link>

      <div className="w-px h-5 bg-white/[0.12]" />

      <span className="text-white/85 text-sm font-medium">Central de Atendimento</span>

      <div className="ml-auto flex items-center gap-2">
        <button className="flex items-center gap-2 text-white/40 hover:text-white/70 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs transition-all">
          <Search className="size-3.5" />
          <span className="hidden md:inline">Buscar conversas...</span>
          <kbd className="hidden md:inline text-white/25 text-[10px] ml-1 font-mono">⌘K</kbd>
        </button>

        <div className="size-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-semibold cursor-pointer select-none">
          CA
        </div>
      </div>
    </header>
  )
}
