'use client'

import Link from 'next/link'
import { ArrowLeft, Search, Menu } from 'lucide-react'

interface Props {
  onOpenSidebar: () => void
}

export default function CentralTopbar({ onOpenSidebar }: Props) {
  return (
    <header
      className="bg-central-topbar h-12 shrink-0 flex items-center px-4 gap-3 border-b border-border z-50"
    >
      <button
        aria-label="Abrir lista de conversas"
        onClick={onOpenSidebar}
        className="lg:hidden min-w-11 min-h-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors -ml-2"
      >
        <Menu className="size-5" />
      </button>

      <Link
        href="/"
        className="hidden lg:flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm"
      >
        <ArrowLeft className="size-4" />
        <span>Pulsar</span>
      </Link>

      <div className="hidden lg:block w-px h-5 bg-border" />

      <h1 className="text-foreground text-sm font-medium truncate">Central de Atendimento</h1>

      <div className="ml-auto flex items-center gap-2">
        <button className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/70 border border-border rounded-lg px-3 py-1.5 text-xs transition-all">
          <Search className="size-3.5" />
          <span>Buscar conversas...</span>
          <kbd className="text-muted-foreground/60 text-[10px] ml-1 font-mono">⌘K</kbd>
        </button>

        <div className="size-8 rounded-full bg-brand flex items-center justify-center text-white text-xs font-semibold cursor-pointer select-none">
          CA
        </div>
      </div>
    </header>
  )
}
