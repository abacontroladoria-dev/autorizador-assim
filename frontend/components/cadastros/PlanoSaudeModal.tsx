"use client"

import { useEffect, useId, useState } from "react"
import { ClipboardList, X } from "lucide-react"
import type { PlanoSaude } from "@/types/convenio"

const campo =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
const rotulo = "mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"

export function PlanoSaudeModal({
  convenioNome,
  plano,
  onSalvar,
  onClose,
}: {
  convenioNome: string
  /** Undefined = criar novo plano. Presente = editar. */
  plano?: PlanoSaude
  onSalvar: (nome: string, ativo: boolean) => Promise<void>
  onClose: () => void
}) {
  const [nome, setNome] = useState(plano?.nome ?? "")
  const [ativo, setAtivo] = useState(plano?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const tituloId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const handleSalvar = async () => {
    if (!nome.trim()) {
      setErro("Nome do plano é obrigatório.")
      return
    }
    setSaving(true)
    setErro(null)
    try {
      await onSalvar(nome.trim(), ativo)
      onClose()
    } catch (e: any) {
      setErro(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <ClipboardList size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 id={tituloId} className="flex-1 text-md font-semibold text-foreground">
            {plano ? "Editar Plano" : "Novo Plano"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-xs text-muted-foreground">Convênio: <span className="font-semibold text-foreground">{convenioNome}</span></p>

          <div>
            <label htmlFor="plano-nome" className={rotulo}>Nome do plano</label>
            <input
              id="plano-nome"
              autoFocus
              type="text"
              maxLength={100}
              placeholder="Ex.: Unimed Nacional"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className={campo}
            />
          </div>

          {plano && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Ativo
            </label>
          )}

          {erro && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={saving || !nome.trim()}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
