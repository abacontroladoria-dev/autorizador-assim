"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { SK, SK_SAIDA, SK_PREENCHER, DEFAULT_MCAP } from "@/lib/cronograma/constants"
import { getSupabaseClient } from "@/lib/supabase/client"
import type { CsvRow, LaudoRow, DispRow, WaMap, RecItem, InvItem, CfgState, StatusMap, StatusEntry } from "@/types/cronograma"

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
let saidaTableMissing = false

// ─── Saída de Profissional (statusMap → tabela compartilhada saida_aceites) ────
type SaidaRow = { paciente: string; dia: string; hora: string; terapia: string; dados: StatusEntry }

function statusMapFromRows(rows: SaidaRow[]): StatusMap {
  const m: StatusMap = {}
  for (const r of rows) {
    m[`${r.paciente}|||${r.dia}|||${r.hora}|||${r.terapia}`] = (r.dados ?? {}) as StatusEntry
  }
  return m
}

function isSaidaTableError(msg: string): boolean {
  return msg.includes("saida_aceites") || msg.includes("schema cache")
}

const SAIDA_OFFLINE_MSG =
  "Sincronização remota desativada: tabela saida_aceites não existe no banco. Dados salvos localmente. Execute a migration SQL para reativar."

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
  /** Aceites da Saída de Profissional — compartilhado entre a equipe via tabela saida_aceites */
  statusMap: StatusMap
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
  /** Grava os aceites da Saída (diff por linha contra saida_aceites). Assinatura igual ao antigo localStorage. */
  persistStatus: (map: StatusMap) => void
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
  const [statusMap, setStatusMap] = useState<StatusMap>({})
  const statusMapRef = useRef<StatusMap>({})
  statusMapRef.current = statusMap
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

  // Saída: carrega da tabela compartilhada + migra legado do localStorage uma vez
  useEffect(() => {
    async function loadSaida() {
      let legacy: StatusMap = {}
      try { legacy = JSON.parse(localStorage.getItem(SK_SAIDA) || "{}") } catch {}

      try {
        const sb = getSupabaseClient()
        const { data: { user } } = await sb.auth.getUser()
        const { data, error } = await sb
          .from("saida_aceites")
          .select("paciente,dia,hora,terapia,dados")
        if (error) {
          if (isSaidaTableError(error.message)) saidaTableMissing = true
          if (Object.keys(legacy).length) setStatusMap(legacy)
          return
        }

        const remote = statusMapFromRows((data ?? []) as SaidaRow[])

        // Migração única: chaves no localStorage que ainda não existem no banco
        const faltantes = Object.keys(legacy).filter(k => !(k in remote))
        if (faltantes.length && user) {
          const nowIso = new Date().toISOString()
          const rows = faltantes.map(k => {
            const [paciente, dia, hora, terapia] = k.split("|||")
            const entry = legacy[k]
            return { paciente, dia, hora, terapia, status: entry.status, dados: entry, criado_por: user.id, atualizado_por: user.id, atualizado_em: nowIso }
          })
          const { error: upErr } = await sb.from("saida_aceites").upsert(rows, { onConflict: "paciente,dia,hora,terapia" })
          if (!upErr) for (const k of faltantes) remote[k] = legacy[k]
        }

        setStatusMap(remote)
        try { localStorage.setItem(SK_SAIDA, JSON.stringify(remote)) } catch {}
      } catch {
        if (Object.keys(legacy).length) setStatusMap(legacy)
      }
    }
    loadSaida()
  }, [])

  // Saída: realtime — recarrega (debounced) quando outro usuário grava
  useEffect(() => {
    const sb = getSupabaseClient()
    let t: ReturnType<typeof setTimeout> | null = null
    const channel = sb
      .channel("saida_aceites_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "saida_aceites" }, () => {
        if (t) clearTimeout(t)
        t = setTimeout(async () => {
          try {
            const { data, error } = await sb
              .from("saida_aceites")
              .select("paciente,dia,hora,terapia,dados")
            if (error) return
            const m = statusMapFromRows((data ?? []) as SaidaRow[])
            setStatusMap(m)
            try { localStorage.setItem(SK_SAIDA, JSON.stringify(m)) } catch {}
          } catch {}
        }, 400)
      })
      .subscribe()
    return () => {
      if (t) clearTimeout(t)
      sb.removeChannel(channel)
    }
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

  // Grava os aceites da Saída por diff de linhas — não reescreve a tabela inteira,
  // então edições concorrentes de outros usuários não são sobrescritas.
  const persistStatus = useCallback((next: StatusMap) => {
    const prev = statusMapRef.current
    setStatusMap(next)
    try { localStorage.setItem(SK_SAIDA, JSON.stringify(next)) } catch {}

    if (saidaTableMissing) {
      setSaveError(SAIDA_OFFLINE_MSG)
      return
    }

    const upserts = Object.keys(next).filter(k => !(k in prev) || JSON.stringify(prev[k]) !== JSON.stringify(next[k]))
    const deletes = Object.keys(prev).filter(k => !(k in next))
    if (!upserts.length && !deletes.length) return

    ;(async () => {
      try {
        const sb = getSupabaseClient()
        const { data: { user } } = await sb.auth.getUser()
        const nowIso = new Date().toISOString()

        if (upserts.length) {
          const rows = upserts.map(k => {
            const [paciente, dia, hora, terapia] = k.split("|||")
            const entry = next[k]
            return { paciente, dia, hora, terapia, status: entry.status, dados: entry, atualizado_por: user?.id ?? null, atualizado_em: nowIso }
          })
          const { error } = await sb.from("saida_aceites").upsert(rows, { onConflict: "paciente,dia,hora,terapia" })
          if (error) throw error
        }

        for (const k of deletes) {
          const [paciente, dia, hora, terapia] = k.split("|||")
          const { error } = await sb.from("saida_aceites").delete().match({ paciente, dia, hora, terapia })
          if (error) throw error
        }

        setSaveError(null)
      } catch (e) {
        const msg = (e as Error).message || ""
        if (isSaidaTableError(msg)) {
          saidaTableMissing = true
          setSaveError(SAIDA_OFFLINE_MSG)
        } else {
          setSaveError(`Falha ao sincronizar saída: ${msg}`)
        }
      }
    })()
  }, [])

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
    cRows, lRows, dispRows, rec, inv, waMap, cfg, statusMap, savedAt, saveError, clearSaveError,
    setCRows, setLRows, setDispRows,
    onImport, sRec, sInv, sWa, sCfg, persistStatus,
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
