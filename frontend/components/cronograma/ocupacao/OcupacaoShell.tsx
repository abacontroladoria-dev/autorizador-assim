"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import Papa from "papaparse"
import { B, API_BASE } from "@/lib/cronograma/constants"
import { getRefWeek, waKey } from "@/lib/cronograma/helpers"
import { runAlgorithm } from "@/lib/cronograma/runAlgorithm"
import { exportBase } from "@/lib/cronograma/xlsx"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { VagasAgoraTab } from "./tabs/VagasAgoraTab"
import { GapsTab } from "./tabs/GapsTab"
import { GuiaTab } from "./tabs/GuiaTab"
import { AcompanhamentoTab } from "./tabs/AcompanhamentoTab"
import { InconsistenciasTab } from "./tabs/InconsistenciasTab"
import { CronModal } from "./CronModal"
import { detectarInconsistencias } from "@/lib/cronograma/inconsistencias"
import type { AlgorithmResult, CsvRow, Sugestao, WaStatus } from "@/types/cronograma"

const TABS = [
  { key: "vagas",            label: "📋 Aumentar Ocupação (Clínica)" },
  { key: "acompanhamento",   label: "📬 Acompanhamento" },
  { key: "gaps",             label: "📊 Diferença: Laudo e Oferta" },
  { key: "inconsistencias",  label: "⚠️ Inconsistências e Exceções" },
  { key: "guia",             label: "📖 Guia" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export function OcupacaoShell() {
  const { cRows, lRows, rec, inv, waMap, cfg, savedAt, saveError, clearSaveError, sRec, sInv, sWa, setCRows } = useCronogramaData()

  const searchParams = useSearchParams()
  const router = useRouter()
  const rawTab = searchParams.get("tab")
  const activeTab: TabKey = rawTab && TABS.some(t => t.key === rawTab) ? (rawTab as TabKey) : "vagas"

  const [res, setRes] = useState<AlgorithmResult | null>(null)
  const [load, setLoad] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [cRec, setCRec] = useState<Sugestao | null>(null)
  const [cInv, setCInv] = useState<Sugestao | null>(null)
  const [motInv, setMotInv] = useState("")
  const [cronPac, setCronPac] = useState<string | null>(null)

  const [apiFetch, setApiFetch] = useState(false)
  const [apiErr, setApiErr] = useState("")

  useEffect(() => {
    if (!rawTab) router.replace("/cronograma/ocupacao?tab=vagas")
  }, [rawTab])

  useEffect(() => {
    if (!cRows.length || !lRows.length) { setRes(null); return }
    setLoad(true)
    setErr(null)
    const t = setTimeout(() => {
      try {
        setRes(runAlgorithm(cRows, lRows, rec, inv, { ...cfg, waMap }))
      } catch (e) {
        setErr(`Erro: ${(e as Error).message}`)
      } finally {
        setLoad(false)
      }
    }, 50)
    return () => clearTimeout(t)
  }, [cRows, lRows, rec, inv, cfg, waMap])

  const handleWA = useCallback((s: Sugestao) => {
    sWa({ ...waMap, [waKey(s)]: "aguardando" })
  }, [waMap, sWa])

  const handleWAUndo = useCallback((s: Sugestao) => {
    const w = { ...waMap }
    delete w[waKey(s)]
    sWa(w)
  }, [waMap, sWa])

  const handleWAStatus = useCallback((s: Sugestao, status: WaStatus) => {
    sWa({ ...waMap, [waKey(s)]: status })
    if (status === "recusado") {
      sRec([...rec, {
        paciente: s.pac, profissional: s.prof, especialidade: s.esp,
        unidade: s.unidade, dia: s.dia, hora: s.hora,
        registradoEm: new Date().toLocaleDateString("pt-BR"),
      }])
    }
  }, [waMap, sWa, rec, sRec])

  const sugsByPac = useMemo(() => {
    if (!res) return {}
    const m: Record<string, Sugestao[]> = {}
    for (const s of [...res.vagasAgora, ...res.filaEspera]) {
      if (!m[s.pac]) m[s.pac] = []
      m[s.pac].push(s)
    }
    return m
  }, [res])

  const aguardando = useMemo(() => Object.values(waMap).filter(v => v === "aguardando").length, [waMap])
  const incItems = useMemo(() => detectarInconsistencias(cRows, lRows), [cRows, lRows])

  const handleApiFetch = useCallback(async () => {
    if (!cfg.apiToken) { setApiErr("Configure o token em 📖 Guia primeiro."); return }
    setApiFetch(true); setApiErr("")
    const rw = getRefWeek()
    try {
      const resp = await fetch(`${API_BASE}/integracao/csv_grade_profissionais`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-INTEGRACAO-TOKEN": cfg.apiToken },
        body: JSON.stringify({ data_inicio: rw.inicio, data_fim: rw.fim }),
      })
      if (!resp.ok) { setApiErr(`API retornou status ${resp.status}.`); return }
      const text = await resp.text()
      Papa.parse<Record<string, string>>(text, {
        header: true, skipEmptyLines: true,
        complete: (result) => {
          const rows = result.data.map(row => {
            const o: Record<string, string> = {}
            for (const [k, v] of Object.entries(row)) o[k.replace(/^﻿/, "").trim()] = v
            return o as CsvRow
          })
          setCRows(rows)
        },
      })
    } catch {
      setApiErr("CORS bloqueou a requisição. Use o upload manual do CSV.")
    } finally {
      setApiFetch(false)
    }
  }, [cfg.apiToken, setCRows])

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Status bar */}
      {(res || load || err) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px", alignItems: "center" }}>
          {res && !load && (
            <>
              <span style={{ background: B.limeLt, color: "#4a6e20", border: `1px solid ${B.lime}`, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>
                📅 {res.semanaRef}
              </span>
              {aguardando > 0 && (
                <span style={{ background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>
                  📤 {aguardando} aguardando WA
                </span>
              )}
            </>
          )}
          {load && <span style={{ fontSize: "12px", color: B.blue }}>⏳ Processando...</span>}
          {err && <span style={{ fontSize: "12px", color: "#dc2626" }}>{err}</span>}
          {savedAt && !saveError && <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>💾 {savedAt}</span>}
          {saveError && (
            <span
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
              onClick={clearSaveError}
              title="Clique para fechar"
            >
              ⚠️ {saveError}
            </span>
          )}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "vagas" && (
        <VagasAgoraTab res={res} waMap={waMap}
          onWA={handleWA} onInv={setCInv} onCron={s => setCronPac(s.pac)} />
      )}
      {activeTab === "acompanhamento" && (
        <AcompanhamentoTab res={res}
          onWA={handleWA} onWAUndo={handleWAUndo} onWAStatus={handleWAStatus}
          onRec={setCRec} onInv={setCInv} onCron={s => setCronPac(s.pac)} />
      )}
      {activeTab === "gaps" && <GapsTab res={res} />}
      {activeTab === "inconsistencias" && <InconsistenciasTab items={incItems} cRows={cRows} />}
      {activeTab === "guia" && <GuiaTab apiFetch={apiFetch} apiErr={apiErr} onApiFetch={handleApiFetch} />}

      {/* Modal Recusa */}
      {cRec && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
          onClick={e => { if (e.target === e.currentTarget) setCRec(null) }}>
          <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "20px" }}>
            <div style={{ fontWeight: 900, fontSize: "17px", marginBottom: "4px" }}>❌ Registrar Recusa</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "14px" }}>Esta combinação não será sugerida novamente.</div>
            <div style={{ background: "#fef2f2", borderRadius: "10px", padding: "12px", fontSize: "13px", marginBottom: "14px" }}>
              <div><span style={{ color: "var(--muted-foreground)", fontSize: "11px" }}>Paciente</span><br /><strong>{cRec.pac}</strong></div>
              <div style={{ marginTop: "6px" }}><span style={{ color: "var(--muted-foreground)", fontSize: "11px" }}>Sessão</span><br />{cRec.dia} {cRec.hora} · {cRec.unidade}</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => {
                sRec([...rec, { paciente: cRec.pac, profissional: cRec.prof, especialidade: cRec.esp, unidade: cRec.unidade, dia: cRec.dia, hora: cRec.hora, registradoEm: new Date().toLocaleDateString("pt-BR") }])
                setCRec(null)
              }} style={{ padding: "8px 16px", borderRadius: "10px", background: B.orange, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
                Confirmar Recusa
              </button>
              <button onClick={() => setCRec(null)} style={{ flex: 1, padding: "8px 16px", borderRadius: "10px", background: "var(--muted)", color: "var(--card-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Inviável */}
      {cInv && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
          onClick={e => { if (e.target === e.currentTarget) { setCInv(null); setMotInv("") } }}>
          <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "20px" }}>
            <div style={{ fontWeight: 900, fontSize: "17px", marginBottom: "4px" }}>⛔ Marcar como Inviável</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "14px" }}>Removido de TODAS as sugestões até tirado da lista.</div>
            <div style={{ background: "var(--muted)", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>{cInv.pac}</div>
            <textarea value={motInv} onChange={e => setMotInv(e.target.value)} placeholder="Motivo (ex: família faltando muito...)" rows={2}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "10px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", resize: "none", marginBottom: "14px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => {
                const nextWa = Object.fromEntries(Object.entries(waMap).filter(([k]) => !k.startsWith(`${cInv.pac}|||`)))
                sWa(nextWa)
                sInv([...inv, { paciente: cInv.pac, motivo: motInv, registradoEm: new Date().toLocaleDateString("pt-BR") }])
                setCInv(null); setMotInv("")
              }} style={{ padding: "8px 16px", borderRadius: "10px", background: B.navy, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
                Confirmar
              </button>
              <button onClick={() => { setCInv(null); setMotInv("") }} style={{ flex: 1, padding: "8px 16px", borderRadius: "10px", background: "var(--muted)", color: "var(--card-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cronograma */}
      {cronPac && res && (
        <CronModal pac={cronPac} sugsDosPac={sugsByPac[cronPac] || []} agendRows={res.agendRows} onClose={() => setCronPac(null)} />
      )}
    </div>
  )
}
