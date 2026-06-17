"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { SK, SK_PREENCHER, DEFAULT_MCAP } from "@/lib/cronograma/constants"
import { getSupabaseClient } from "@/lib/supabase/client"
import type { CsvRow, LaudoRow, DispRow, WaMap, RecItem, InvItem, CfgState } from "@/types/cronograma"

const DEFAULT_CFG: CfgState = {
  terapiasPrio: [],
  profsPrioExtras: [],
  musicoCap: DEFAULT_MCAP,
  judicialMap: {},
  isolarAssim: false,
  apiToken: "",
}

type SavePayload = { rec: RecItem[]; inv: InvItem[]; waMap: WaMap; cfg: CfgState }

function saveLocal(data: SavePayload): { savedAt: string; savedAtIso: string; localErr: string | null } {
  const savedAt = new Date().toLocaleTimeString("pt-BR")
  const savedAtIso = new Date().toISOString()
  let localErr: string | null = null
  try {
    localStorage.setItem(SK, JSON.stringify({ ...data, savedAt, savedAtIso }))
  } catch {
    localErr = "localStorage cheio — dado não salvo localmente"
  }
  return { savedAt, savedAtIso, localErr }
}

async function saveRemote(data: SavePayload): Promise<string | null> {
  try {
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return null
    const { error } = await sb
      .from("cronograma_estado")
      .upsert(
        { user_id: user.id, dados: data, atualizado_em: new Date().toISOString() },
        { onConflict: "user_id" },
      )
    return error ? `Falha ao sincronizar: ${error.message}` : null
  } catch (e) {
    return `Falha ao sincronizar: ${(e as Error).message}`
  }
}

// Tabela remota ausente — para de tentar sincronizar após o primeiro erro de schema
let remoteTableMissing = false

function triggerSave(
  data: SavePayload,
  hasSavedRef: React.MutableRefObject<boolean>,
  setSavedAt: (v: string) => void,
  setSaveError: (v: string | null) => void,
) {
  hasSavedRef.current = true
  const { savedAt, localErr } = saveLocal(data)
  setSavedAt(savedAt)
  if (localErr) setSaveError(localErr)
  if (remoteTableMissing) return
  saveRemote(data).then(remoteErr => {
    if (remoteErr) {
      if (remoteErr.includes("cronograma_estado") || remoteErr.includes("schema cache")) {
        remoteTableMissing = true
        setSaveError("Sincronização remota desativada: tabela cronograma_estado não existe no banco. Dados salvos localmente. Execute a migration SQL para reativar.")
      } else {
        setSaveError(remoteErr)
      }
    } else if (!localErr) {
      setSaveError(null)
    }
  })
}

export interface CronogramaDataContextValue {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  dispRows: DispRow[]
  rec: RecItem[]
  inv: InvItem[]
  waMap: WaMap
  cfg: CfgState
  savedAt: string | null
  saveError: string | null
  clearSaveError: () => void
  setCRows: (rows: CsvRow[]) => void
  setLRows: (rows: LaudoRow[]) => void
  setDispRows: (rows: DispRow[]) => void
  /** Mescla o XLSX importado ao estado existente (dedup). Retorna mensagem de resultado. */
  onImport: (data: { rec: RecItem[]; inv: InvItem[]; waMap: WaMap }) => string
  sRec: (rec: RecItem[]) => void
  sInv: (inv: InvItem[]) => void
  sWa: (waMap: WaMap) => void
  sCfg: (cfg: CfgState) => void
}

const CronogramaDataContext = createContext<CronogramaDataContextValue | null>(null)

export function CronogramaDataProvider({ children }: { children: React.ReactNode }) {
  const [cRows, setCRows] = useState<CsvRow[]>([])
  const [lRows, setLRows] = useState<LaudoRow[]>([])
  const [dispRows, setDispRows] = useState<DispRow[]>([])
  const [rec, setRec] = useState<RecItem[]>([])
  const [inv, setInv] = useState<InvItem[]>([])
  const [waMap, setWaMap] = useState<WaMap>({})
  const [cfg, setCfgState] = useState<CfgState>(DEFAULT_CFG)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const hasSavedRef = useRef(false)

  const clearSaveError = useCallback(() => setSaveError(null), [])

  // Fase 1: carrega localStorage imediatamente (síncrono, sem latência)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SK)
      let waInicial: WaMap = {}
      if (raw) {
        const p = JSON.parse(raw)
        if (p.rec?.length) setRec(p.rec)
        if (p.inv?.length) setInv(p.inv)
        if (p.waMap && Object.keys(p.waMap).length) waInicial = p.waMap
        if (p.cfg) setCfgState(prev => ({ ...prev, ...p.cfg }))
        if (p.savedAt) setSavedAt(p.savedAt)
      }
      const rawPreencher = localStorage.getItem(SK_PREENCHER)
      if (rawPreencher) {
        const wp = JSON.parse(rawPreencher)
        if (wp && Object.keys(wp).length) waInicial = { ...wp, ...waInicial }
      }
      if (Object.keys(waInicial).length) setWaMap(waInicial)
    } catch {}
  }, [])

  // Fase 2: carrega do Supabase (async, sobrescreve local se remoto for mais recente)
  useEffect(() => {
    async function loadRemote() {
      try {
        const sb = getSupabaseClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) return

        const { data, error } = await sb
          .from("cronograma_estado")
          .select("dados, atualizado_em")
          .eq("user_id", user.id)
          .single()
        if (error || !data?.dados) return

        // Se o usuário já salvou durante o fetch, a versão dele é mais recente
        if (hasSavedRef.current) return

        // Compara com o timestamp ISO gravado pelo saveLocal
        const raw = localStorage.getItem(SK)
        const localIso: string | null = raw
          ? ((JSON.parse(raw) as { savedAtIso?: string }).savedAtIso ?? null)
          : null
        const remoteMs = new Date(data.atualizado_em as string).getTime()
        const localMs = localIso ? new Date(localIso).getTime() : 0
        if (remoteMs <= localMs) return  // local já é mais recente ou igual

        // Aplica dados remotos
        const p = data.dados as Partial<SavePayload> & { savedAt?: string }
        if (p.rec?.length) setRec(p.rec)
        if (p.inv?.length) setInv(p.inv)
        if (p.waMap && Object.keys(p.waMap).length) setWaMap(p.waMap)
        if (p.cfg) setCfgState(prev => ({ ...prev, ...p.cfg }))
        if (p.savedAt) setSavedAt(p.savedAt)
      } catch {}
    }
    loadRemote()
  }, [])

  const sRec = useCallback((newRec: RecItem[]) => {
    setRec(newRec)
    triggerSave({ rec: newRec, inv, waMap, cfg }, hasSavedRef, setSavedAt, setSaveError)
  }, [inv, waMap, cfg])

  const sInv = useCallback((newInv: InvItem[]) => {
    setInv(newInv)
    triggerSave({ rec, inv: newInv, waMap, cfg }, hasSavedRef, setSavedAt, setSaveError)
  }, [rec, waMap, cfg])

  const sWa = useCallback((newWaMap: WaMap) => {
    setWaMap(newWaMap)
    triggerSave({ rec, inv, waMap: newWaMap, cfg }, hasSavedRef, setSavedAt, setSaveError)
  }, [rec, inv, cfg])

  const sCfg = useCallback((newCfg: CfgState) => {
    setCfgState(newCfg)
    triggerSave({ rec, inv, waMap, cfg: newCfg }, hasSavedRef, setSavedAt, setSaveError)
  }, [rec, inv, waMap])

  const onImport = useCallback((data: { rec: RecItem[]; inv: InvItem[]; waMap: WaMap }): string => {
    const rM = [...rec]
    for (const r of data.rec) {
      if (!rM.some(x => x.paciente === r.paciente && x.profissional === r.profissional && x.dia === r.dia && x.hora === r.hora))
        rM.push(r)
    }
    const iM = [...inv]
    for (const i of data.inv) {
      if (!iM.some(x => x.paciente === i.paciente)) iM.push(i)
    }
    const wM = { ...waMap, ...data.waMap }
    setRec(rM)
    setInv(iM)
    setWaMap(wM)
    triggerSave({ rec: rM, inv: iM, waMap: wM, cfg }, hasSavedRef, setSavedAt, setSaveError)
    return `✅ ${data.rec.length} recusados + ${data.inv.length} inviáveis + ${Object.keys(data.waMap).length} status WA importados.`
  }, [rec, inv, waMap, cfg])

  const value: CronogramaDataContextValue = {
    cRows, lRows, dispRows, rec, inv, waMap, cfg, savedAt, saveError, clearSaveError,
    setCRows, setLRows, setDispRows,
    onImport, sRec, sInv, sWa, sCfg,
  }

  return (
    <CronogramaDataContext.Provider value={value}>
      {children}
    </CronogramaDataContext.Provider>
  )
}

export function useCronogramaData(): CronogramaDataContextValue {
  const ctx = useContext(CronogramaDataContext)
  if (!ctx) throw new Error("useCronogramaData deve ser usado dentro de CronogramaDataProvider")
  return ctx
}
