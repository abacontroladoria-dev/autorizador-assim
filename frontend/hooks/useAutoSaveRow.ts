"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

/**
 * Auto-save com debounce por "linha" (um objeto com vários campos que salvam
 * juntos num único upsert, em vez de um save por campo — evita duas edições
 * quase simultâneas na mesma linha pisarem uma na outra).
 */
export function useAutoSaveRow<T extends Record<string, unknown>>(
  initial: T,
  save: (value: T) => Promise<boolean>,
  delay = 800
) {
  const [value, setValue] = useState<T>(initial)
  const [status, setStatus] = useState<SaveStatus>("idle")

  const saveRef = useRef(save)
  saveRef.current = save
  const latestValueRef = useRef(value)
  latestValueRef.current = value
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialRef = useRef(initial)

  // Se o valor inicial mudar de fora (ex.: recarregou a lista), ressincroniza —
  // mas só quando a linha não tem edição pendente, pra não descartar digitação.
  useEffect(() => {
    if (initial !== initialRef.current) {
      initialRef.current = initial
      setStatus(curr => {
        if (curr === "idle") setValue(initial)
        return curr
      })
    }
  }, [initial])

  const update = useCallback((patch: Partial<T>) => {
    setValue(prev => {
      const next = { ...prev, ...patch }
      latestValueRef.current = next
      return next
    })
    setStatus("dirty")
    if (timerRef.current) clearTimeout(timerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    timerRef.current = setTimeout(async () => {
      setStatus("saving")
      const ok = await saveRef.current(latestValueRef.current)
      setStatus(ok ? "saved" : "error")
      if (ok) {
        savedTimerRef.current = setTimeout(() => setStatus("idle"), 2000)
      }
    }, delay)
  }, [delay])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  return { value, update, status }
}
