"use client"

import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { B, DIAS_LIST, DIAS_ORD, HORAS_GRID, UNID_COR, ABA_EXIB_PSICO_NAMES, EXIB_ID, EXIB_NOME, TERAPIA_ID } from "@/lib/cronograma/constants"
import { fmtName, buildCronoUnitMeta, shouldShowSessionUnit, unidadeBadgeText } from "@/lib/cronograma/helpers"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import type {
  AfetadaItem,
  AnaliseResult,
  MovimentoSessao,
  OpcaoEstrategia,
  SessPacItem,
  StatusEntry,
  StatusSaida,
} from "@/types/cronograma"

// ─── TIPOS LOCAIS ─────────────────────────────────────────────────────────────

interface StatusPayload {
  estrategiaSel: string | null
  opcaoSel: number
  opcao: OpcaoEstrategia | null
  movimentos: MovimentoSessao[] | null
  obs: string
  slotReservado: string | null
}

interface Props {
  pac: string
  afetada: AfetadaItem
  analise: AnaliseResult
  statusAtual: StatusEntry
  onClose: () => void
  onStatus: (afetada: AfetadaItem, status: StatusSaida, payload: StatusPayload) => void
  sessionTabs?: { label: string }[]
  sessionTabIdx?: number
  onSessionTabChange?: (i: number) => void
  todasAfetadas?: AfetadaItem[]
}

// ─── HELPERS DE ESTILO ────────────────────────────────────────────────────────

const E_TIPS: Record<string, string> = {
  e1: "Outro profissional assume a mesma terapia, no mesmo dia e horário. Sem mudança na rotina do paciente.",
  e2: "As sessões existentes do paciente são reposicionadas entre si — os terapeutas ficam, mas trocam de horário.",
  e3: "A terapia continua com outro profissional em dia/horário diferente, respeitando o turno e evitando lacunas.",
  e4: "O horário vago é preenchido com outra terapia que o paciente tem autorização pendente. A terapia perdida fica sem reposição.",
  e5: "Reposição cruzada possível, mas com troca de pelo menos um terapeuta existente. Risco de recusa pela família.",
  e6: "Todas as sessões do dia afetado migram para um novo dia, com os mesmos terapeutas.",
  e7: "Todas as sessões do dia afetado migram para um novo dia, mas pelo menos um terapeuta precisa ser trocado.",
}

const E_CORES: Record<string, string> = {
  e1: B.lime,
  e2: "#0ea5e9",
  e3: B.blue,
  e4: B.purple,
  e5: "#f97316",
  e6: "#8b5cf6",
  e7: "var(--muted-foreground)",
}

const STMAP: Record<string, { label: string; bg: string; c: string }> = {
  pendente:    { label: "Pendente",      bg: "var(--muted)", c: "var(--muted-foreground)" },
  aguardando:  { label: "Em Acompanhamento",   bg: B.blueLt,  c: B.blue },
  resolvido:   { label: "Resolvido",          bg: B.limeLt,  c: "#4a6e20" },
  recusado:    { label: "Recusado",           bg: "#fef2f2", c: "#dc2626" },
  sem_solucao: { label: "Sem solução",        bg: "var(--muted)", c: "var(--muted-foreground)" },
}

type CellTipo = "afetada" | "proposta" | "removida" | "admin" | "exist" | "supervisao"

function cellStyle(tipo: CellTipo) {
  if (tipo === "afetada")    return { bg: "#fef2f2", bd: "#fca5a5", label: "Removida", lc: "#dc2626", tc: "var(--card-foreground)", sc: "var(--muted-foreground)" }
  if (tipo === "proposta")   return { bg: B.limeLt,  bd: B.lime,   label: "Proposta",  lc: "#4a6e20", tc: "var(--card-foreground)", sc: "var(--muted-foreground)" }
  if (tipo === "removida")   return { bg: "#fef2f2", bd: "#fca5a5", label: "Removida", lc: "#dc2626", tc: "var(--card-foreground)", sc: "var(--muted-foreground)" }
  if (tipo === "supervisao") return { bg: "#1e293b", bd: "#0f172a", label: null,        lc: null,      tc: "var(--muted)", sc: "#94a3b8" }
  /* admin e exist — mesma cor cinza */
  return                            { bg: "var(--muted)", bd: "var(--border)", label: null,        lc: null,      tc: "var(--card-foreground)", sc: "var(--muted-foreground)" }
}

// ─── INFO TIP ─────────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  const calcPos = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setPos({ top: r.top, left: r.left + r.width / 2 })
    }
  }

  return (
    <span
      ref={ref}
      onMouseEnter={calcPos}
      onMouseLeave={() => setPos(null)}
      onClick={e => { e.stopPropagation(); pos ? setPos(null) : calcPos() }}
      className="cursor-help inline-flex shrink-0 ml-1 align-middle"
    >
      <span className="text-[10px] font-black text-slate-400 bg-slate-100 rounded-full w-[15px] h-[15px] flex items-center justify-center border border-slate-200 leading-none">i</span>
      {pos && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed",
          top: pos.top - 8,
          left: pos.left,
          transform: "translate(-50%, -100%)",
          background: "#1e293b",
          color: "white",
          borderRadius: "10px",
          fontSize: "11px",
          lineHeight: "1.5",
          width: "230px",
          zIndex: 9999,
          padding: "9px 12px",
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,.3)",
        }}>
          {text}
          <div style={{ position: "absolute", bottom: "-5px", left: "50%", transform: "translateX(-50%)", width: "10px", height: "10px", background: "#1e293b", clipPath: "polygon(0 0,100% 0,50% 100%)" }} />
        </div>,
        document.body
      )}
    </span>
  )
}

// ─── GRADE DE AGENDA ──────────────────────────────────────────────────────────

interface CellEntry { tP: string; tE?: string; prof: string; tipo: CellTipo; unidade: string }

function buildCMap(
  sessPac: SessPacItem[],
  afetadas: AfetadaItem | AfetadaItem[],
  extra?: { dia: string; hora: string; tP: string; tE?: string; prof: string; tipo: CellTipo; unidade: string }[],
  remover?: { dia: string; hora: string; prof: string }[],
): Record<string, CellEntry[]> {
  const afetadasArr = Array.isArray(afetadas) ? afetadas : [afetadas]
  const afetadaSet = new Set(afetadasArr.map(af => `${af.dia}|||${af.hora}|||${af.terapia}|||${af.prof}`))
  const remSet = new Set((remover ?? []).map(r => `${r.dia}|||${r.hora}|||${r.prof}`))
  const cMap: Record<string, CellEntry[]> = {}

  for (const s of sessPac) {
    if (remSet.has(`${s.dia}|||${s.hora}|||${s.prof}`)) continue
    const k = `${s.dia}|||${s.hora}`
    if (!cMap[k]) cMap[k] = []
    const isAfet = afetadaSet.has(`${s.dia}|||${s.hora}|||${s.terapia}|||${s.prof}`)
    const showTE = s.terapiaExib && s.terapiaExib !== s.terapia ? s.terapiaExib : undefined
    const tipo: CellTipo = isAfet ? "afetada" : s.terapia === "Supervisão ABA" ? "supervisao" : "exist"
    cMap[k].push({ tP: s.terapia, tE: showTE, prof: s.prof, tipo, unidade: s.unidade })
  }

  for (const e of extra ?? []) {
    const k = `${e.dia}|||${e.hora}`
    if (!cMap[k]) cMap[k] = []
    cMap[k].push({ tP: e.tP, tE: e.tE, prof: e.prof, tipo: e.tipo, unidade: e.unidade })
  }

  return cMap
}

function AgendaGrid({
  cMap,
  dias,
  pacUnidade,
  inconsistencias,
}: {
  cMap: Record<string, CellEntry[]>
  dias: string[]
  pacUnidade: string | null
  inconsistencias: { dia: string; sessao: SessPacItem; unidCorreta: string }[]
}) {
  const horasGrid = HORAS_GRID.filter(h => dias.some(d => cMap[`${d}|||${h}`]?.length))
  if (!horasGrid.length) return <div className="text-center text-gray-400 py-4 text-xs">Nenhuma sessão.</div>
  const unitMeta = buildCronoUnitMeta(dias, cMap)
  const inconsMap = new Set(inconsistencias.map(i => `${i.dia}|||${i.sessao.hora}|||${i.sessao.prof}`))
  const unidCor = UNID_COR[pacUnidade ?? ""] ?? B.navy

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "320px" }}>
      <thead>
        <tr>
          <th style={{ width: "48px", paddingBottom: "6px", textAlign: "right", paddingRight: "8px", fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 400 }}>Hora</th>
          {dias.map(d => (
            <th key={d} style={{ minWidth: "120px", paddingBottom: "6px", textAlign: "center", fontSize: "13px", color: B.navy, fontWeight: 800 }}>
              <div>{d.replace("-feira", "")}</div>
              <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {horasGrid.map(hora => (
          <tr key={hora} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ textAlign: "right", paddingRight: "8px", verticalAlign: "top", paddingTop: "6px", fontFamily: "monospace", fontSize: "13px", fontWeight: 800, color: B.navy }}>{hora}</td>
            {dias.map(d => {
              const cells = cMap[`${d}|||${hora}`] || []
              return (
                <td key={d} style={{ padding: "2px", verticalAlign: "top" }}>
                  {cells.map((c, ci) => {
                    const cs = cellStyle(c.tipo)
                    const isIncons = inconsMap.has(`${d}|||${hora}|||${c.prof}`)
                    return (
                      <div key={ci} style={{ background: isIncons ? "#fffbeb" : cs.bg, border: `1px solid ${isIncons ? "#fbbf24" : cs.bd}`, borderRadius: "8px", padding: "6px 8px", marginBottom: "2px", minHeight: "58px", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: isIncons ? "var(--card-foreground)" : cs.tc, lineHeight: "1.3" }}>{c.tP}</div>
                        {c.tE && <div style={{ fontSize: "10px", color: isIncons ? "var(--muted-foreground)" : cs.sc, lineHeight: "1.2" }}>({c.tE})</div>}
                        <div style={{ fontSize: "10px", color: isIncons ? "var(--muted-foreground)" : cs.sc }}>{fmtName(c.prof)}</div>
                        {shouldShowSessionUnit(unitMeta, d, hora) && c.unidade && c.unidade !== "Desconhecida" && (
                          <div style={{ fontSize: "9px", fontWeight: 800, color: B.blue, background: B.blueLt, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "1px 5px", width: "fit-content" }}>
                            🏥 {unidadeBadgeText(c.unidade)}
                          </div>
                        )}
                        {cs.label && <div style={{ fontSize: "10px", fontWeight: 700, color: cs.lc!, marginTop: "auto" }}>{cs.label}</div>}
                        {isIncons && <div style={{ fontSize: "9px", fontWeight: 700, color: "#92400e" }}>⚠ Unidade divergente</div>}
                      </div>
                    )
                  })}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

export function SaidaCronModal({ pac, afetada, analise, statusAtual, onClose, onStatus, sessionTabs, sessionTabIdx, onSessionTabChange, todasAfetadas }: Props) {
  const { sessPac, buracoSiRemover, min2Violation, pacUnidade, inconsistencias,
    e1, e2, e3, e4, e5, e6, e7, semSolucao } = analise

  const defaultE = e1 ? "e1" : e2 ? "e2" : e3 ? "e3" : e4.length > 0 ? "e4_0" : e5 ? "e5" : e6 ? "e6" : e7 ? "e7" : null
  const [eSel, setESel] = useState<string | null>(statusAtual?.estrategiaSel ?? defaultE)
  const [opSel, setOpSel] = useState<number>(statusAtual?.opcaoSel ?? 0)
  const [obs, setObs] = useState(statusAtual?.obs ?? "")

  const st = statusAtual?.status ?? "pendente"
  const stS = STMAP[st] ?? STMAP.pendente
  const unidCor = UNID_COR[pacUnidade ?? ""] ?? B.navy

  // ── Resolução da estratégia/opção selecionada ──────────────────────────────

  type EstrategiaAtiva =
    | { kind: "simples"; opcoes: OpcaoEstrategia[] }
    | { kind: "swap"; opcoes: import("@/types/cronograma").OpcaoSwap[] }
    | { kind: "dia"; opcoes: import("@/types/cronograma").OpcaoDiaMigracao[] }
    | null

  function getEstrategiaAtiva(): EstrategiaAtiva {
    if (eSel === "e1" && e1) return { kind: "simples", opcoes: e1.opcoes }
    if (eSel === "e2" && e2) return { kind: "swap",    opcoes: e2.opcoes }
    if (eSel === "e3" && e3) return { kind: "simples", opcoes: e3.opcoes }
    if (eSel?.startsWith("e4_") && e4.length) return { kind: "simples", opcoes: e4[parseInt(eSel.split("_")[1])].opcoes }
    if (eSel === "e5" && e5) return { kind: "swap",    opcoes: e5.opcoes }
    if (eSel === "e6" && e6) return { kind: "dia",     opcoes: e6.opcoes }
    if (eSel === "e7" && e7) return { kind: "dia",     opcoes: e7.opcoes }
    return null
  }

  const eAt = getEstrategiaAtiva()
  const opcSel = eAt?.opcoes?.[opSel] ?? null

  // ── Movimentos da opção selecionada ───────────────────────────────────────

  function getMovimentos(): MovimentoSessao[] {
    if (!opcSel) return []
    if (eAt?.kind === "swap")    return (opcSel as import("@/types/cronograma").OpcaoSwap).movimentos
    if (eAt?.kind === "dia")     return (opcSel as import("@/types/cronograma").OpcaoDiaMigracao).movimentos
    // simples (E1, E3, E4)
    const op = opcSel as OpcaoEstrategia
    return [{
      deDia: afetada.dia, deHora: afetada.hora, deTerapia: afetada.terapia, deProf: afetada.prof,
      paraDia: op.dia, paraHora: op.hora, paraTerapia: op.terapia, paraProf: op.prof,
      paraUnidade: op.unidade, profMudou: op.prof !== afetada.prof,
    }]
  }

  const movimentos = getMovimentos()

  // ── Construção das grades Antes / Depois ──────────────────────────────────

  const remSet = new Set(movimentos.map(m => `${m.deDia}|||${m.deHora}|||${m.deProf}`))

  // Lookup terapiaExib a partir do sessPac para reutilizar o valor já gravado no CSV
  const sessPacExib = new Map<string, string>()
  for (const s of sessPac) {
    if (s.terapiaExib) sessPacExib.set(`${s.dia}|||${s.hora}|||${s.terapia}`, s.terapiaExib)
  }

  // IDs dos Grupos 3 (AE e HS) para cálculo de tE sem depender de nome
  const ID_AE = 2260, ID_HS = 2283

  const extraDepois = movimentos.map(m => {
    let tE: string | undefined
    if (m.paraTerapia === m.deTerapia) {
      // Mesma terapia movida (E2/E5/E6/E7): herda tE da sessão original
      tE = sessPacExib.get(`${m.deDia}|||${m.deHora}|||${m.deTerapia}`)
        ?? (ABA_EXIB_PSICO_NAMES.has(m.paraTerapia) ? EXIB_NOME[EXIB_ID.PSICOLOGIA_ABA] : undefined)
    } else {
      // Terapia diferente no slot (E4): tE calculado da NOVA terapia, nunca da removida
      const paraId = TERAPIA_ID[m.paraTerapia]
      if (ABA_EXIB_PSICO_NAMES.has(m.paraTerapia)) tE = EXIB_NOME[EXIB_ID.PSICOLOGIA_ABA]
      else if (paraId === ID_AE || paraId === ID_HS) tE = EXIB_NOME[EXIB_ID.PSICOLOGIA_ABA]
      // Grupo 2 (Fono, Fisio, TO, etc.): tE = undefined (exibição = ação)
    }
    if (tE === m.paraTerapia) tE = undefined
    return { dia: m.paraDia, hora: m.paraHora, tP: m.paraTerapia, prof: m.paraProf, tipo: "proposta" as CellTipo, unidade: m.paraUnidade, tE }
  })

  const afetadasGrid = todasAfetadas && todasAfetadas.length > 1 ? todasAfetadas : afetada

  // "Antes": sessões afetadas marcadas como removida
  const cMapAntes = buildCMap(sessPac, afetadasGrid)

  // "Depois": sessão atual removida/substituída; demais afetadas continuam visíveis como Removida
  const cMapDepois = buildCMap(
    sessPac,
    afetadasGrid,
    extraDepois,
    movimentos.map(m => ({ dia: m.deDia, hora: m.deHora, prof: m.deProf })),
  )

  const diasBase = [...new Set([...DIAS_LIST.slice(0, 5), ...sessPac.map(s => s.dia)])].sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))
  const diasDepois = [...new Set([
    ...diasBase,
    ...movimentos.map(m => m.paraDia),
  ])].sort((a, b) => (DIAS_ORD[a] ?? 9) - (DIAS_ORD[b] ?? 9))

  // ── Cards de estratégia ────────────────────────────────────────────────────

  const estrategiaCards = [
    { key: "e1",  tem: !!e1,           title: "#1 Mesma terapia, mesmo horário",                      tipKey: "e1" },
    { key: "e2",  tem: !!e2,           title: "#2 Qt. de Terapias: mantido. Posições: alterado. Profissionais: mantido.", tipKey: "e2" },
    { key: "e3",  tem: !!e3,           title: "#3 Mesma terapia, horário adjacente",                  tipKey: "e3" },
    ...e4.map((s, i) => ({ key: `e4_${i}`, tem: true, title: `#4 Outra terapia — ${s.esp}`,         tipKey: "e4" })),
    { key: "e5",  tem: !!e5,           title: "#5 Qt. de Terapias: mantido. Posições: alterado. Profissionais: alterado.", tipKey: "e5" },
    { key: "e6",  tem: !!e6,           title: "#6 Alterar dia de tratamento, mesmos profissionais.",  tipKey: "e6" },
    { key: "e7",  tem: !!e7,           title: "#7 Alterar dia de tratamento, profissionais diferentes.", tipKey: "e7" },
  ]

  // ── Rótulo da proposta no footer ──────────────────────────────────────────

  function descricaoProposta(): string {
    if (!opcSel) return "Selecione estratégia + opção para prosseguir."
    if (eAt?.kind === "swap" || eAt?.kind === "dia") {
      const movs = movimentos
      return movs.map(m => `${m.paraTerapia} — ${fmtName(m.paraProf)} · ${m.paraDia} ${m.paraHora}`).join(" | ")
    }
    const op = opcSel as OpcaoEstrategia
    return `${fmtName(op.prof)} · ${op.dia} ${op.hora}`
  }

  // ── Construção do slotReservado para reserva ──────────────────────────────

  function buildSlotReservado(): string | null {
    if (!opcSel) return null
    if (movimentos.length === 0) return null
    return movimentos.map(m => `${m.paraProf}|||${m.paraDia}|||${m.paraHora}`).join(";;")
  }

  // ── Salvamento ────────────────────────────────────────────────────────────

  function save(status: StatusSaida) {
    const isAtivo = status === "aguardando" || status === "resolvido"
    const opc = eAt?.kind === "simples" ? (opcSel as OpcaoEstrategia) : null
    onStatus(afetada, status, {
      estrategiaSel: eSel,
      opcaoSel: opSel,
      opcao: opc,
      movimentos: (eAt?.kind === "swap" || eAt?.kind === "dia") ? movimentos : null,
      obs,
      slotReservado: isAtivo ? buildSlotReservado() : null,
    })
    onClose()
  }

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card rounded-[18px] shadow-[0_24px_80px_rgba(0,0,0,.22)] w-[96vw] max-w-[1200px] max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-[14px] border-b border-gray-100 bg-gray-50 rounded-t-[18px]">
          {sessionTabs && sessionTabs.length > 1 && (
            <div className="flex gap-[5px] flex-wrap mb-3">
              {sessionTabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => onSessionTabChange?.(i)}
                  style={{
                    padding: "4px 11px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                    background: sessionTabIdx === i ? "#fef2f2" : "var(--muted)",
                    color: sessionTabIdx === i ? "#dc2626" : "var(--muted-foreground)",
                    border: sessionTabIdx === i ? "1.5px solid #fca5a5" : "1.5px solid #e5e7eb",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-between items-start gap-2 flex-wrap">
            <div className="flex flex-col gap-[5px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontWeight: 900, fontSize: "15px", color: B.navy }}>{pac}</span>
                {pacUnidade && (
                  <span style={{ background: unidCor + "18", color: unidCor, border: `1px solid ${unidCor}44`, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 700 }}>
                    🏥 {pacUnidade}
                  </span>
                )}
                <span style={{ background: B.blueLt, color: B.blue, border: `1px solid ${B.blue}33`, borderRadius: "999px", padding: "2px 10px", fontSize: "11px", fontWeight: 800 }}>
                  Convênio: {afetada.conv || "—"}
                </span>
                <CronoGlobalUnitBadge unit={null} />
                <span style={{ background: stS.bg, color: stS.c, borderRadius: "999px", padding: "2px 9px", fontSize: "10px", fontWeight: 700 }}>{stS.label}</span>
              </div>
              <div className="flex gap-[5px] flex-wrap text-[11px]">
                {(todasAfetadas && todasAfetadas.length > 1 ? todasAfetadas : [afetada]).map((af, i) => (
                  <span key={i} style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a588", borderRadius: "999px", padding: "2px 9px", fontWeight: 700 }}>
                    Saída: {af.terapiaExib ?? af.terapia} · {af.dia} {af.hora}
                  </span>
                ))}
                {buracoSiRemover && <span style={{ background: "#fff7ed", color: "#c2410c", borderRadius: "999px", padding: "2px 9px", fontWeight: 600 }}>Cria buraco</span>}
                {min2Violation && <span style={{ background: "#fff7ed", color: "#c2410c", borderRadius: "999px", padding: "2px 9px", fontWeight: 600 }}>Ficaria com menos de 2 sessões</span>}
                {inconsistencias.length > 0 && <span style={{ background: "#fff7ed", color: "#92400e", borderRadius: "999px", padding: "2px 9px", fontWeight: 600 }}>{inconsistencias.length} sessão(ões) unidade errada</span>}
              </div>
            </div>
            <div className="flex gap-[5px] items-center shrink-0">
              <button onClick={onClose} className="w-[30px] h-[30px] rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors text-base">×</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left panel — estratégias */}
            <div className="w-[300px] shrink-0 border-r border-gray-100 overflow-auto" style={{ padding: "12px 10px" }}>

              {estrategiaCards.map(({ key, tem, title, tipKey }) => {
                const cor = E_CORES[tipKey] ?? B.navy
                const isE5orE7 = tipKey === "e5" || tipKey === "e7"
                return (
                  <div
                    key={key}
                    onClick={() => { if (tem) { setESel(key); setOpSel(0) } }}
                    style={{
                      marginBottom: "6px", borderRadius: "10px",
                      border: `2px solid ${eSel === key ? cor + "99" : isE5orE7 ? "#fde68a" : "var(--border)"}`,
                      padding: "8px 10px",
                      background: eSel === key ? cor + "11" : isE5orE7 ? "#fffbeb" : "var(--card)",
                      cursor: tem ? "pointer" : "default",
                      opacity: tem ? 1 : 0.45,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "11px", color: tem ? B.navy : "var(--muted-foreground)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "4px" }}>
                      <span className="flex items-start" style={{ lineHeight: 1.3 }}>{title}<InfoTip text={E_TIPS[tipKey] || ""} /></span>
                      {!tem && <span style={{ color: "#dc2626", fontSize: "10px", flexShrink: 0 }}>sem vaga</span>}
                      {isE5orE7 && tem && <span style={{ color: "#92400e", fontSize: "9px", flexShrink: 0 }}>risco recusa</span>}
                    </div>

                    {/* Opções da estratégia selecionada */}
                    {tem && eSel === key && (() => {
                      if (key === "e2" && e2) return (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {e2.opcoes.map((op, i) => (
                            <button key={i} onClick={e => { e.stopPropagation(); setOpSel(i) }}
                              style={{ textAlign: "left", padding: "6px 8px", borderRadius: "7px", border: `1px solid ${opSel === i ? cor : cor + "44"}`, background: opSel === i ? cor + "22" : "var(--card)", cursor: "pointer", fontSize: "10px", color: "var(--card-foreground)" }}>
                              {op.movimentos.map((m, mi) => (
                                <div key={mi} style={{ fontWeight: mi === 0 ? 700 : 400, color: mi === 0 ? "var(--card-foreground)" : "var(--muted-foreground)" }}>
                                  {m.paraTerapia !== afetada.terapia ? `${m.paraTerapia} → ` : ""}{fmtName(m.paraProf)} · {m.paraDia !== afetada.dia ? m.paraDia + " " : ""}{m.paraHora}
                                </div>
                              ))}
                            </button>
                          ))}
                        </div>
                      )
                      if (key === "e5" && e5) return (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {e5.opcoes.map((op, i) => (
                            <button key={i} onClick={e => { e.stopPropagation(); setOpSel(i) }}
                              style={{ textAlign: "left", padding: "6px 8px", borderRadius: "7px", border: `1px solid ${opSel === i ? cor : cor + "44"}`, background: opSel === i ? cor + "22" : "var(--card)", cursor: "pointer", fontSize: "10px", color: "var(--card-foreground)" }}>
                              {op.movimentos.map((m, mi) => (
                                <div key={mi}>{fmtName(m.paraProf)} · {m.paraDia !== afetada.dia ? m.paraDia + " " : ""}{m.paraHora}</div>
                              ))}
                              {op.profissionaisAlterados.length > 0 && (
                                <div style={{ fontSize: "9px", color: "#c2410c", marginTop: "2px" }}>Troca: {op.profissionaisAlterados.map(fmtName).join(", ")}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                      if ((key === "e6" && e6) || (key === "e7" && e7)) {
                        const strat = key === "e6" ? e6! : e7!
                        return (
                          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                            {strat.opcoes.map((op, i) => (
                              <button key={i} onClick={e => { e.stopPropagation(); setOpSel(i) }}
                                style={{ textAlign: "left", padding: "6px 8px", borderRadius: "7px", border: `1px solid ${opSel === i ? cor : cor + "44"}`, background: opSel === i ? cor + "22" : "var(--card)", cursor: "pointer", fontSize: "10px", color: "var(--card-foreground)" }}>
                                <div style={{ fontWeight: 700 }}>{op.diaOrigem.replace("-feira", "")} → {op.diaDestino.replace("-feira", "")}</div>
                                {op.profissionaisAlterados.length > 0 && (
                                  <div style={{ fontSize: "9px", color: "#c2410c", marginTop: "2px" }}>Troca: {op.profissionaisAlterados.map(fmtName).join(", ")}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )
                      }
                      // Estratégias simples (E1, E3, E4)
                      const strat = key === "e1" ? e1 : key === "e3" ? e3 : e4[parseInt(key.split("_")[1])]
                      if (!strat) return null
                      return (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {strat.opcoes.map((op, i) => (
                            <button key={i} onClick={e => { e.stopPropagation(); setOpSel(i) }}
                              style={{ textAlign: "left", padding: "6px 8px", borderRadius: "7px", border: `1px solid ${opSel === i ? cor : cor + "44"}`, background: opSel === i ? cor + "22" : "var(--card)", cursor: "pointer", fontSize: "11px", fontWeight: opSel === i ? 700 : 400, color: "var(--card-foreground)" }}>
                              <div style={{ fontWeight: 700 }}>{fmtName(op.prof)}</div>
                              <div style={{ color: "var(--muted-foreground)" }}>{op.dia !== afetada.dia ? op.dia + " " : ""}{op.hora} · {op.unidade}</div>
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {semSolucao && (
                <div style={{ background: "#fef2f2", borderRadius: "9px", padding: "9px 10px", fontSize: "11px", color: "#dc2626", border: "1px solid #fca5a5" }}>
                  <div style={{ fontWeight: 700, marginBottom: "3px" }}>Sem solução automática</div>
                  <div>Nenhuma vaga encontrada. Tratativa manual necessária.</div>
                </div>
              )}

              {inconsistencias.length > 0 && (
                <div style={{ marginTop: "8px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "9px", padding: "8px 10px", fontSize: "11px", color: "#92400e" }}>
                  <div style={{ fontWeight: 700, marginBottom: "4px" }}>Uso interno — unidade inconsistente:</div>
                  {inconsistencias.map((ic, i) => (
                    <div key={i} style={{ marginBottom: "3px" }}>• {ic.dia}: {fmtName(ic.sessao.prof)} ({ic.sessao.terapia}) em {ic.sessao.unidade} — deveria ser {ic.unidCorreta}</div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: "3px" }}>Observação</div>
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Ex: WA enviado em xx/xx..."
                  style={{ width: "100%", height: "54px", border: "1px solid var(--border)", borderRadius: "7px", padding: "5px 7px", fontSize: "11px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
            </div>

          {/* Right panel — grades Antes / Depois */}
          <div className="flex-1 overflow-auto p-3">
                {/* Legenda */}
                <div className="flex gap-3 mb-2 text-[10px] text-gray-400 flex-wrap">
                  {(["Removida", "Proposta", "Existente", "Supervisão ABA"] as const).map((l, i) => {
                    const cs = [cellStyle("afetada"), cellStyle("proposta"), cellStyle("exist"), cellStyle("supervisao")][i]
                    return (
                      <span key={l} className="flex items-center gap-1">
                        <span style={{ display: "inline-block", width: "9px", height: "9px", borderRadius: "2px", background: cs.bg, border: `1px solid ${cs.bd}` }} />
                        {l}
                      </span>
                    )
                  })}
                </div>

                {/* Grade ANTES */}
                <div style={{ marginBottom: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--muted-foreground)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Atual
                  </div>
                  {sessPac.length === 0
                    ? <div className="text-center text-gray-400 py-4 text-xs">Nenhuma sessão encontrada.</div>
                    : <AgendaGrid cMap={cMapAntes} dias={diasBase} pacUnidade={pacUnidade} inconsistencias={inconsistencias} />
                  }
                </div>

                {/* Separador + Grade DEPOIS */}
                {opcSel && movimentos.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                      <div style={{ fontSize: "11px", fontWeight: 800, color: B.navy, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "4px" }}>
                        ↓ Proposta
                      </div>
                      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                    </div>
                    <AgendaGrid cMap={cMapDepois} dias={diasDepois} pacUnidade={pacUnidade} inconsistencias={[]} />
                  </div>
                )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-[10px] border-t border-gray-100 flex gap-[6px] flex-wrap items-center bg-gray-50 rounded-b-[18px]">
          <div className="flex-1 text-[11px] text-gray-400 truncate">{descricaoProposta()}</div>
          {(st === "pendente" || st === "recusado") && (
            <>
              <button onClick={() => save("aguardando")} disabled={!opcSel} style={{ padding: "7px 12px", borderRadius: "9px", border: "none", background: opcSel ? "#16a34a" : "#86efac", color: "white", fontWeight: 700, fontSize: "11px", cursor: opcSel ? "pointer" : "not-allowed" }}>Aceitar (→ Acompanhamento)</button>
              <button onClick={() => save("sem_solucao")} style={{ padding: "7px 12px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--muted)", color: "var(--muted-foreground)", fontWeight: 600, fontSize: "11px", cursor: "pointer" }}>⛔ Inviável</button>
            </>
          )}
          {st === "aguardando" && (
            <>
              <button onClick={() => save("sem_solucao")} style={{ padding: "7px 12px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--muted)", color: "var(--muted-foreground)", fontWeight: 600, fontSize: "11px", cursor: "pointer" }}>⛔ Inviável</button>
              <button onClick={() => save("pendente")} style={{ padding: "7px 12px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)", fontWeight: 600, fontSize: "11px", cursor: "pointer" }}>Cancelar</button>
            </>
          )}
          <button onClick={onClose} style={{ padding: "7px 12px", borderRadius: "9px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)", fontWeight: 600, fontSize: "11px", cursor: "pointer" }}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
