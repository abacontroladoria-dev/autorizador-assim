"use client"

import React, { useEffect, useRef, useState } from "react"
import { B } from "@/lib/cronograma/constants"

interface Props {
  title: string
  description?: React.ReactNode
  obsLabel?: string
  obsRequired?: boolean
  obsPlaceholder?: string
  confirmLabel?: string
  confirmColor?: string
  onConfirm: (obs: string) => void
  onCancel: () => void
}

export function ConfirmDialog({
  title, description, obsLabel, obsRequired, obsPlaceholder,
  confirmLabel = "Confirmar", confirmColor = "#16a34a",
  onConfirm, onCancel,
}: Props) {
  const [obs, setObs] = useState("")
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { taRef.current?.focus() }, [])

  const canConfirm = !obsRequired || obs.trim().length > 0

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
      onKeyDown={handleKey}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: "var(--card)", borderRadius: "16px",
        boxShadow: "0 16px 48px rgba(0,0,0,.22)",
        padding: "24px", width: "min(440px, 94vw)",
        display: "flex", flexDirection: "column", gap: "16px",
      }}>
        <div style={{ fontWeight: 800, fontSize: "16px", color: B.navy }}>{title}</div>

        {description && (
          <div style={{ fontSize: "13px", color: "var(--muted-foreground)", marginTop: "-8px", whiteSpace: "pre-line" }}>
            {description}
          </div>
        )}

        {obsLabel && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--card-foreground)" }}>
              {obsLabel}
              {obsRequired && <span style={{ color: "#dc2626", marginLeft: "4px" }}>*</span>}
            </label>
            <textarea
              ref={taRef}
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder={obsPlaceholder ?? ""}
              rows={3}
              style={{
                border: "1px solid var(--border)", borderRadius: "10px",
                padding: "8px 12px", fontSize: "13px",
                fontFamily: "inherit", resize: "none",
                outline: "none", boxSizing: "border-box", width: "100%",
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px", borderRadius: "10px",
              background: "var(--muted)", color: "var(--card-foreground)",
              border: "1px solid var(--border)", cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, fontSize: "13px",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => canConfirm && onConfirm(obs.trim())}
            disabled={!canConfirm}
            style={{
              padding: "8px 18px", borderRadius: "10px",
              background: canConfirm ? confirmColor : "#d1d5db",
              color: "white", border: "none",
              cursor: canConfirm ? "pointer" : "not-allowed",
              fontFamily: "inherit", fontWeight: 700, fontSize: "13px",
              opacity: canConfirm ? 1 : 0.6,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
