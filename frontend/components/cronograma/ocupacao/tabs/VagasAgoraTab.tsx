"use client"

import { useMemo, useState } from "react"
import { B, PL } from "@/lib/cronograma/constants"
import { fmtName, waKey } from "@/lib/cronograma/helpers"
import { PBadge } from "@/components/cronograma/ui/PBadge"
import { SugCard } from "../SugCard"
import type { AlgorithmResult, Sugestao, WaMap } from "@/types/cronograma"

interface Props {
  res: AlgorithmResult | null
  waMap: WaMap
  onWA: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
}

export function VagasAgoraTab({ res, waMap, onWA, onInv, onCron }: Props) {
  const [fPac, setFPac] = useState("")
  const [fProf, setFProf] = useState("")
  const [fUnid, setFUnid] = useState("")
  const [fEsp, setFEsp] = useState("")
  const [fPr, setFPr] = useState("")
  const [fWa, setFWa] = useState("")
  const [grupoOpen, setGrupoOpen] = useState(true)
  const [livreOpen, setLivreOpen] = useState(true)
  const [filaOpen, setFilaOpen] = useState(true)

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

  const filaEspera = res?.filaEspera ?? []

  // Agrupa candidatos "próximo na fila" por slot (prof+dia+hora)
  const slotQueue = useMemo(() => {
    const map = new Map<string, { tP: string; prof: string; dia: string; hora: string; unidade: string; primary: Sugestao | null; queue: Sugestao[] }>()
    for (const s of filaEspera) {
      if (!s.filaM?.startsWith("Próximo para:")) continue
      const slotK = `${s.prof}|||${s.dia}|||${s.hora}`
      if (!map.has(slotK)) {
        const primary = res?.vagasAgora.find(v => v.prof === s.prof && v.dia === s.dia && v.hora === s.hora) ?? null
        map.set(slotK, { tP: s.tP, prof: s.prof, dia: s.dia, hora: s.hora, unidade: s.unidade, primary, queue: [] })
      }
      map.get(slotK)!.queue.push(s)
    }
    return [...map.values()]
  }, [filaEspera, res])

  const assimIsolado = useMemo(() => filaEspera.filter(s => s.filaM === "ASSIM isolado"), [filaEspera])

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
            <option value="">Todos os status</option>
            <option value="pendente">Não enviados</option>
            <option value="aguardando">⏳ Aguardando resposta</option>
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

      {/* Seção 1: Vagas a oferecer imediatamente — divididas por tipo */}
      {!res && <Empty icon="📂" text="Carregue o CSV e o relatório de laudos para ver as sugestões" />}
      {res && !vFilt.length && <Empty icon="✅" text="Nenhuma vaga com os filtros selecionados" />}

      {/* 1a. Montar Grupo em Sessão Ocupada */}
      {(() => {
        const grupo = vFilt.filter(s => s.colegas !== "—")
        if (!grupo.length) return null
        return (
          <>
            <button
              onClick={() => setGrupoOpen(o => !o)}
              style={{ display: "flex", alignItems: "center", gap: "8px", background: B.purpleLt, border: `1px solid ${B.purple}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
            >
              <span style={{ fontSize: "12px", color: B.purple, fontWeight: 700, flex: 1 }}>
                👥 Montar Grupo em Sessão Ocupada · {grupo.length}
              </span>
              <span style={{ fontSize: "11px", color: B.purple }}>{grupoOpen ? "▲ Recolher" : "▼ Expandir"}</span>
            </button>
            {grupoOpen && grupo.map((s, i) => (
              <SugCard key={i} s={s}
                waStatus={waMap[waKey(s)] ?? null}
                onWA={onWA} onInv={onInv} onCron={onCron} />
            ))}
          </>
        )
      })()}

      {/* 1b. Ocupar Sessão Totalmente Livre */}
      {(() => {
        const livre = vFilt.filter(s => s.colegas === "—")
        if (!livre.length) return null
        return (
          <>
            <button
              onClick={() => setLivreOpen(o => !o)}
              style={{ display: "flex", alignItems: "center", gap: "8px", background: B.blueLt, border: `1px solid ${B.blue}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
            >
              <span style={{ fontSize: "12px", color: B.blue, fontWeight: 700, flex: 1 }}>
                📅 Ocupar Sessão Totalmente Livre · {livre.length}
              </span>
              <span style={{ fontSize: "11px", color: B.blue }}>{livreOpen ? "▲ Recolher" : "▼ Expandir"}</span>
            </button>
            {livreOpen && livre.map((s, i) => (
              <SugCard key={i} s={s}
                waStatus={waMap[waKey(s)] ?? null}
                onWA={onWA} onInv={onInv} onCron={onCron} />
            ))}
          </>
        )
      })()}

      {/* Seção 2: Próximos na fila por vaga */}
      <button
        onClick={() => res && setFilaOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: "8px", background: B.orangeLt, border: `1px solid ${B.orange}44`, borderRadius: "12px", padding: "10px 14px", cursor: res ? "pointer" : "default", textAlign: "left", fontFamily: "inherit", width: "100%" }}
      >
        <span style={{ fontSize: "12px", color: B.orange, fontWeight: 700, flex: 1 }}>
          🔢 Próximos na Fila — Candidatos aguardando a mesma vaga{slotQueue.length > 0 ? ` · ${slotQueue.length} vaga(s) com disputa` : ""}
        </span>
        {slotQueue.length > 0 && (
          <span style={{ fontSize: "11px", color: B.orange }}>{filaOpen ? "▲ Recolher" : "▼ Expandir"}</span>
        )}
      </button>

      {filaOpen && slotQueue.length === 0 && res && (
        <div style={{ background: "white", borderRadius: "12px", border: "1px dashed #fed7aa", padding: "20px 24px", textAlign: "center" }}>
          <div style={{ fontSize: "28px", marginBottom: "6px" }}>🔢</div>
          <div style={{ color: B.orange, fontSize: "13px", fontWeight: 600 }}>Nenhuma vaga com múltiplos candidatos</div>
          <div style={{ color: "#9ca3af", fontSize: "12px", marginTop: "4px" }}>Quando mais de um paciente concorre pela mesma vaga, o próximo da fila aparece aqui. Se o 1° recusar, o próximo sobe automaticamente.</div>
        </div>
      )}

      {filaOpen && slotQueue.map(({ tP, prof, dia, hora, unidade, primary, queue }, gi) => (
        <div key={gi} style={{ background: "white", border: `1px solid ${B.orange}33`, borderRadius: "14px", overflow: "hidden" }}>
          {/* Cabeçalho da vaga */}
          <div style={{ background: B.orangeLt, padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "12px", color: B.orange }}>{tP}</span>
            <span style={{ color: "#9ca3af", fontSize: "11px" }}>·</span>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>{fmtName(prof)}</span>
            <span style={{ color: "#9ca3af", fontSize: "11px" }}>·</span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: B.navy }}>{dia} {hora}</span>
            <span style={{ color: "#9ca3af", fontSize: "11px" }}>·</span>
            <span style={{ fontSize: "11px", color: "#6b7280" }}>{unidade}</span>
          </div>

          {/* Lista de candidatos */}
          <div style={{ padding: "6px 0" }}>
            {/* 1° — candidato primário (em oferta) */}
            {primary && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 14px", background: "#f0fdf4", borderBottom: `1px solid ${B.orange}22` }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#16a34a", minWidth: "20px" }}>1°</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: "13px", color: B.navy }}>{primary.pac}</span>
                <PBadge prio={primary.prio} />
                <span style={{ fontSize: "10px", color: "#16a34a", background: "#dcfce7", borderRadius: "999px", padding: "2px 8px", fontWeight: 700 }}>
                  {waMap[waKey(primary)] === "aguardando" ? "⏳ Aguardando WA" : "Em oferta"}
                </span>
              </div>
            )}
            {/* 2°, 3°, ... — próximos na fila */}
            {queue.map((s, qi) => (
              <div key={qi} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderBottom: qi < queue.length - 1 ? `1px solid ${B.orange}22` : undefined, opacity: 0.85 }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: B.orange, minWidth: "20px" }}>{qi + 2}°</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "13px", color: "#374151" }}>{s.pac}</span>
                <PBadge prio={s.prio} />
                <span style={{ fontSize: "10px", color: B.orange, background: B.orangeLt, borderRadius: "999px", padding: "2px 8px", fontWeight: 600 }}>na fila</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ASSIM isolado — configuração isolarAssim ativa */}
      {assimIsolado.length > 0 && (
        <>
          <SectionHeader label="ASSIM Isolado (aguardando liberação)" count={assimIsolado.length} color={B.orange} />
          {assimIsolado.map((s, i) => (
            <SugCard key={i} s={s} fila
              waStatus={waMap[waKey(s)] ?? null}
              onWA={onWA} onInv={onInv} onCron={onCron} />
          ))}
        </>
      )}
    </div>
  )
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
      <span style={{ fontSize: "11px", fontWeight: 700, color, background: "white", padding: "2px 10px", border: `1px solid ${color}33`, borderRadius: "999px" }}>
        {label} · {count}
      </span>
      <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
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
