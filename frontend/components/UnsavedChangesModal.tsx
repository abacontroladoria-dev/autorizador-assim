"use client"

import { AlertTriangle, Loader2 } from "lucide-react"

interface UnsavedChangesModalProps {
  open: boolean
  saving?: boolean
  onCancel: () => void
  onSaveAndLeave: () => void
  onDiscardAndLeave: () => void
  /**
   * Texto e rótulos do modal. Os padrões falam de "sair", que é o caso do guard
   * de navegação entre páginas do app. Quem descarta rascunho sem sair da rota
   * (ex.: trocar de página na lista paginada de contratos) passa os próprios —
   * uma ação precisa manter o mesmo nome do começo ao fim do fluxo.
   */
  descricao?: string
  labelSalvar?: string
  labelDescartar?: string
}

export function UnsavedChangesModal({
  open,
  saving = false,
  onCancel,
  onSaveAndLeave,
  onDiscardAndLeave,
  descricao = "Se sair agora sem salvar, o que você editou aqui vai se perder.",
  labelSalvar = "Salvar e sair",
  labelDescartar = "Sair sem salvar",
}: UnsavedChangesModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-changes-title">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 id="unsaved-changes-title" className="font-bold text-foreground">Você tem alterações não salvas</h2>
            <p className="text-sm text-muted-foreground mt-1">{descricao}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={saving}
            className="w-full px-3 py-2 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {labelSalvar}
          </button>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground bg-muted hover:bg-muted/70 transition-colors disabled:opacity-60"
            >
              Continuar editando
            </button>
            <button
              type="button"
              onClick={onDiscardAndLeave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 transition-colors disabled:opacity-60"
            >
              {labelDescartar}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
