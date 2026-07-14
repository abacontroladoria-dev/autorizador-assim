"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal"

interface Guard {
  isDirty: boolean
  save: () => Promise<boolean>
}

interface UnsavedChangesCtx {
  registerGuard: (guard: Guard | null) => void
  guardedNavigate: (path: string) => void
}

const Ctx = createContext<UnsavedChangesCtx | null>(null)

/**
 * Guarda global de "alterações não salvas" (D.4): qualquer tela pode se
 * registrar como "suja" com uma função de salvar; a navegação entre páginas
 * do app (Sidebar) passa por `guardedNavigate` em vez de `router.push` direto,
 * e some com um modal de confirmação em vez de trocar de página perdendo o
 * rascunho em silêncio.
 */
export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const guardRef = useRef<Guard | null>(null)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const registerGuard = useCallback((guard: Guard | null) => {
    guardRef.current = guard
  }, [])

  const guardedNavigate = useCallback((path: string) => {
    if (guardRef.current?.isDirty) setPendingPath(path)
    else router.push(path)
  }, [router])

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!guardRef.current?.isDirty) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [])

  async function handleSaveAndLeave() {
    if (!pendingPath) return
    setSaving(true)
    const ok = await guardRef.current?.save()
    setSaving(false)
    if (ok) {
      const path = pendingPath
      setPendingPath(null)
      router.push(path)
    }
    // Se falhar, o modal continua aberto — o toast de erro do save() já avisa o motivo.
  }

  function handleDiscardAndLeave() {
    if (pendingPath) router.push(pendingPath)
    setPendingPath(null)
  }

  function handleCancel() {
    setPendingPath(null)
  }

  return (
    <Ctx.Provider value={{ registerGuard, guardedNavigate }}>
      {children}
      <UnsavedChangesModal
        open={pendingPath !== null}
        saving={saving}
        onSaveAndLeave={handleSaveAndLeave}
        onDiscardAndLeave={handleDiscardAndLeave}
        onCancel={handleCancel}
      />
    </Ctx.Provider>
  )
}

export function useUnsavedChangesGuard() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useUnsavedChangesGuard precisa estar dentro de UnsavedChangesProvider")
  return ctx
}
