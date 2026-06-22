"use client"

import { useMemo, useState } from "react"
import { B, SK_SAIDA, HORAS_GRID, DIAS_LIST } from "@/lib/cronograma/constants"
import { waKey, fmtName } from "@/lib/cronograma/helpers"
import { exportBase } from "@/lib/cronograma/xlsx"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { RecusadosTab } from "./RecusadosTab"
import { InviavelTab } from "./InviavelTab"
import type { AlgorithmResult, Sugestao, WaMap, WaStatus, StatusMap, CsvRow } from "@/types/cronograma"

const SK_PROF = "aba_v8"
const SK_PAC_BUNDLES = "aba_ocup_pac_aceites_v1"
const SK_CONF = "aba_confirmados_v1"

interface ConfItem {
  pac: string; prof: string; esp: string; unidade: string
  dia: string; hora: string; origem: string; registradoEm: string
}

interface AceiteSessao {
  dia: string; hora: string; tP: string; prof: string; unidade: string
}
type SlotStatus = "confirmado" | "recusado" | "inviavel"
const SLOT_META: Record<SlotStatus, { label: string; bg: string; c: string; bd: string }> = {
  confirmado: { label: "Confirmou",  bg: "#dcfce7", c: "#14532d", bd: "#86efac" },
  recusado:   { label: "Recusou",    bg: "#fee2e2", c: "#7f1d1d", bd: "#fca5a5" },
  inviavel:   { label: "Inviável",   bg: "#f3f4f6", c: "#6b7280", bd: "#e5e7eb" },
}
interface AceitePacBundle {
  id: string; pac: string; ts: number; origem: "ocp-paciente"
  sessoes: AceiteSessao[]
  status: "pendente" | "confirmado" | "recusado"
  inviavelSlots: string[]
  slotStatus?: Record<string, SlotStatus>
}

interface Props {
  res: AlgorithmResult | null
  onWA: (s: Sugestao) => void
  onWAUndo: (s: Sugestao) => void
  onWAStatus: (s: Sugestao, st: WaStatus) => void
  onRec: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
}

type Sub = "aguardando" | "recusados" | "inviavel" | "confirmados"
type Origem = "" | "ocupacao" | "ocp-prof" | "ocp-pac" | "saida"

const ORIGEM_LABELS: Record<string, string> = {
  ocupacao:   "Aumentar Ocupação (Clínica)",
  saida:      "Saída de Profissional",
  "ocp-prof": "Aumentar Ocupação (Profissional)",
  "ocp-pac":  "Aumentar Ocupação (Paciente)",
}

export function AcompanhamentoTab({ res, onWA, onWAUndo, onWAStatus, onRec, onInv, onCron }: Props) {
  const { cRows, rec, inv, waMap, sRec, sInv, sWa } = useCronogramaData()
  const [sub, setSub] = useState<Sub>("aguardando")
  const [fOrigem, setFOrigem] = useState<Origem>("")
  const [ocupOpen, setOcupOpen] = useState(false)
  const [saidaOpen, setSaidaOpen] = useState(false)
  const [ocupProfOpen, setOcupProfOpen] = useState(false)
  const [ocupPacOpen, setOcupPacOpen] = useState(false)
  const [invModalPac, setInvModalPac] = useState<string | null>(null)
  const [invMotivo, setInvMotivo] = useState("")

  const [statusMap, setStatusMap] = useState<StatusMap>(() => {
    try { return JSON.parse(localStorage.getItem(SK_SAIDA) || "{}") } catch { return {} }
  })
  const persistStatus = (map: StatusMap) => {
    setStatusMap(map)
    try { localStorage.setItem(SK_SAIDA, JSON.stringify(map)) } catch {}
  }

  const [profMap, setProfMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(SK_PROF) || "{}") } catch { return {} }
  })
  const persistProfMap = (map: Record<string, string>) => {
    setProfMap(map)
    try { localStorage.setItem(SK_PROF, JSON.stringify(map)) } catch {}
  }

  const [pacBundles, setPacBundles] = useState<AceitePacBundle[]>(() => {
    try { return JSON.parse(localStorage.getItem(SK_PAC_BUNDLES) || "[]") } catch { return [] }
  })
  const persistPacBundles = (bundles: AceitePacBundle[]) => {
    setPacBundles(bundles)
    try { localStorage.setItem(SK_PAC_BUNDLES, JSON.stringify(bundles)) } catch {}
  }

  const [conf, setConf] = useState<ConfItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(SK_CONF) || "[]") } catch { return [] }
  })
  const persistConf = (items: ConfItem[]) => {
    setConf(items)
    try { localStorage.setItem(SK_CONF, JSON.stringify(items)) } catch {}
  }

  const hoje = () => new Date().toLocaleDateString("pt-BR")

  // waMap "aguardando" items — cross-reference with res for full details
  const aguardandoOcup = useMemo(() => {
    const allSugs = [...(res?.vagasAgora ?? []), ...(res?.filaEspera ?? [])]
    return Object.entries(waMap)
      .filter(([, v]) => v === "aguardando")
      .map(([key]) => {
        const [pac, prof, dia, hora] = key.split("|||")
        const sug = allSugs.find(s => waKey(s) === key) ?? null
        return { key, pac, prof, dia, hora, sug }
      })
  }, [waMap, res])

  const aguardandoSaidaItems = Object.entries(statusMap).filter(([, v]) => v.status === "aguardando")
  const aguardandoSaidaCount = aguardandoSaidaItems.length
  const aguardandoProfItems = Object.entries(profMap).filter(([, v]) => v === "acompanhamento")
  const aguardandoPacBundles = pacBundles.filter(b => b.status === "pendente")
  const aguardandoCount = aguardandoOcup.length + aguardandoSaidaCount + aguardandoProfItems.length + aguardandoPacBundles.length

  const SUBS: { key: Sub; label: string; count: number }[] = [
    { key: "aguardando",  label: "Aguardando Resposta", count: aguardandoCount },
    { key: "confirmados", label: "Confirmados",          count: conf.length },
    { key: "recusados",   label: "Recusados",            count: rec.length },
    { key: "inviavel",    label: "Inviáveis",             count: inv.length },
  ]

  function handleOcupAceito(key: string, sug: { pac: string; prof: string; tP?: string; esp?: string; unidade?: string; dia?: string; hora?: string } | null) {
    sWa({ ...waMap, [key]: "aceito" as WaStatus })
    if (sug) {
      const [, , dia, hora] = key.split("|||")
      persistConf([...conf, { pac: sug.pac, prof: sug.prof, esp: sug.tP ?? sug.esp ?? "", unidade: sug.unidade ?? "", dia: sug.dia ?? dia, hora: sug.hora ?? hora, origem: "Ocp. Clínica", registradoEm: hoje() }])
    }
  }
  function handleOcupRecusado(key: string, sug: Sugestao | null) {
    const next = { ...waMap, [key]: "recusado" as WaStatus }
    sWa(next)
    if (sug) {
      sRec([...rec, {
        paciente: sug.pac, profissional: sug.prof, especialidade: sug.esp,
        unidade: sug.unidade, dia: sug.dia, hora: sug.hora,
        registradoEm: new Date().toLocaleDateString("pt-BR"),
      }])
    }
  }
  function handleOcupCancelar(key: string) {
    const next = { ...waMap }
    delete next[key]
    sWa(next)
  }
  function handleOcupInviavel(pac: string) {
    setInvModalPac(pac)
    setInvMotivo("")
  }
  function confirmarInviavel() {
    if (!invModalPac) return
    const next = Object.fromEntries(Object.entries(waMap).filter(([k]) => !k.startsWith(`${invModalPac}|||`)))
    sWa(next)
    sInv([...inv, { paciente: invModalPac, motivo: invMotivo, registradoEm: new Date().toLocaleDateString("pt-BR") }])
    setInvModalPac(null)
    setInvMotivo("")
  }

  function handleProfConfirmar(key: string) {
    persistProfMap({ ...profMap, [key]: "aceito" })
    const [pac, prof, dia, hora] = key.split("|||")
    persistConf([...conf, { pac, prof, esp: "", unidade: "", dia, hora, origem: "Ocp. Profissional", registradoEm: hoje() }])
  }
  function handleProfRecusar(key: string) {
    persistProfMap({ ...profMap, [key]: "recusado" })
    const [pac, prof, dia, hora] = key.split("|||")
    sRec([...rec, { paciente: pac, profissional: prof, especialidade: "", unidade: "", dia, hora, registradoEm: hoje() }])
  }
  function handleProfInviavel(key: string) {
    persistProfMap({ ...profMap, [key]: "inviavel" })
    const [pac, prof, dia, hora] = key.split("|||")
    sInv([...inv, { paciente: pac, motivo: `${prof} (Ocp. Profissional)`, dia, hora, registradoEm: hoje() }])
  }
  function handleProfCancelar(key: string) {
    const next = { ...profMap }
    delete next[key]
    persistProfMap(next)
  }

  function handlePacCancelar(id: string) {
    persistPacBundles(pacBundles.filter(b => b.id !== id))
  }
  function handlePacSlotStatus(id: string, slotKey: string, status: SlotStatus | null) {
    const bundle = pacBundles.find(b => b.id === id)
    const sessao = bundle?.sessoes.find(s => `${s.dia}|||${s.hora}` === slotKey)
    persistPacBundles(pacBundles.map(b => {
      if (b.id !== id) return b
      const slotStatus = { ...(b.slotStatus ?? {}) }
      if (status === null) delete slotStatus[slotKey]
      else slotStatus[slotKey] = status
      return { ...b, slotStatus }
    }))
    if (bundle && sessao && status) {
      const d = hoje()
      if (status === "confirmado")
        persistConf([...conf, { pac: bundle.pac, prof: sessao.prof, esp: sessao.tP, unidade: sessao.unidade, dia: sessao.dia, hora: sessao.hora, origem: "Ocp. Paciente", registradoEm: d }])
      else if (status === "recusado")
        sRec([...rec, { paciente: bundle.pac, profissional: sessao.prof, especialidade: sessao.tP, unidade: sessao.unidade, dia: sessao.dia, hora: sessao.hora, registradoEm: d }])
      else if (status === "inviavel")
        sInv([...inv, { paciente: bundle.pac, motivo: sessao.tP, dia: sessao.dia, hora: sessao.hora, registradoEm: d }])
    }
  }
  function handlePacSlotRemove(id: string, slotKey: string) {
    persistPacBundles(pacBundles.map(b => {
      if (b.id !== id) return b
      const sessoes = b.sessoes.filter(s => `${s.dia}|||${s.hora}` !== slotKey)
      const slotStatus = { ...(b.slotStatus ?? {}) }
      delete slotStatus[slotKey]
      return { ...b, sessoes, slotStatus }
    }))
  }
  function handlePacBulkStatus(id: string, status: SlotStatus | "cancelar") {
    if (status === "cancelar") { handlePacCancelar(id); return }
    const bundle = pacBundles.find(b => b.id === id)
    persistPacBundles(pacBundles.map(b => {
      if (b.id !== id) return b
      const slotStatus: Record<string, SlotStatus> = {}
      for (const s of b.sessoes) slotStatus[`${s.dia}|||${s.hora}`] = status
      const bundleStatus = status === "confirmado" ? "confirmado" as const
        : status === "recusado" ? "recusado" as const : b.status
      return { ...b, slotStatus, status: bundleStatus }
    }))
    if (!bundle) return
    const d = hoje()
    if (status === "confirmado")
      persistConf([...conf, ...bundle.sessoes.map(s => ({ pac: bundle.pac, prof: s.prof, esp: s.tP, unidade: s.unidade, dia: s.dia, hora: s.hora, origem: "Ocp. Paciente", registradoEm: d }))])
    else if (status === "recusado")
      sRec([...rec, ...bundle.sessoes.map(s => ({ paciente: bundle.pac, profissional: s.prof, especialidade: s.tP, unidade: s.unidade, dia: s.dia, hora: s.hora, registradoEm: d }))])
    else if (status === "inviavel")
      sInv([...inv, ...bundle.sessoes.map(s => ({ paciente: bundle.pac, motivo: s.tP, dia: s.dia, hora: s.hora, registradoEm: d }))])
  }

  function handleSaidaConfirmar(key: string) {
    const val = statusMap[key]
    if (!val) return
    persistStatus({ ...statusMap, [key]: { ...val, status: "resolvido" as any, atualizadoEm: Date.now() } })
    const [pac, dia, hora, terapia] = key.split("|||")
    const [profRes, diaRes, horaRes] = (val.slotReservado || "|||").split("|||")
    persistConf([...conf, { pac, prof: profRes || "", esp: terapia, unidade: "", dia: diaRes || dia, hora: horaRes || hora, origem: "Saída Profissional", registradoEm: hoje() }])
  }
  function handleSaidaRecusar(key: string) {
    const val = statusMap[key]
    if (!val) return
    persistStatus({ ...statusMap, [key]: { ...val, status: "recusado" as any, slotReservado: null, atualizadoEm: Date.now() } })
    const [pac, dia, hora, terapia] = key.split("|||")
    const [profRes] = (val.slotReservado || "|||").split("|||")
    sRec([...rec, { paciente: pac, profissional: profRes || "", especialidade: terapia, unidade: "", dia, hora, registradoEm: hoje() }])
  }
  function handleSaidaInviavel(key: string) {
    const val = statusMap[key]
    if (!val) return
    persistStatus({ ...statusMap, [key]: { ...val, status: "sem_solucao" as any, atualizadoEm: Date.now() } })
    const [pac, dia, hora, terapia] = key.split("|||")
    sInv([...inv, { paciente: pac, motivo: `${terapia} (Saída Profissional)`, dia, hora, registradoEm: hoje() }])
  }
  function handleSaidaCancelar(key: string) {
    const next = { ...statusMap }
    delete next[key]
    persistStatus(next)
  }

  function handleExportCSV() {
    const L: string[][] = [["Origem", "Paciente", "Terapia/Especialidade", "Profissional", "Dia", "Hora", "Status"]]
    for (const [key, status] of Object.entries(waMap)) {
      const [pac, prof, dia, hora] = key.split("|||")
      L.push(["Ocp. Clínica", pac, "", prof, dia, hora, status])
    }
    for (const [key, status] of Object.entries(profMap)) {
      const [pac, prof, dia, hora] = key.split("|||")
      L.push(["Ocp. Profissional", pac, "", prof, dia, hora, status])
    }
    for (const bundle of pacBundles) {
      for (const s of bundle.sessoes) {
        const slotKey = `${s.dia}|||${s.hora}`
        const st = (bundle.slotStatus ?? {})[slotKey] ?? (bundle.inviavelSlots?.includes(slotKey) ? "inviavel" : null)
        L.push(["Ocp. Paciente", bundle.pac, s.tP, s.prof, s.dia, s.hora, st ?? bundle.status])
      }
    }
    for (const [key, val] of Object.entries(statusMap)) {
      const [pac, dia, hora, terapia] = key.split("|||")
      const [profRes, diaRes, horaRes] = (val.slotReservado || "|||").split("|||")
      L.push(["Saída Profissional", pac, terapia, profRes || "", diaRes || dia, horaRes || hora, val.status || "pendente"])
    }
    const csv = L.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent("﻿" + csv)
    a.download = "aceites_e_recusas.csv"
    a.click()
  }

  const showOcup     = fOrigem === "" || fOrigem === "ocupacao"
  const showSaida    = fOrigem === "" || fOrigem === "saida"
  const showOcupProf = fOrigem === "" || fOrigem === "ocp-prof"
  const showOcupPac  = fOrigem === "" || fOrigem === "ocp-pac"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Sub-abas + Export */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        {SUBS.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)} style={{
            padding: "7px 14px", borderRadius: "10px",
            border: `1px solid ${sub === s.key ? B.blue : "#e5e7eb"}`,
            background: sub === s.key ? B.blueLt : "white",
            color: sub === s.key ? B.blue : "#6b7280",
            fontWeight: 700, fontSize: "12px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            {s.label}
            {s.count > 0 && (
              <span style={{
                background: sub === s.key ? B.blue : "#e5e7eb",
                color: sub === s.key ? "white" : "#6b7280",
                borderRadius: "999px", padding: "0 6px", fontSize: "11px", fontWeight: 800,
              }}>
                {s.count}
              </span>
            )}
          </button>
        ))}
        <button onClick={handleExportCSV} style={{ marginLeft: "auto", fontSize: "11px", padding: "6px 12px", borderRadius: "9px", background: "white", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer", fontWeight: 600 }}>
          ↓ Exportar CSV
        </button>
      </div>

      {/* Conteúdo */}
      {sub === "aguardando" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Filtro por origem */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600 }}>Filtrar por origem:</span>
            {(["", "ocupacao", "ocp-prof", "ocp-pac", "saida"] as Origem[]).map(o => (
              <button key={o} onClick={() => setFOrigem(o)} style={{
                padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
                border: `1px solid ${fOrigem === o ? B.blue : "#e5e7eb"}`,
                background: fOrigem === o ? B.blueLt : "white",
                color: fOrigem === o ? B.blue : "#6b7280",
                cursor: "pointer",
              }}>
                {o === "" ? "Todas origens" : ORIGEM_LABELS[o]}
              </button>
            ))}
          </div>

          {aguardandoCount === 0 && (
            <div style={{ background: "white", borderRadius: "14px", border: "2px dashed #e5e7eb", padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>📬</div>
              <div style={{ color: "#9ca3af", fontSize: "14px" }}>Nenhum item aguardando resposta</div>
            </div>
          )}

          {/* Seção Aumentar Ocupação (Clínica) */}
          {showOcup && aguardandoOcup.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setOcupOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: B.blueLt, border: `1px solid ${B.blue}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.blue, fontWeight: 700, flex: 1 }}>
                  📋 Aumentar Ocupação (Clínica) · {aguardandoOcup.length}
                </span>
                <span style={{ fontSize: "11px", color: B.blue }}>{ocupOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              {ocupOpen && aguardandoOcup.map(({ key, pac, prof, dia, hora, sug }) => (
                <OcupItem key={key}
                  pac={pac} prof={prof} dia={dia} hora={hora}
                  esp={sug?.esp} unidade={sug?.unidade} tP={sug?.tP} conv={sug?.conv}
                  onAceito={() => handleOcupAceito(key, sug)}
                  onRecusado={() => handleOcupRecusado(key, sug)}
                  onInviavel={() => handleOcupInviavel(pac)}
                  onCancelar={() => handleOcupCancelar(key)}
                  onVer={() => sug && onCron(sug)}
                />
              ))}
            </div>
          )}

          {/* Seção Aumentar Ocupação (Profissional) */}
          {showOcupProf && aguardandoProfItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setOcupProfOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: B.orangeLt, border: `1px solid ${B.orange}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.orange, fontWeight: 700, flex: 1 }}>
                  📊 Aumentar Ocupação (Profissional) · {aguardandoProfItems.length}
                </span>
                <span style={{ fontSize: "11px", color: B.orange }}>{ocupProfOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              {ocupProfOpen && aguardandoProfItems.map(([key]) => {
                const [pac, prof, dia, hora] = key.split("|||")
                return (
                  <ProfItem key={key} pac={pac} prof={prof} dia={dia} hora={hora}
                    onConfirmar={() => handleProfConfirmar(key)}
                    onRecusar={() => handleProfRecusar(key)}
                    onInviavel={() => handleProfInviavel(key)}
                    onCancelar={() => handleProfCancelar(key)}
                  />
                )
              })}
            </div>
          )}

          {/* Seção Aumentar Ocupação (Paciente) */}
          {showOcupPac && aguardandoPacBundles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setOcupPacOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: B.limeLt, border: `1px solid ${B.lime}88`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: "#4d7c0f", fontWeight: 700, flex: 1 }}>
                  👤 Aumentar Ocupação (Paciente) · {aguardandoPacBundles.length}
                </span>
                <span style={{ fontSize: "11px", color: "#4d7c0f" }}>{ocupPacOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              {ocupPacOpen && aguardandoPacBundles.map(bundle => (
                <PacBundleItem key={bundle.id} bundle={bundle} cRows={cRows}
                  onCancelar={() => handlePacCancelar(bundle.id)}
                  onSlotStatus={(slotKey, st) => handlePacSlotStatus(bundle.id, slotKey, st)}
                  onSlotRemove={(slotKey) => handlePacSlotRemove(bundle.id, slotKey)}
                  onBulkStatus={(st) => handlePacBulkStatus(bundle.id, st)}
                />
              ))}
            </div>
          )}

          {/* Seção Saída de Profissional */}
          {showSaida && aguardandoSaidaCount > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setSaidaOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f5f3ff", border: `1px solid ${B.purple}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.purple, fontWeight: 700, flex: 1 }}>
                  🚪 Saída de Profissional · {aguardandoSaidaCount}
                </span>
                <span style={{ fontSize: "11px", color: B.purple }}>{saidaOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              {saidaOpen && aguardandoSaidaItems.map(([key, val]) => {
                const [pac, dia, hora, terapia] = key.split("|||")
                const [profRes, diaRes, horaRes] = (val.slotReservado || "|||").split("|||")
                return (
                  <SaidaItem key={key}
                    pac={pac} dia={dia} hora={hora} terapia={terapia}
                    profRes={profRes} diaRes={diaRes} horaRes={horaRes} obs={val.obs}
                    onConfirmar={() => handleSaidaConfirmar(key)}
                    onRecusar={() => handleSaidaRecusar(key)}
                    onInviavel={() => handleSaidaInviavel(key)}
                    onCancelar={() => handleSaidaCancelar(key)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {sub === "confirmados" && (
        <ConfirmadosTab conf={conf} onRemove={i => persistConf(conf.filter((_, j) => j !== i))} />
      )}
      {sub === "recusados" && (
        <RecusadosTab rec={rec} inv={inv} waMap={waMap}
          onRemove={i => sRec(rec.filter((_, j) => j !== i))}
          onExport={() => exportBase(rec, inv, waMap)} />
      )}
      {sub === "inviavel" && (
        <InviavelTab inv={inv} rec={rec} waMap={waMap}
          onRemove={i => sInv(inv.filter((_, j) => j !== i))}
          onExport={() => exportBase(rec, inv, waMap)} />
      )}

      {/* Modal Inviável (waMap items) */}
      {invModalPac && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
          onClick={e => { if (e.target === e.currentTarget) { setInvModalPac(null); setInvMotivo("") } }}>
          <div style={{ background: "white", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "20px" }}>
            <div style={{ fontWeight: 900, fontSize: "17px", marginBottom: "4px" }}>⛔ Marcar como Inviável</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "10px" }}>Removido de TODAS as sugestões até tirado da lista.</div>
            <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>{invModalPac}</div>
            <textarea value={invMotivo} onChange={e => setInvMotivo(e.target.value)} placeholder="Motivo (ex: família faltando muito...)" rows={2}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", resize: "none", marginBottom: "14px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={confirmarInviavel} style={{ padding: "8px 16px", borderRadius: "10px", background: B.navy, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
                Confirmar
              </button>
              <button onClick={() => { setInvModalPac(null); setInvMotivo("") }} style={{ flex: 1, padding: "8px 16px", borderRadius: "10px", background: "#f3f4f6", color: "#374151", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfirmadosTab({ conf, onRemove }: { conf: ConfItem[]; onRemove: (i: number) => void }) {
  return (
    <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid #f0f0f0", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontWeight: 800, color: B.navy }}>✅ Confirmados</span>
        <span style={{ fontSize: "12px", color: "#9ca3af" }}>{conf.length} registros · 💾</span>
      </div>
      {!conf.length ? (
        <div style={{ borderRadius: "10px", border: "2px dashed #e5e7eb", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "6px" }}>📭</div>
          <div style={{ color: "#9ca3af", fontSize: "13px" }}>Nenhuma confirmação registrada</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {["Paciente", "Profissional", "Especialidade", "Dia", "Hora", "Origem", "Registrado", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conf.map((c, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: B.navy }}>{c.pac}</td>
                  <td style={{ padding: "8px 12px", color: "#6b7280", fontSize: "12px" }}>{fmtName(c.prof)}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: "#dcfce7", color: "#14532d", borderRadius: "999px", padding: "2px 8px", fontSize: "11px" }}>{c.esp || "—"}</span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "#6b7280", fontSize: "12px" }}>{c.dia}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: "12px" }}>{c.hora}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: B.limeLt, color: "#4d7c0f", borderRadius: "999px", padding: "2px 8px", fontSize: "11px", border: `1px solid ${B.lime}88` }}>{c.origem}</span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "#9ca3af", fontSize: "11px" }}>{c.registradoEm}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <button onClick={() => onRemove(i)} style={{ fontSize: "11px", color: "#16a34a", background: "none", border: "none", cursor: "pointer" }}>remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ProfItem({
  pac, prof, dia, hora, onConfirmar, onRecusar, onInviavel, onCancelar,
}: {
  pac: string; prof: string; dia: string; hora: string
  onConfirmar: () => void; onRecusar: () => void; onInviavel: () => void; onCancelar: () => void
}) {
  return (
    <div style={{ background: B.orangeLt, border: `1px solid ${B.orange}33`, borderRadius: "12px", padding: "10px 14px" }}>
      <div style={{ marginBottom: "6px" }}>
        <span style={{ background: B.orangeLt, color: B.orange, border: `1px solid ${B.orange}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
          📊 Aumentar Ocupação (Profissional)
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "13px", color: B.navy }}>{pac}</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{prof}</div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: B.navy, marginTop: "2px" }}>{dia} {hora}</div>
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button onClick={onConfirmar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontWeight: 700 }}>
            Responsável Confirmou
          </button>
          <button onClick={onRecusar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer", fontWeight: 700 }}>
            Recusou
          </button>
          <button onClick={onInviavel} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer", fontWeight: 700 }}>
            Inviável
          </button>
          <button onClick={onCancelar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "white", color: "#9ca3af", border: "1px solid #e5e7eb", cursor: "pointer" }}
            title="Desfaz o aceite — volta como sugestão em Aumentar Ocupação (Profissional)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function PacBundleItem({
  bundle, cRows, onCancelar, onSlotStatus, onSlotRemove, onBulkStatus,
}: {
  bundle: AceitePacBundle
  cRows: CsvRow[]
  onCancelar: () => void
  onSlotStatus: (slotKey: string, status: SlotStatus | null) => void
  onSlotRemove: (slotKey: string) => void
  onBulkStatus: (status: SlotStatus | "cancelar") => void
}) {
  const [showVer, setShowVer] = useState(false)
  const dt = new Date(bundle.ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  const slotStatus = bundle.slotStatus ?? {}

  const smBtn = (bg: string, c: string, bd: string, active?: boolean) => ({
    fontSize: "10px", padding: "2px 7px", borderRadius: "6px", cursor: "pointer",
    whiteSpace: "nowrap" as const, fontFamily: "inherit",
    background: active ? bg : "#f9fafb", color: active ? c : "#9ca3af",
    border: `1px solid ${active ? bd : "#e5e7eb"}`, fontWeight: active ? 700 : 500,
  })

  return (
    <div style={{ background: B.limeLt, border: `1px solid ${B.lime}88`, borderRadius: "12px", padding: "10px 14px" }}>

      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ background: B.limeLt, color: "#4d7c0f", border: `1px solid ${B.lime}88`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
            👤 Aumentar Ocupação (Paciente)
          </span>
          <span style={{ fontSize: "11px", color: "#6b7280" }}>{dt}</span>
        </div>
        <button onClick={() => setShowVer(true)} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "white", color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
          🗓 Ver
        </button>
      </div>

      <div style={{ fontWeight: 800, fontSize: "13px", color: B.navy, marginBottom: "8px" }}>{bundle.pac}</div>

      {/* Sessões individuais */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
        {bundle.sessoes.map(s => {
          const slotKey = `${s.dia}|||${s.hora}`
          const st = slotStatus[slotKey] as SlotStatus | undefined
          const meta = st ? SLOT_META[st] : null
          const rowBg = st === "confirmado" ? "#f0fdf4" : st === "recusado" ? "#fff1f2" : st === "inviavel" ? "#f9fafb" : "white"
          const rowBd = st === "confirmado" ? "#86efac" : st === "recusado" ? "#fca5a5" : st === "inviavel" ? "#e5e7eb" : "#d1fae5"
          return (
            <div key={slotKey} style={{ background: rowBg, borderRadius: "8px", padding: "6px 10px", border: `1px solid ${rowBd}`, opacity: st === "inviavel" ? 0.7 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: "12px", color: B.navy }}>{s.dia.replace("-feira", "")} {s.hora}</span>
                  <span style={{ fontSize: "11px", color: "#374151", marginLeft: "6px" }}>{s.tP}</span>
                  <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "4px" }}>· {fmtName(s.prof)}</span>
                  {meta && (
                    <span style={{ marginLeft: "8px", fontSize: "9px", fontWeight: 800, padding: "1px 5px", borderRadius: "4px", background: meta.bg, color: meta.c, border: `1px solid ${meta.bd}` }}>
                      {meta.label}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "3px", flexWrap: "wrap", flexShrink: 0 }}>
                  <button onClick={() => onSlotStatus(slotKey, st === "confirmado" ? null : "confirmado")}
                    style={smBtn("#dcfce7", "#14532d", "#86efac", st === "confirmado")}>✓ Confirmou</button>
                  <button onClick={() => onSlotStatus(slotKey, st === "recusado" ? null : "recusado")}
                    style={smBtn("#fee2e2", "#7f1d1d", "#fca5a5", st === "recusado")}>✗ Recusou</button>
                  <button onClick={() => onSlotStatus(slotKey, st === "inviavel" ? null : "inviavel")}
                    style={smBtn("#f3f4f6", "#6b7280", "#e5e7eb", st === "inviavel")}>⛔ Inviável</button>
                  <button onClick={() => onSlotRemove(slotKey)}
                    style={{ ...smBtn("#fef2f2", "#dc2626", "#fca5a5"), color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5" }}>× Cancelar</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Ações em lote */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", borderTop: "1px solid #d1fae5", paddingTop: "8px", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: "#6b7280", fontWeight: 600, marginRight: "2px" }}>Tudo:</span>
        <button onClick={() => onBulkStatus("confirmado")} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
          ✓ Responsável confirmou tudo
        </button>
        <button onClick={() => onBulkStatus("recusado")} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
          ✗ Responsável recusou tudo
        </button>
        <button onClick={() => onBulkStatus("inviavel")} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
          ⛔ Tudo inviável
        </button>
        <button onClick={onCancelar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "white", color: "#9ca3af", border: "1px solid #e5e7eb", cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}
          title="Remove este lote da lista">
          Cancelar tudo
        </button>
      </div>

      {showVer && (
        <PacVerModal pac={bundle.pac} cRows={cRows} bundle={bundle} onClose={() => setShowVer(false)} />
      )}
    </div>
  )
}

function PacVerModal({ pac, cRows, bundle, onClose }: {
  pac: string; cRows: CsvRow[]; bundle: AceitePacBundle; onClose: () => void
}) {
  const DIAS_UTIL = DIAS_LIST.slice(0, 5)
  const DIAS_ABR: Record<string, string> = {
    "Segunda-feira": "Segunda", "Terça-feira": "Terça", "Quarta-feira": "Quarta",
    "Quinta-feira": "Quinta", "Sexta-feira": "Sexta",
  }

  // Sessões existentes do paciente
  const existMap: Record<string, { tP: string; prof: string }[]> = {}
  for (const r of cRows) {
    if (String(r["Nome Favorecido"] ?? "") !== pac) continue
    if (String(r["Status do Agendamento"]) !== "Agendado") continue
    const h = String(r.HI_str ?? r["Hora Inicial"] ?? "").slice(0, 5)
    if (!h) continue
    const k = `${r["Dia da Semana"]}|||${h}`
    if (!existMap[k]) existMap[k] = []
    existMap[k].push({ tP: String(r["Terapia"] ?? ""), prof: String(r["Profissional"] ?? "") })
  }

  // Sessões do lote
  const slotStatus = bundle.slotStatus ?? {}
  const bundleMap: Record<string, { sessao: AceiteSessao; st: SlotStatus | "pendente" }> = {}
  for (const s of bundle.sessoes) {
    const k = `${s.dia}|||${s.hora}`
    bundleMap[k] = { sessao: s, st: (slotStatus[k] as SlotStatus) ?? "pendente" }
  }

  const activeHoras = HORAS_GRID.filter(h =>
    DIAS_UTIL.some(d => (existMap[`${d}|||${h}`]?.length ?? 0) > 0 || bundleMap[`${d}|||${h}`])
  )

  function cellBg(st: "exist" | "pendente" | SlotStatus) {
    if (st === "exist")      return "#f8fafc"
    if (st === "pendente")   return B.limeLt
    return SLOT_META[st].bg
  }
  function cellBd(st: "exist" | "pendente" | SlotStatus) {
    if (st === "exist")      return "#e2e8f0"
    if (st === "pendente")   return B.lime
    return SLOT_META[st].bd
  }
  function cellLabel(st: "pendente" | SlotStatus) {
    if (st === "pendente") return "Proposta"
    return SLOT_META[st].label
  }
  function cellLabelColor(st: "pendente" | SlotStatus) {
    if (st === "pendente") return "#4d7c0f"
    return SLOT_META[st].c
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "12px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "white", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "880px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Cabeçalho */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f0f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#fafafa", borderRadius: "18px 18px 0 0" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "15px", color: B.navy }}>🗓 {pac}</div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>Agenda existente + propostas enviadas para acompanhamento</div>
            <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
              {([["exist", "Existente"], ["pendente", "Proposta"], ["confirmado", "Confirmou"], ["recusado", "Recusou"], ["inviavel", "Inviável"]] as [string, string][]).map(([k, lbl]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#6b7280" }}>
                  <span style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "2px", background: cellBg(k as any), border: `1px solid ${cellBd(k as any)}` }} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", fontSize: "18px", color: "#6b7280", flexShrink: 0 }}>×</button>
        </div>

        {/* Grid */}
        <div style={{ overflow: "auto", padding: "16px" }}>
          {!activeHoras.length ? (
            <div style={{ textAlign: "center", color: "#9ca3af", padding: "32px" }}>Nenhuma sessão encontrada.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: `${52 + DIAS_UTIL.length * 130}px` }}>
              <colgroup>
                <col style={{ width: "48px" }} />
                {DIAS_UTIL.map(d => <col key={d} style={{ width: "130px" }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ paddingBottom: "8px", textAlign: "right", paddingRight: "8px", fontSize: "11px", color: "#9ca3af", fontWeight: 400 }}>Hora</th>
                  {DIAS_UTIL.map(d => (
                    <th key={d} style={{ paddingBottom: "8px", textAlign: "center", fontSize: "13px", color: B.navy, fontWeight: 800 }}>
                      {DIAS_ABR[d] ?? d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeHoras.map(hora => (
                  <tr key={hora} style={{ borderTop: hora === "13:00" ? "2px solid #d1d5db" : "1px solid #f1f5f9" }}>
                    <td style={{ textAlign: "right", paddingRight: "8px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "13px", fontWeight: 800, color: B.navy }}>{hora}</td>
                    {DIAS_UTIL.map(d => {
                      const k = `${d}|||${hora}`
                      const exists = existMap[k] ?? []
                      const bp = bundleMap[k]
                      return (
                        <td key={d} style={{ padding: "2px", verticalAlign: "top" }}>
                          {exists.map((e, i) => (
                            <div key={i} style={{ background: cellBg("exist"), border: `1px solid ${cellBd("exist")}`, borderRadius: "7px", padding: "4px 7px", marginBottom: "2px" }}>
                              <div title={e.tP} style={{ fontSize: "10px", fontWeight: 700, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.tP}</div>
                              <div title={e.prof} style={{ fontSize: "9px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtName(e.prof)}</div>
                            </div>
                          ))}
                          {bp && (
                            <div style={{ background: cellBg(bp.st), border: `1px solid ${cellBd(bp.st)}`, borderRadius: "7px", padding: "4px 7px" }}>
                              <div title={bp.sessao.tP} style={{ fontSize: "10px", fontWeight: 700, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bp.sessao.tP}</div>
                              <div title={bp.sessao.prof} style={{ fontSize: "9px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtName(bp.sessao.prof)}</div>
                              <div style={{ fontSize: "9px", fontWeight: 700, color: cellLabelColor(bp.st), marginTop: "2px" }}>{cellLabel(bp.st)}</div>
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function SaidaItem({
  pac, dia, hora, terapia, profRes, diaRes, horaRes, obs,
  onConfirmar, onRecusar, onInviavel, onCancelar,
}: {
  pac: string; dia: string; hora: string; terapia: string
  profRes?: string; diaRes?: string; horaRes?: string; obs?: string
  onConfirmar: () => void; onRecusar: () => void; onInviavel: () => void; onCancelar: () => void
}) {
  return (
    <div style={{ background: "#f5f3ff", border: `1px solid ${B.purple}33`, borderRadius: "12px", padding: "10px 14px" }}>
      <div style={{ marginBottom: "6px" }}>
        <span style={{ background: "#f5f3ff", color: B.purple, border: `1px solid ${B.purple}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
          🚪 Saída de Profissional
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "13px", color: B.navy }}>{pac}</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{terapia} · {dia} {hora}</div>
          {profRes && <div style={{ fontSize: "12px", fontWeight: 700, color: B.navy, marginTop: "2px" }}>→ {profRes} · {diaRes} {horaRes}</div>}
          {obs && <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px", fontStyle: "italic" }}>"{obs}"</div>}
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button onClick={onConfirmar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontWeight: 700 }}>
            Responsável Confirmou
          </button>
          <button onClick={onRecusar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer", fontWeight: 700 }}>
            Recusou
          </button>
          <button onClick={onInviavel} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer", fontWeight: 700 }}>
            Inviável
          </button>
          <button onClick={onCancelar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "white", color: "#9ca3af", border: "1px solid #e5e7eb", cursor: "pointer" }}
            title="Remove o item do acompanhamento">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function OcupItem({
  pac, prof, dia, hora, esp, unidade, tP, conv,
  onAceito, onRecusado, onInviavel, onCancelar, onVer,
}: {
  pac: string; prof: string; dia: string; hora: string
  esp?: string; unidade?: string; tP?: string; conv?: string
  onAceito: () => void; onRecusado: () => void; onInviavel: () => void; onCancelar: () => void; onVer: () => void
}) {
  return (
    <div style={{ background: B.blueLt, border: `1px solid ${B.blue}33`, borderRadius: "12px", padding: "10px 14px" }}>
      {/* Badge de origem */}
      <div style={{ marginBottom: "6px" }}>
        <span style={{ background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
          📋 Aumentar Ocupação (Clínica)
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "13px", color: B.navy }}>{pac}</div>
          <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>
            {tP || esp || "—"} · {prof}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: B.navy, marginTop: "2px" }}>
            {dia} {hora}{unidade ? ` · ${unidade}` : ""}{conv ? ` · ${conv}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button onClick={onVer} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "white", color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer" }}>
            🗓 Ver
          </button>
          <button onClick={onAceito} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontWeight: 700 }}>
            Responsável Confirmou
          </button>
          <button onClick={onRecusado} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer", fontWeight: 700 }}>
            Recusou
          </button>
          <button onClick={onInviavel} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", cursor: "pointer", fontWeight: 700 }}>
            Inviável
          </button>
          <button onClick={onCancelar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "white", color: "#9ca3af", border: "1px solid #e5e7eb", cursor: "pointer" }}
            title="Desfaz o aceite — volta como sugestão não trabalhada em Aumentar Ocupação (Clínica)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
