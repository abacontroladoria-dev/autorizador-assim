"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

export interface DraftTable {
  register: (key: string, commit: () => Promise<boolean>) => void
  unregister: (key: string) => void
  setDirty: (key: string, dirty: boolean) => void
}

/**
 * Registro de linhas "rascunho" de uma tabela — alimenta o botão único
 * "Salvar tudo" do Config (D.4: paradigma de salvamento explícito, não
 * auto-save). Cada linha se registra via useDraftRow; saveAll() commita
 * só as linhas marcadas como sujas, em paralelo.
 */
export function useDraftTable() {
  const commitsRef = useRef(new Map<string, () => Promise<boolean>>())
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const table = useMemo<DraftTable>(() => ({
    register(key, commit) {
      commitsRef.current.set(key, commit)
    },
    unregister(key) {
      commitsRef.current.delete(key)
      setDirtyKeys(prev => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    },
    setDirty(key, dirty) {
      setDirtyKeys(prev => {
        const has = prev.has(key)
        if (dirty === has) return prev
        const next = new Set(prev)
        if (dirty) next.add(key)
        else next.delete(key)
        return next
      })
    },
  }), [])

  const saveAll = useCallback(async () => {
    const keys = [...dirtyKeys]
    if (!keys.length) return { total: 0, ok: 0 }
    setSaving(true)
    const results = await Promise.all(keys.map(k => commitsRef.current.get(k)?.() ?? Promise.resolve(false)))
    setSaving(false)
    return { total: keys.length, ok: results.filter(Boolean).length }
  }, [dirtyKeys])

  return { table, dirtyCount: dirtyKeys.size, saving, saveAll }
}

/**
 * Estado local de uma linha "rascunho": edições ficam só em memória até o
 * pai commitar (via useDraftTable.saveAll, disparado pelo botão único
 * "Salvar tudo"). De propósito, NÃO salva sozinha ao desmontar — paradigma
 * de salvamento explícito (D.4): se o usuário sair sem clicar em "Salvar
 * tudo" (ou "Salvar e sair" no guard de navegação), a edição é descartada.
 */
export function useDraftRow<T extends Record<string, unknown>>(
  key: string,
  initial: T,
  save: (value: T) => Promise<boolean>,
  table: DraftTable,
) {
  const [value, setValue] = useState<T>(initial)
  const [status, setStatus] = useState<SaveStatus>("idle")

  const initialRef = useRef(initial)
  const valueRef = useRef(value)
  const saveRef = useRef(save)
  const statusRef = useRef(status)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { saveRef.current = save }, [save])
  useEffect(() => { statusRef.current = status }, [status])

  // Ressincroniza com dado externo (ex.: lista recarregada) só quando a
  // linha não tem edição pendente, pra não descartar digitação em andamento.
  // Lê o status por ref (não via updater de setStatus) para manter o updater
  // puro — setValue não pode ser efeito colateral dentro de um reducer.
  useEffect(() => {
    if (initial !== initialRef.current) {
      initialRef.current = initial
      if (statusRef.current === "idle") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- ressincroniza com dado externo assíncrono, só quando a linha não tem edição pendente
        setValue(initial)
      }
    }
  }, [initial])

  const update = useCallback((patch: Partial<T>) => {
    setValue(prev => ({ ...prev, ...patch }))
    setStatus("dirty")
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  const commit = useCallback(async () => {
    setStatus("saving")
    const ok = await saveRef.current(valueRef.current)
    if (ok) {
      initialRef.current = valueRef.current
      setStatus("saved")
      savedTimerRef.current = setTimeout(() => setStatus(curr => (curr === "saved" ? "idle" : curr)), 2000)
    } else {
      setStatus("error")
    }
    return ok
  }, [])

  useEffect(() => {
    table.register(key, commit)
    return () => {
      table.unregister(key)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [key, commit, table])

  useEffect(() => {
    table.setDirty(key, status === "dirty" || status === "error")
  }, [key, status, table])

  return { value, update, status, commit }
}
