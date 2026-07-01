"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { B, SK_SAIDA, HORAS_GRID, DIAS_LIST } from "@/lib/cronograma/constants"
import { waKey, fmtName } from "@/lib/cronograma/helpers"
import { exportBase } from "@/lib/cronograma/xlsx"
import { useCronogramaData, genConfId } from "@/contexts/CronogramaDataContext"
import { RecusadosTab } from "./RecusadosTab"
import { InviavelTab } from "./InviavelTab"
import type { AlgorithmResult, Sugestao, WaMap, WaStatus, StatusMap, CsvRow, OpcaoEstrategia, MovimentoSessao, AfetadaItem, SessPacItem, AnaliseResult, StatusEntry, OpcaoSwap, OpcaoDiaMigracao } from "@/types/cronograma"
import type { AceitePacBundle, ConfItem, SlotStatus } from "@/types/acompanhamento"
import { SaidaCronModal } from "@/components/cronograma/solicitacoes/SaidaCronModal"

const SLOT_META: Record<SlotStatus, { label: string; bg: string; c: string; bd: string }> = {
  confirmado: { label: "Confirmou",  bg: "#dcfce7", c: "#14532d", bd: "#86efac" },
  recusado:   { label: "Recusou",    bg: "#fee2e2", c: "#7f1d1d", bd: "#fca5a5" },
  inviavel:   { label: "Inviável",   bg: "var(--muted)", c: "var(--muted-foreground)", bd: "var(--border)" },
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
  const {
    cRows, rec, inv, waMap, statusMap, sRec, sInv, sWa, persistStatus,
    profMap, pacBundles, conf, persistProfMap, persistPacBundles, persistConf,
  } = useCronogramaData()
  const [sub, setSub] = useState<Sub>("aguardando")
  const [fOrigem, setFOrigem] = useState<Origem>("")
  const [ocupOpen, setOcupOpen] = useState(false)
  const [saidaOpen, setSaidaOpen] = useState(false)
  const [ocupProfOpen, setOcupProfOpen] = useState(false)
  const [ocupPacOpen, setOcupPacOpen] = useState(false)
  const [invModalPac, setInvModalPac] = useState<string | null>(null)
  const [invMotivo, setInvMotivo] = useState("")

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
      persistConf([...conf, { id: genConfId(), pac: sug.pac, prof: sug.prof, esp: sug.tP ?? sug.esp ?? "", unidade: sug.unidade ?? "", dia: sug.dia ?? dia, hora: sug.hora ?? hora, origem: "Ocp. Clínica", registradoEm: hoje() }])
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
    persistConf([...conf, { id: genConfId(), pac, prof, esp: "", unidade: "", dia, hora, origem: "Ocp. Profissional", registradoEm: hoje() }])
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
        persistConf([...conf, { id: genConfId(), pac: bundle.pac, prof: sessao.prof, esp: sessao.tP, unidade: sessao.unidade, dia: sessao.dia, hora: sessao.hora, origem: "Ocp. Paciente", registradoEm: d }])
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
      persistConf([...conf, ...bundle.sessoes.map(s => ({ id: genConfId(), pac: bundle.pac, prof: s.prof, esp: s.tP, unidade: s.unidade, dia: s.dia, hora: s.hora, origem: "Ocp. Paciente", registradoEm: d }))])
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
    persistConf([...conf, { id: genConfId(), pac, prof: profRes || "", esp: terapia, unidade: "", dia: diaRes || dia, hora: horaRes || hora, origem: "Saída Profissional", registradoEm: hoje() }])
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
            border: `1px solid ${sub === s.key ? B.blue : "var(--border)"}`,
            background: sub === s.key ? "var(--cron-active-bg)" : "var(--card)",
            color: sub === s.key ? B.blue : "var(--muted-foreground)",
            fontWeight: 700, fontSize: "12px", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            {s.label}
            {s.count > 0 && (
              <span style={{
                background: sub === s.key ? B.blue : "var(--muted)",
                color: sub === s.key ? "white" : "var(--muted-foreground)",
                borderRadius: "999px", padding: "0 6px", fontSize: "11px", fontWeight: 800,
              }}>
                {s.count}
              </span>
            )}
          </button>
        ))}
        <button onClick={handleExportCSV} style={{ marginLeft: "auto", fontSize: "11px", padding: "6px 12px", borderRadius: "9px", background: "var(--card)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 600 }}>
          ↓ Exportar CSV
        </button>
      </div>

      {/* Conteúdo */}
      {sub === "aguardando" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Filtro por origem */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>Filtrar por origem:</span>
            {(["", "ocupacao", "ocp-prof", "ocp-pac", "saida"] as Origem[]).map(o => (
              <button key={o} onClick={() => setFOrigem(o)} style={{
                padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
                border: `1px solid ${fOrigem === o ? B.blue : "var(--border)"}`,
                background: fOrigem === o ? "var(--cron-active-bg)" : "var(--card)",
                color: fOrigem === o ? B.blue : "var(--muted-foreground)",
                cursor: "pointer",
              }}>
                {o === "" ? "Todas origens" : ORIGEM_LABELS[o]}
              </button>
            ))}
          </div>

          {aguardandoCount === 0 && (
            <div style={{ background: "var(--card)", borderRadius: "14px", border: "2px dashed var(--border)", padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>📬</div>
              <div style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>Nenhum item aguardando resposta</div>
            </div>
          )}

          {/* Seção Aumentar Ocupação (Clínica) */}
          {showOcup && aguardandoOcup.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setOcupOpen(o => !o)}
                aria-expanded={ocupOpen}
                aria-controls="secao-ocup"
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--cron-active-bg)", border: `1px solid ${B.blue}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.blue, fontWeight: 700, flex: 1 }}>
                  📋 Aumentar Ocupação (Clínica) · {aguardandoOcup.length}
                </span>
                <span style={{ fontSize: "11px", color: B.blue }}>{ocupOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              <div id="secao-ocup">{ocupOpen && aguardandoOcup.map(({ key, pac, prof, dia, hora, sug }) => (
                <OcupItem key={key}
                  pac={pac} prof={prof} dia={dia} hora={hora}
                  esp={sug?.esp} unidade={sug?.unidade} tP={sug?.tP} conv={sug?.conv}
                  onAceito={() => handleOcupAceito(key, sug)}
                  onRecusado={() => handleOcupRecusado(key, sug)}
                  onInviavel={() => handleOcupInviavel(pac)}
                  onCancelar={() => handleOcupCancelar(key)}
                  onVer={() => sug && onCron(sug)}
                />
              ))}</div>
            </div>
          )}

          {/* Seção Aumentar Ocupação (Profissional) */}
          {showOcupProf && aguardandoProfItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setOcupProfOpen(o => !o)}
                aria-expanded={ocupProfOpen}
                aria-controls="secao-ocup-prof"
                style={{ display: "flex", alignItems: "center", gap: "8px", background: B.orangeLt, border: `1px solid ${B.orange}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.orange, fontWeight: 700, flex: 1 }}>
                  📊 Aumentar Ocupação (Profissional) · {aguardandoProfItems.length}
                </span>
                <span style={{ fontSize: "11px", color: B.orange }}>{ocupProfOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              <div id="secao-ocup-prof">{ocupProfOpen && aguardandoProfItems.map(([key]) => {
                const [pac, prof, dia, hora] = key.split("|||")
                return (
                  <ProfItem key={key} pac={pac} prof={prof} dia={dia} hora={hora}
                    onConfirmar={() => handleProfConfirmar(key)}
                    onRecusar={() => handleProfRecusar(key)}
                    onInviavel={() => handleProfInviavel(key)}
                    onCancelar={() => handleProfCancelar(key)}
                  />
                )
              })}</div>
            </div>
          )}

          {/* Seção Aumentar Ocupação (Paciente) */}
          {showOcupPac && aguardandoPacBundles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setOcupPacOpen(o => !o)}
                aria-expanded={ocupPacOpen}
                aria-controls="secao-ocup-pac"
                style={{ display: "flex", alignItems: "center", gap: "8px", background: B.limeLt, border: `1px solid ${B.lime}88`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: "#4d7c0f", fontWeight: 700, flex: 1 }}>
                  👤 Aumentar Ocupação (Paciente) · {aguardandoPacBundles.length}
                </span>
                <span style={{ fontSize: "11px", color: "#4d7c0f" }}>{ocupPacOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              <div id="secao-ocup-pac">{ocupPacOpen && aguardandoPacBundles.map(bundle => (
                <PacBundleItem key={bundle.id} bundle={bundle} cRows={cRows}
                  onCancelar={() => handlePacCancelar(bundle.id)}
                  onSlotStatus={(slotKey, st) => handlePacSlotStatus(bundle.id, slotKey, st)}
                  onSlotRemove={(slotKey) => handlePacSlotRemove(bundle.id, slotKey)}
                  onBulkStatus={(st) => handlePacBulkStatus(bundle.id, st)}
                />
              ))}</div>
            </div>
          )}

          {/* Seção Saída de Profissional */}
          {showSaida && aguardandoSaidaCount > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setSaidaOpen(o => !o)}
                aria-expanded={saidaOpen}
                aria-controls="secao-saida"
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--muted)", border: `1px solid ${B.purple}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.purple, fontWeight: 700, flex: 1 }}>
                  🚪 Saída de Profissional · {aguardandoSaidaCount}
                </span>
                <span style={{ fontSize: "11px", color: B.purple }}>{saidaOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              <div id="secao-saida">{saidaOpen && aguardandoSaidaItems.map(([key, val]) => {
                const [pac, dia, hora, terapia] = key.split("|||")
                const [profRes, diaRes, horaRes] = (val.slotReservado || "|||").split("|||")
                return (
                  <SaidaItem key={key}
                    pac={pac} dia={dia} hora={hora} terapia={terapia}
                    profRes={profRes} diaRes={diaRes} horaRes={horaRes} obs={val.obs}
                    estrategiaSel={val.estrategiaSel}
                    opcao={val.opcao}
                    movimentos={val.movimentos}
                    statusEntry={val}
                    onConfirmar={() => handleSaidaConfirmar(key)}
                    onRecusar={() => handleSaidaRecusar(key)}
                    onInviavel={() => handleSaidaInviavel(key)}
                    onCancelar={() => handleSaidaCancelar(key)}
                  />
                )
              })}</div>
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
        <InviavelModal
          pac={invModalPac}
          motivo={invMotivo}
          onMotivoChange={setInvMotivo}
          onConfirmar={confirmarInviavel}
          onClose={() => { setInvModalPac(null); setInvMotivo("") }}
        />
      )}
    </div>
  )
}

function InviavelModal({ pac, motivo, onMotivoChange, onConfirmar, onClose }: {
  pac: string; motivo: string
  onMotivoChange: (v: string) => void
  onConfirmar: () => void
  onClose: () => void
}) {
  const firstBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inv-modal-title"
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", padding: "16px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "20px" }}>
        <div id="inv-modal-title" style={{ fontWeight: 900, fontSize: "17px", marginBottom: "4px" }}>⛔ Marcar como Inviável</div>
        <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "10px" }}>Removido de TODAS as sugestões até tirado da lista.</div>
        <div style={{ background: "var(--muted)", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>{pac}</div>
        <label htmlFor="inv-motivo" style={{ fontSize: "11px", color: "var(--muted-foreground)", display: "block", marginBottom: "4px" }}>Motivo (opcional)</label>
        <textarea id="inv-motivo" value={motivo} onChange={e => onMotivoChange(e.target.value)} placeholder="ex: família faltando muito..." rows={2}
          style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "10px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", resize: "none", marginBottom: "14px", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: "8px" }}>
          <button ref={firstBtnRef} onClick={onConfirmar} style={{ padding: "8px 16px", borderRadius: "10px", background: B.navy, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
            Confirmar
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: "8px 16px", borderRadius: "10px", background: "var(--muted)", color: "var(--card-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmadosTab({ conf, onRemove }: { conf: ConfItem[]; onRemove: (i: number) => void }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "14px", border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: "8px" }}>
        <span style={{ fontWeight: 800, color: B.navy }}>✅ Confirmados</span>
        <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{conf.length} registros · 💾</span>
      </div>
      {!conf.length ? (
        <div style={{ borderRadius: "10px", border: "2px dashed var(--border)", padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "6px" }}>📭</div>
          <div style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Nenhuma confirmação registrada</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead style={{ background: "var(--muted)" }}>
              <tr>
                {["Paciente", "Profissional", "Especialidade", "Dia", "Hora", "Origem", "Registrado", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conf.map((c, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: B.navy }}>{c.pac}</td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "12px" }}>{fmtName(c.prof)}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: "#dcfce7", color: "#14532d", borderRadius: "999px", padding: "2px 8px", fontSize: "11px" }}>{c.esp || "—"}</span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "12px" }}>{c.dia}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: "12px" }}>{c.hora}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: B.limeLt, color: "#4d7c0f", borderRadius: "999px", padding: "2px 8px", fontSize: "11px", border: `1px solid ${B.lime}88` }}>{c.origem}</span>
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--muted-foreground)", fontSize: "11px" }}>{c.registradoEm}</td>
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
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "2px" }}>{prof}</div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: B.navy, marginTop: "2px" }}>{dia} {hora}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          <button onClick={onConfirmar} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#16a34a", color: "white", border: "none", cursor: "pointer", fontWeight: 700 }}>✓ Confirmou</button>
          <button onClick={onInviavel} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 600 }}>Inviável</button>
          <button onClick={onRecusar} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontWeight: 700 }}>✗ Recusou</button>
          <button onClick={onCancelar} style={{ fontSize: "12px", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", background: "transparent", color: "var(--muted-foreground)", border: "none", cursor: "pointer" }} title="Desfaz o aceite — volta como sugestão em Aumentar Ocupação (Profissional)">Cancelar</button>
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
    fontSize: "11px", padding: "6px 10px", minHeight: "36px", borderRadius: "6px", cursor: "pointer",
    whiteSpace: "nowrap" as const, fontFamily: "inherit",
    background: active ? bg : "var(--muted)", color: active ? c : "var(--muted-foreground)",
    border: `1px solid ${active ? bd : "var(--border)"}`, fontWeight: active ? 700 : 500,
  })

  return (
    <div style={{ background: B.limeLt, border: `1px solid ${B.lime}88`, borderRadius: "12px", padding: "10px 14px" }}>

      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ background: B.limeLt, color: "#4d7c0f", border: `1px solid ${B.lime}88`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
            👤 Aumentar Ocupação (Paciente)
          </span>
          <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{dt}</span>
        </div>
        <button onClick={() => setShowVer(true)} style={{ fontSize: "12px", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", background: "var(--card)", color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
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
          const rowBg = st === "confirmado" ? "#f0fdf4" : st === "recusado" ? "#fff1f2" : st === "inviavel" ? "var(--muted)" : "var(--card)"
          const rowBd = st === "confirmado" ? "#86efac" : st === "recusado" ? "#fca5a5" : st === "inviavel" ? "var(--border)" : "#d1fae5"
          return (
            <div key={slotKey} style={{ background: rowBg, borderRadius: "8px", padding: "6px 10px", border: `1px solid ${rowBd}`, opacity: st === "inviavel" ? 0.7 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: "12px", color: B.navy }}>{s.dia.replace("-feira", "")} {s.hora}</span>
                  <span style={{ fontSize: "11px", color: "var(--card-foreground)", marginLeft: "6px" }}>{s.tP}</span>
                  <span style={{ fontSize: "11px", color: "var(--muted-foreground)", marginLeft: "4px" }}>· {fmtName(s.prof)}</span>
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
                    style={smBtn("var(--muted)", "var(--muted-foreground)", "var(--border)", st === "inviavel")}>⛔ Inviável</button>
                  <button onClick={() => onSlotRemove(slotKey)}
                    style={{ ...smBtn("#fef2f2", "#dc2626", "#fca5a5"), color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5" }}>× Cancelar</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Ações em lote */}
      <div style={{ borderTop: "1px solid #d1fae5", paddingTop: "8px" }}>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)", fontWeight: 600, display: "block", marginBottom: "4px" }}>Tudo:</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          <button onClick={() => onBulkStatus("confirmado")} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#16a34a", color: "white", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>✓ Confirmou tudo</button>
          <button onClick={() => onBulkStatus("inviavel")}   style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Inviável</button>
          <button onClick={() => onBulkStatus("recusado")}   style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>✗ Recusou tudo</button>
          <button onClick={onCancelar} style={{ fontSize: "12px", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", background: "transparent", color: "var(--muted-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit" }} title="Remove este lote da lista">Cancelar tudo</button>
        </div>
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
    if (st === "exist")      return "var(--muted)"
    if (st === "pendente")   return B.limeLt
    return SLOT_META[st].bg
  }
  function cellBd(st: "exist" | "pendente" | SlotStatus) {
    if (st === "exist")      return "var(--border)"
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
      <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "880px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Cabeçalho */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--muted)", borderRadius: "18px 18px 0 0" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "15px", color: B.navy }}>🗓 {pac}</div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>Agenda existente + propostas enviadas para acompanhamento</div>
            <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
              {([["exist", "Existente"], ["pendente", "Proposta"], ["confirmado", "Confirmou"], ["recusado", "Recusou"], ["inviavel", "Inviável"]] as [string, string][]).map(([k, lbl]) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "var(--muted-foreground)" }}>
                  <span style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "2px", background: cellBg(k as any), border: `1px solid ${cellBd(k as any)}` }} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "var(--muted)", cursor: "pointer", fontSize: "18px", color: "var(--muted-foreground)", flexShrink: 0 }}>×</button>
        </div>

        {/* Grid */}
        <div style={{ overflow: "auto", padding: "16px" }}>
          {!activeHoras.length ? (
            <div style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "32px" }}>Nenhuma sessão encontrada.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", minWidth: `${52 + DIAS_UTIL.length * 130}px` }}>
              <colgroup>
                <col style={{ width: "48px" }} />
                {DIAS_UTIL.map(d => <col key={d} style={{ width: "130px" }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ paddingBottom: "8px", textAlign: "right", paddingRight: "8px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
                  {DIAS_UTIL.map(d => (
                    <th key={d} style={{ paddingBottom: "8px", textAlign: "center", fontSize: "13px", color: B.navy, fontWeight: 800 }}>
                      {DIAS_ABR[d] ?? d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeHoras.map(hora => (
                  <tr key={hora} style={{ borderTop: hora === "13:00" ? "2px solid var(--border)" : "1px solid var(--border)" }}>
                    <td style={{ textAlign: "right", paddingRight: "8px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "13px", fontWeight: 800, color: B.navy }}>{hora}</td>
                    {DIAS_UTIL.map(d => {
                      const k = `${d}|||${hora}`
                      const exists = existMap[k] ?? []
                      const bp = bundleMap[k]
                      return (
                        <td key={d} style={{ padding: "2px", verticalAlign: "top" }}>
                          {exists.map((e, i) => (
                            <div key={i} style={{ background: cellBg("exist"), border: `1px solid ${cellBd("exist")}`, borderRadius: "7px", padding: "4px 7px", marginBottom: "2px" }}>
                              <div title={e.tP} style={{ fontSize: "10px", fontWeight: 700, color: "var(--card-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.tP}</div>
                              <div title={e.prof} style={{ fontSize: "9px", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtName(e.prof)}</div>
                            </div>
                          ))}
                          {bp && (
                            <div style={{ background: cellBg(bp.st), border: `1px solid ${cellBd(bp.st)}`, borderRadius: "7px", padding: "4px 7px" }}>
                              <div title={bp.sessao.tP} style={{ fontSize: "10px", fontWeight: 700, color: "var(--card-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bp.sessao.tP}</div>
                              <div title={bp.sessao.prof} style={{ fontSize: "9px", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtName(bp.sessao.prof)}</div>
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

function buildReadOnlyAnalise(entry: StatusEntry): AnaliseResult {
  const { estrategiaSel, opcaoSel = 0, opcao, movimentos, sessPac: sp = [], afetada } = entry
  const pacUnidade = afetada?.unidade && afetada.unidade !== "Desconhecida"
    ? afetada.unidade
    : (sp.find(s => s.unidade && s.unidade !== "Desconhecida")?.unidade ?? null)

  const simpleOpcoes: OpcaoEstrategia[] = opcao ? [opcao] : []
  const swapOpcoes: OpcaoSwap[] = movimentos?.length
    ? [{ movimentos, profissionaisAlterados: [] }]
    : []
  const diaOpcoes: OpcaoDiaMigracao[] = movimentos?.length
    ? [{ diaOrigem: movimentos[0].deDia, diaDestino: movimentos[0].paraDia, movimentos, profissionaisAlterados: [] }]
    : []

  const e1 = estrategiaSel === "e1" && simpleOpcoes.length ? { tipo: "e1" as const, label: "#1 Mesma terapia, mesmo horário", opcoes: simpleOpcoes } : null
  const e2 = estrategiaSel === "e2" && swapOpcoes.length ? { tipo: "e2" as const, label: "#2 Qt. de Terapias: mantido. Posições: alterado. Profissionais: mantido.", opcoes: swapOpcoes } : null
  const e3 = estrategiaSel === "e3" && simpleOpcoes.length ? { tipo: "e3" as const, label: "#3 Mesma terapia, horário adjacente", opcoes: simpleOpcoes } : null
  const e4 = estrategiaSel?.startsWith("e4_") && simpleOpcoes.length
    ? [{ tipo: "e4" as const, label: `#4 Outra terapia — ${opcao?.terapia ?? ""}`, esp: opcao?.terapia ?? "", opcoes: simpleOpcoes }]
    : []
  const e5 = estrategiaSel === "e5" && swapOpcoes.length ? { tipo: "e5" as const, label: "#5 Qt. de Terapias: mantido. Posições: alterado. Profissionais: alterado.", opcoes: swapOpcoes } : null
  const e6 = estrategiaSel === "e6" && diaOpcoes.length ? { tipo: "e6" as const, label: "#6 Alterar dia de tratamento, mesmos profissionais.", opcoes: diaOpcoes } : null
  const e7 = estrategiaSel === "e7" && diaOpcoes.length ? { tipo: "e7" as const, label: "#7 Alterar dia de tratamento, profissionais diferentes.", opcoes: diaOpcoes } : null

  return {
    sessPac: sp, sessDiaClin: [], buracoSiRemover: false, min2Violation: false,
    pacTurno: "manhã", pacUnidade, inconsistencias: [],
    e1, e2, e3, e4, e5, e6, e7, semSolucao: false,
  }
}

const E_LABELS_SAIDA: Record<string, string> = {
  e1: "E1 · Substituição Direta", e2: "E2 · Rearranjo Interno", e3: "E3 · Novo Horário",
  e4: "E4 · Autorização Pendente", e5: "E5 · Reposição Cruzada",
  e6: "E6 · Migração de Dia", e7: "E7 · Migração com Troca",
}
const E_TIPS_SAIDA: Record<string, string> = {
  e1: "Outro profissional assume a mesma terapia, no mesmo dia e horário. Sem mudança na rotina do paciente.",
  e2: "As sessões existentes do paciente são reposicionadas entre si — os terapeutas ficam, mas trocam de horário.",
  e3: "A terapia continua com outro profissional em dia/horário diferente, respeitando o turno e evitando lacunas.",
  e4: "O horário vago é preenchido com outra terapia que o paciente tem autorização pendente. A terapia perdida fica sem reposição.",
  e5: "Reposição cruzada possível, mas com troca de pelo menos um terapeuta existente. Risco de recusa pela família.",
  e6: "Todas as sessões do dia afetado migram para um novo dia, com os mesmos terapeutas.",
  e7: "Todas as sessões do dia afetado migram para um novo dia, mas pelo menos um terapeuta precisa ser trocado.",
}
const E_CORES_SAIDA: Record<string, string> = {
  e1: B.lime, e2: "#0ea5e9", e3: B.blue, e4: B.purple,
  e5: "#f97316", e6: "#8b5cf6", e7: "#ec4899",
}

function SaidaItem({
  pac, dia, hora, terapia, profRes, diaRes, horaRes, obs,
  estrategiaSel, opcao, movimentos, statusEntry,
  onConfirmar, onRecusar, onInviavel, onCancelar,
}: {
  pac: string; dia: string; hora: string; terapia: string
  profRes?: string; diaRes?: string; horaRes?: string; obs?: string
  estrategiaSel?: string | null
  opcao?: OpcaoEstrategia | null
  movimentos?: MovimentoSessao[] | null
  statusEntry?: StatusEntry
  onConfirmar: () => void; onRecusar: () => void; onInviavel: () => void; onCancelar: () => void
}) {
  const [showVer, setShowVer] = useState(false)
  const hasDetails = !!(estrategiaSel || opcao || statusEntry?.afetada)

  return (
    <div style={{ background: "#f5f3ff", border: `1px solid ${B.purple}33`, borderRadius: "12px", padding: "12px 16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>

        {/* Coluna de informação — badge + dados */}
        <div style={{ flex: 1, minWidth: "160px", display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ background: "#f5f3ff", color: B.purple, border: `1px solid ${B.purple}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700, width: "fit-content", marginBottom: "4px" }}>
            🚪 Saída de Profissional
          </span>
          <div style={{ fontWeight: 800, fontSize: "13px", color: B.navy }}>{pac}</div>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{terapia} · {dia} {hora}</div>
          {profRes && <div style={{ fontSize: "12px", fontWeight: 700, color: B.navy }}>→ {profRes} · {diaRes} {horaRes}</div>}
          {obs && <div style={{ fontSize: "11px", color: "var(--muted-foreground)", fontStyle: "italic" }}>"{obs}"</div>}
        </div>

        {/* Grid de ações — 3 colunas: Ver | Confirmou/Recusou | Inviável/Cancelar */}
        <div style={{ display: "grid", gridTemplateColumns: hasDetails ? "auto auto auto" : "auto auto", gap: "4px", flexShrink: 0 }}>
          {hasDetails && (
            <button onClick={() => setShowVer(true)} style={{
              gridRow: "span 2",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
              fontSize: "11px", padding: "8px 12px", borderRadius: "8px",
              background: `${B.purple}12`, color: B.purple, border: `1px solid ${B.purple}44`,
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, lineHeight: 1.3, textAlign: "center",
            }}>
              <span style={{ fontSize: "15px" }}>📋</span>
              <span>Ver<br />detalhes</span>
            </button>
          )}
          <button onClick={onConfirmar} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#16a34a", color: "white", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>✓ Confirmou</button>
          <button onClick={onInviavel}  style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Inviável</button>
          <button onClick={onRecusar}   style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>✗ Recusou</button>
          <button onClick={onCancelar}  style={{ fontSize: "12px", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", background: "transparent", color: B.purple, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }} title="Remove o item do acompanhamento">Cancelar</button>
        </div>
      </div>
      {showVer && statusEntry?.afetada && (
        <SaidaCronModal
          pac={pac}
          afetada={statusEntry.afetada}
          analise={buildReadOnlyAnalise(statusEntry)}
          statusAtual={statusEntry}
          readOnly
          onClose={() => setShowVer(false)}
          onStatus={() => {}}
        />
      )}
      {showVer && !statusEntry?.afetada && (
        <SaidaVerModal pac={pac} dia={dia} hora={hora} terapia={terapia}
          estrategiaSel={estrategiaSel} opcao={opcao} movimentos={movimentos} obs={obs}
          onClose={() => setShowVer(false)} />
      )}
    </div>
  )
}

function SaidaVerModal({ pac, dia, hora, terapia, estrategiaSel, opcao, movimentos, obs, onClose }: {
  pac: string; dia: string; hora: string; terapia: string
  estrategiaSel?: string | null
  opcao?: OpcaoEstrategia | null
  movimentos?: MovimentoSessao[] | null
  obs?: string
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const eColor = estrategiaSel ? (E_CORES_SAIDA[estrategiaSel] ?? B.purple) : B.purple
  const eLabel = estrategiaSel ? (E_LABELS_SAIDA[estrategiaSel] ?? estrategiaSel.toUpperCase()) : null
  const eTip   = estrategiaSel ? (E_TIPS_SAIDA[estrategiaSel] ?? null) : null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="saida-ver-title"
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: "16px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "520px", width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "var(--muted)", borderRadius: "18px 18px 0 0" }}>
          <div>
            <div id="saida-ver-title" style={{ fontWeight: 800, fontSize: "15px", color: B.navy }}>📋 {pac}</div>
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>Detalhes da substituição</div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Fechar"
            style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "var(--muted)", cursor: "pointer", fontSize: "18px", color: "var(--muted-foreground)", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>

          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Sessão afetada</div>
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "10px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#7f1d1d" }}>{terapia}</div>
              <div style={{ fontSize: "12px", color: "#991b1b", marginTop: "2px" }}>{dia} · {hora}</div>
            </div>
          </div>

          {eLabel && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Estratégia selecionada</div>
              <div style={{ background: "var(--card)", border: `1px solid ${eColor}33`, borderRadius: "10px", padding: "10px 14px" }}>
                <span style={{ background: `${eColor}22`, color: eColor, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 800 }}>{eLabel}</span>
                {eTip && <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "8px" }}>{eTip}</div>}
              </div>
            </div>
          )}

          {opcao && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Solução adotada</div>
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "10px", padding: "10px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "#14532d" }}>{fmtName(opcao.prof)}</div>
                <div style={{ fontSize: "12px", color: "#166534", marginTop: "2px" }}>{opcao.terapia} · {opcao.dia} {opcao.hora}</div>
                {opcao.unidade && <div style={{ fontSize: "11px", color: "#166534", marginTop: "2px" }}>{opcao.unidade}</div>}
              </div>
            </div>
          )}

          {movimentos && movimentos.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Movimentos ({movimentos.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {movimentos.map((m, i) => (
                  <div key={i} style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", fontSize: "12px" }}>
                    <div style={{ color: "var(--card-foreground)", fontWeight: 600 }}>{m.deTerapia}</div>
                    <div style={{ color: "var(--muted-foreground)", marginTop: "2px" }}>
                      {m.deDia} {m.deHora} → {m.paraDia} {m.paraHora}
                      {m.profMudou && <span style={{ color: B.orange, fontWeight: 700, marginLeft: "6px" }}>· trocou prof</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {obs && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Observação</div>
              <div style={{ background: "var(--muted)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", color: "var(--card-foreground)", fontStyle: "italic" }}>
                "{obs}"
              </div>
            </div>
          )}

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
    <div style={{ background: "var(--cron-active-bg)", border: `1px solid ${B.blue}33`, borderRadius: "12px", padding: "10px 14px" }}>
      {/* Badge de origem */}
      <div style={{ marginBottom: "6px" }}>
        <span style={{ background: "var(--cron-active-bg)", color: B.blue, border: `1px solid ${B.blue}44`, borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700 }}>
          📋 Aumentar Ocupação (Clínica)
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "13px", color: B.navy }}>{pac}</div>
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "2px" }}>
            {tP || esp || "—"} · {prof}
          </div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: B.navy, marginTop: "2px" }}>
            {dia} {hora}{unidade ? ` · ${unidade}` : ""}{conv ? ` · ${conv}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
          <button onClick={onVer} style={{ fontSize: "12px", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", background: "var(--card)", color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer", alignSelf: "flex-start" }}>
            🗓 Ver
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
            <button onClick={onAceito}   style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#16a34a", color: "white", border: "none", cursor: "pointer", fontWeight: 700 }}>✓ Confirmou</button>
            <button onClick={onInviavel} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 600 }}>Inviável</button>
            <button onClick={onRecusado} style={{ fontSize: "12px", padding: "10px 14px", minHeight: "44px", borderRadius: "8px", background: "#dc2626", color: "white", border: "none", cursor: "pointer", fontWeight: 700 }}>✗ Recusou</button>
            <button onClick={onCancelar} style={{ fontSize: "12px", padding: "10px 12px", minHeight: "44px", borderRadius: "8px", background: "transparent", color: "var(--muted-foreground)", border: "none", cursor: "pointer" }} title="Desfaz o aceite — volta como sugestão não trabalhada em Aumentar Ocupação (Clínica)">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
