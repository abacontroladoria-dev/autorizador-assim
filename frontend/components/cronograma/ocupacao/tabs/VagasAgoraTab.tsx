"use client"

import { useMemo, useState } from "react"
import { B, PL } from "@/lib/cronograma/constants"
import { waKey } from "@/lib/cronograma/helpers"
import { SugCard } from "../SugCard"
import type { AlgorithmResult, Sugestao, WaMap, WaStatus } from "@/types/cronograma"

interface Props {
  res: AlgorithmResult | null
  waMap: WaMap
  onWA: (s: Sugestao) => void
  onWAUndo: (s: Sugestao) => void
  onWAStatus: (s: Sugestao, st: WaStatus) => void
  onRec: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
}

export function VagasAgoraTab({ res, waMap, onWA, onWAUndo, onWAStatus, onRec, onInv, onCron }: Props) {
  const [fPac, setFPac] = useState("")
  const [fProf, setFProf] = useState("")
  const [fUnid, setFUnid] = useState("")
  const [fEsp, setFEsp] = useState("")
  const [fPr, setFPr] = useState("")
  const [fWa, setFWa] = useState("")

  const unidOpts = useMemo(() => res ? [...new Set(res.vagasAgora.map(s => s.unidade))].sort() : [], [res])
  const espOpts = useMemo(() => res ? [...new Set(res.vagasAgora.map(s => s.esp))].sort() : [], [res])

  const vFilt = useMemo(() => {
    if (!res) return []
    return res.vagasAgora.filter(s => {
      if (fPac && !s.pac.toLowerCase().includes(fPac.toLowerCase())) return false
      if (fProf && !s.prof.toLowerCase().includes(fProf.toLowerCase())) return false
      if (fUnid && s.unidade !== fUnid) return false
      if (fEsp && s.esp !== fEsp) return false
      if (fPr && s.prio !== Number(fPr)) return false
      const wst = waMap[waKey(s)] ?? null
      if (fWa === "aguardando" && wst !== "aguardando") return false
      if (fWa === "aceito" && wst !== "aceito") return false
      if (fWa === "pendente" && wst) return false
      return true
    })
  }, [res, fPac, fProf, fUnid, fEsp, fPr, fWa, waMap])

  const hasFilter = fPac || fProf || fUnid || fEsp || fPr || fWa

  const inputSt: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", fontFamily: "inherit" }
  const selSt: React.CSSProperties = { ...inputSt, background: "white" }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Filtros */}
      <div style={{ background: "white", borderRadius: "14px", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,.06)", padding: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <input value={fPac} onChange={e => setFPac(e.target.value)} placeholder="🔍 Buscar paciente..." style={{ ...inputSt, flex: "1", minWidth: "150px" }} />
          <input value={fProf} onChange={e => setFProf(e.target.value)} placeholder="👤 Buscar profissional..." style={{ ...inputSt, flex: "1", minWidth: "160px" }} />
          <select value={fUnid} onChange={e => setFUnid(e.target.value)} style={selSt}>
            <option value="">Todas unidades</option>
            {unidOpts.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={fEsp} onChange={e => setFEsp(e.target.value)} style={selSt}>
            <option value="">Todas especialidades</option>
            {espOpts.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={fPr} onChange={e => setFPr(e.target.value)} style={selSt}>
            <option value="">Todas prioridades</option>
            {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{PL[p]}</option>)}
          </select>
          <select value={fWa} onChange={e => setFWa(e.target.value)} style={selSt}>
            <option value="">Todos os status WA</option>
            <option value="pendente">Não enviados</option>
            <option value="aguardando">⏳ Aguardando WA</option>
            <option value="aceito">✅ Aceito</option>
          </select>
          {hasFilter && (
            <button onClick={() => { setFPac(""); setFProf(""); setFUnid(""); setFEsp(""); setFPr(""); setFWa("") }}
              style={{ fontSize: "12px", color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>
              ✕ Limpar
            </button>
          )}
          {res && <div style={{ fontSize: "12px", color: "#9ca3af", marginLeft: "auto" }}>{vFilt.length} resultado(s)</div>}
        </div>
      </div>

      {!res && <Empty icon="📂" text="Carregue o CSV e o relatório de laudos para ver as sugestões" />}
      {res && !vFilt.length && <Empty icon="✅" text="Nenhuma vaga com os filtros selecionados" />}
      {vFilt.map((s, i) => (
        <SugCard key={i} s={s}
          waStatus={waMap[waKey(s)] ?? null}
          onWA={onWA} onWAUndo={onWAUndo} onWAStatus={onWAStatus}
          onRec={onRec} onInv={onInv} onCron={onCron} />
      ))}
    </div>
  )
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ background: "white", borderRadius: "14px", border: "2px dashed #e5e7eb", padding: "32px 24px", textAlign: "center" }}>
      <div style={{ fontSize: "40px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ color: "#9ca3af", fontSize: "14px" }}>{text}</div>
    </div>
  )
}
