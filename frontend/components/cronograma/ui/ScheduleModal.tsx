"use client"

// ScheduleModal — shell dos modais de grade semanal (§3 #5 do plano). Consolida
// a "moldura" idêntica de CronViewModal / ProfViewModal (Inconsistências) e
// AgendaModal (OcupProf): portal + overlay + card contido (header fixo, corpo
// rolável, footer opcional fixo). A grade e conteúdos ricos ficam como children;
// cada consumidor mantém suas células, que diferem demais para uma abstração
// única valer a pena.

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

interface ScheduleModalProps {
  title: string
  subtitle?: React.ReactNode
  /** Linha de aviso (ex.: N slots fora da unidade) — renderizada em âmbar. */
  warning?: React.ReactNode
  /** Rodapé fixo (ex.: ações Aceitar/Desfazer/Fechar). */
  footer?: React.ReactNode
  maxWidth?: number
  onClose: () => void
  children: React.ReactNode
}

export function ScheduleModal({ title, subtitle, warning, footer, maxWidth = 820, onClose, children }: ScheduleModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 animate-in fade-in duration-200 motion-reduce:animate-none"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col rounded-2xl bg-card shadow-2xl animate-in zoom-in-95 duration-200 motion-reduce:animate-none"
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[15px] font-black text-foreground">{title}</div>
            {subtitle && <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>}
            {warning && (
              <div className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">{warning}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-[13px] text-foreground transition-colors hover:bg-muted/70"
          >
            <X size={13} /> Fechar
          </button>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {children}
        </div>

        {/* Footer fixo */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
