"use client"

import { Check, Loader2, AlertCircle } from "lucide-react"
import type { SaveStatus } from "@/hooks/useAutoSaveRow"

export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") return <span className="inline-block w-16" />
  if (status === "dirty") {
    return <span className="text-[10px] text-muted-foreground w-16 inline-block">editando…</span>
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-sky-600 dark:text-sky-400 w-16">
        <Loader2 size={10} className="animate-spin" /> salvando
      </span>
    )
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 w-16 animate-in fade-in duration-200">
        <Check size={10} /> salvo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400 w-16" title="Erro ao salvar. Tente editar o campo novamente.">
      <AlertCircle size={10} /> erro
    </span>
  )
}
