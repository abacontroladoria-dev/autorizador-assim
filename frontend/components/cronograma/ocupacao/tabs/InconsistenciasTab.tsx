"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { B } from "@/lib/cronograma/constants"
import type { IncItem, IncTipo } from "@/lib/cronograma/inconsistencias"
import type { CsvRow } from "@/types/cronograma"

const SK = "cron_excecoes_v1"

type Excecao = { obs: string; confirmedAt: number }

const TIPO_LABEL: Record<IncTipo, string> = {
  unidade_turno: "Unidade no Turno",
  buraco:        "Buraco entre Sessões",
  min_sessoes:   "Menos de 2 Sessões/Dia",
  exibicao_aba:  "Exibição ABA",
  exibicao_hs:   "Exibição HS",
  exibicao_ae:   "Exibição AE / ASSIM",
}

const TIPO_COLOR: Record<IncTipo, { bg: string; c: string; border: string }> = {
  unidade_turno: { bg: "#fff7ed", c: "#c2410c", border: "#fed7aa" },
  buraco:        { bg: "#fef2f2", c: "#dc2626", border: "#fca5a5" },
  min_sessoes:   { bg: "#fffbeb", c: "#b45309", border: "#fde68a" },
  exibicao_aba:  { bg: "#f0f9ff", c: "#0369a1", border: "#bae6fd" },
  exibicao_hs:   { bg: "#faf5ff", c: "#7e22ce", border: "#e9d5ff" },
  exibicao_ae:   { bg: "#fdf4ff", c: "#86198f", border: "#f0abfc" },
}

const DIAS_ORDER = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]

interface Props {
  items: IncItem[]
  cRows: CsvRow[]
}

// ─── Schedlule modal ──────────────────────────────────────────────────────────

interface SessaoView {
  dia: string
  hora: string
  terapia: string
  terapiaExib: string
  prof: string
  unidade: string
  flagged: boolean
  flagDetalhe: string
}

function buildSchedule(pac: string, cRows: CsvRow[], incItems: IncItem[]): Record<string, SessaoView[]> {
  const flagMap = new Map<string, string[]>()
  for (const i of incItems) {
    if (i.pac === pac) {
      const k = `${i.dia}|||${i.hora}|||${i.terapia}`
      const detail = i.detalhe + (i.terapiaExibAtual ? ` (atual: "${i.terapiaExibAtual}", esperado: "${i.terapiaExibEsperada}")` : "")
      flagMap.set(k, [...(flagMap.get(k) || []), detail])
    }
  }

  const byDia: Record<string, SessaoView[]> = {}
  for (const r of cRows) {
    if (String(r["Nome Favorecido"] || "").trim() !== pac) continue
    if (r["Status do Agendamento"] !== "Agendado") continue
    const dia = String(r["Dia da Semana"] || "").trim()
    const hora = String(r["HI_str"] || String(r["Hora Inicial"] || "").slice(0, 5) || "")
    const terapia = String(r["Terapia"] || "").trim()
    const terapiaExib = String(r["Terapia Exibição"] || r["Terapia Exibicao"] || "—").trim() || "—"
    const prof = String(r["Profissional"] || "").trim()
    const unidade = String((r as Record<string, unknown>)["Unidade"] || "").trim()
    const k = `${dia}|||${hora}|||${terapia}`
    const detalhe = (flagMap.get(k) || []).join(" · ")
    if (!byDia[dia]) byDia[dia] = []
    byDia[dia].push({ dia, hora, terapia, terapiaExib, prof, unidade, flagged: !!detalhe, flagDetalhe: detalhe })
  }

  for (const d of Object.keys(byDia)) {
    byDia[d].sort((a, b) => a.hora.localeCompare(b.hora))
  }
  return byDia
}

function fmtProf(nome: string) {
  const parts = nome.split(" ").filter(Boolean)
  if (parts.length <= 1) return nome
  return parts[0] + " " + parts[parts.length - 1]
}

interface CronViewModalProps {
  pac: string
  conv: string
  cRows: CsvRow[]
  items: IncItem[]
  onClose: () => void
}

function CronViewModal({ pac, conv, cRows, items, onClose }: CronViewModalProps) {
  const byDia = useMemo(() => buildSchedule(pac, cRows, items), [pac, cRows, items])
  const dias = DIAS_ORDER.filter(d => byDia[d])

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: "24px 16px", overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--color-card, white)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", width: "100%", maxWidth: "780px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 20px 14px", borderBottom: "1px solid #e5e7eb" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: "15px" }}>{pac}</div>
            {conv && <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>{conv}</div>}
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px 10px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "#f3f4f6", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}
          >
            ✕ Fechar
          </button>
        </div>

        {/* Schedule */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {dias.length === 0 && (
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "13px", padding: "24px 0" }}>
              Nenhuma sessão agendada encontrada no CSV.
            </div>
          )}
          {dias.map(dia => (
            <div key={dia}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
                {dia}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280", width: "60px", borderRadius: "6px 0 0 6px" }}>Hora</th>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Terapia</th>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Exibição</th>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Profissional</th>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#6b7280", borderRadius: "0 6px 6px 0" }}>Unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {byDia[dia].map((s, i) => (
                    <tr
                      key={i}
                      style={{
                        background: s.flagged ? "#fef9c3" : "transparent",
                        borderLeft: s.flagged ? "3px solid #f59e0b" : "3px solid transparent",
                      }}
                    >
                      <td style={{ padding: "6px 10px", fontWeight: 700, color: s.flagged ? "#92400e" : "#374151" }}>{s.hora}</td>
                      <td style={{ padding: "6px 10px", color: "#374151" }}>{s.terapia}</td>
                      <td style={{ padding: "6px 10px", color: s.flagged ? "#dc2626" : "#374151" }}>{s.terapiaExib}</td>
                      <td style={{ padding: "6px 10px", color: "#6b7280" }}>{fmtProf(s.prof)}</td>
                      <td style={{ padding: "6px 10px", color: "#9ca3af", fontSize: "11px" }}>{s.unidade || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Detalhes das flags neste dia */}
              {byDia[dia].some(s => s.flagged) && (
                <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {byDia[dia].filter(s => s.flagged).map((s, i) => (
                    <div key={i} style={{ fontSize: "11px", color: "#92400e", background: "#fef3c7", borderRadius: "6px", padding: "4px 8px" }}>
                      ⚠ {s.hora} — {s.flagDetalhe}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function InconsistenciasTab({ items, cRows }: Props) {
  const [subTab, setSubTab] = useState<"inc" | "exc">("inc")
  const [excecoes, setExcecoes] = useState<Record<string, Excecao>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draftObs, setDraftObs] = useState("")
  const [busca, setBusca] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<IncTipo | "">("")
  const [viewItem, setViewItem] = useState<IncItem | null>(null)

  useEffect(() => {
    try {
      const s = localStorage.getItem(SK)
      if (s) setExcecoes(JSON.parse(s))
    } catch {}
  }, [])

  function persistExcecoes(next: Record<string, Excecao>) {
    setExcecoes(next)
    try { localStorage.setItem(SK, JSON.stringify(next)) } catch {}
  }

  function promoverExcecao(id: string) {
    if (!draftObs.trim()) return
    persistExcecoes({ ...excecoes, [id]: { obs: draftObs.trim(), confirmedAt: Date.now() } })
    setExpandedId(null)
    setDraftObs("")
  }

  function removerExcecao(id: string) {
    const next = { ...excecoes }
    delete next[id]
    persistExcecoes(next)
  }

  const inconsistencias = useMemo(() => items.filter(i => !excecoes[i.id]), [items, excecoes])
  const excList = useMemo(
    () => items.filter(i => excecoes[i.id]).map(i => ({ item: i, exc: excecoes[i.id] })),
    [items, excecoes],
  )

  const filtered = useMemo(() => {
    let list = inconsistencias
    if (busca.trim()) {
      const b = busca.toLowerCase()
      list = list.filter(i => i.pac.toLowerCase().includes(b) || i.prof.toLowerCase().includes(b))
    }
    if (filtroTipo) list = list.filter(i => i.tipo === filtroTipo)
    return [...list].sort((a, b) => {
      const da = DIAS_ORDER.indexOf(a.dia) + 1 || 99
      const db = DIAS_ORDER.indexOf(b.dia) + 1 || 99
      return da - db || a.hora.localeCompare(b.hora) || a.pac.localeCompare(b.pac)
    })
  }, [inconsistencias, busca, filtroTipo])

  function abrevNome(nome: string) {
    const parts = nome.split(" ").filter(Boolean)
    if (parts.length <= 2) return nome
    return `${parts[0]} ${parts.slice(1).filter(p => p.length > 2).map(p => p[0] + ".").join(" ")} ${parts[parts.length - 1]}`
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Sub-abas */}
      <div style={{ display: "flex", gap: "6px" }}>
        {([
          { key: "inc", label: "⚠️ Regras feridas", count: inconsistencias.length },
          { key: "exc", label: "✅ Exceções",        count: excList.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 700,
              cursor: "pointer",
              border: subTab === t.key ? `2px solid ${B.navy}` : "2px solid #e5e7eb",
              background: subTab === t.key ? B.navy : "#f3f4f6",
              color: subTab === t.key ? "white" : "#374151",
              fontFamily: "inherit",
            }}
          >
            {t.label} · {t.count}
          </button>
        ))}
      </div>

      {/* ── Aba Regras feridas ─────────────────────────────────────── */}
      {subTab === "inc" && (
        <>
          {/* Filtros */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar paciente ou profissional..."
              style={{
                flex: "1 1 220px", padding: "7px 12px",
                border: "1px solid #d1d5db", borderRadius: "9px",
                fontSize: "12px", fontFamily: "inherit",
                background: "var(--color-card, white)", color: "inherit",
              }}
            />
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value as IncTipo | "")}
              style={{
                padding: "7px 12px", border: "1px solid #d1d5db", borderRadius: "9px",
                fontSize: "12px", fontFamily: "inherit",
                background: "var(--color-card, white)", color: "inherit",
              }}
            >
              <option value="">Todos os tipos</option>
              {(Object.keys(TIPO_LABEL) as IncTipo[]).map(t => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
          </div>

          {/* Resumo por tipo */}
          {inconsistencias.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {(Object.keys(TIPO_LABEL) as IncTipo[]).map(t => {
                const cnt = inconsistencias.filter(i => i.tipo === t).length
                if (!cnt) return null
                const c = TIPO_COLOR[t]
                return (
                  <span
                    key={t}
                    onClick={() => setFiltroTipo(filtroTipo === t ? "" : t)}
                    style={{
                      padding: "3px 10px", borderRadius: "999px",
                      fontSize: "11px", fontWeight: 700, cursor: "pointer",
                      background: c.bg, color: c.c, border: `1px solid ${c.border}`,
                      opacity: filtroTipo && filtroTipo !== t ? 0.45 : 1,
                    }}
                  >
                    {TIPO_LABEL[t]} · {cnt}
                  </span>
                )
              })}
            </div>
          )}

          {/* Lista */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#9ca3af", fontSize: "13px" }}>
              {inconsistencias.length === 0
                ? "Nenhuma regra ferida detectada. Carregue CSV e laudos para analisar."
                : "Nenhum resultado para o filtro selecionado."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {filtered.map(item => {
                const c = TIPO_COLOR[item.tipo]
                const isExpanded = expandedId === item.id
                return (
                  <div
                    key={item.id}
                    style={{ border: `1px solid ${c.border}`, borderRadius: "12px", background: "var(--color-card, white)", overflow: "hidden" }}
                  >
                    {/* Linha principal */}
                    <div style={{ display: "flex", gap: "10px", padding: "10px 14px", alignItems: "flex-start", flexWrap: "wrap" }}>
                      {/* Tipo badge */}
                      <span style={{
                        padding: "2px 8px", borderRadius: "999px",
                        fontSize: "10px", fontWeight: 700,
                        background: c.bg, color: c.c, border: `1px solid ${c.border}`,
                        whiteSpace: "nowrap", alignSelf: "center",
                      }}>
                        {TIPO_LABEL[item.tipo]}
                      </span>

                      {/* Info */}
                      <div style={{ flex: "1 1 160px" }}>
                        <div style={{ fontWeight: 700, fontSize: "13px" }}>{abrevNome(item.pac)}</div>
                        <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>
                          {item.dia} {item.hora} · {item.terapia}
                        </div>
                        {item.conv && (
                          <div style={{ fontSize: "10px", color: "#9ca3af" }}>{item.conv}</div>
                        )}
                      </div>

                      {/* Detalhe */}
                      <div style={{ flex: "2 1 200px", fontSize: "12px", color: "#374151", alignSelf: "center" }}>
                        {item.detalhe}
                        {item.terapiaExibAtual && (
                          <div style={{ marginTop: "3px", fontSize: "11px" }}>
                            <span style={{ color: "#dc2626" }}>Atual: "{item.terapiaExibAtual}"</span>
                            {" → "}
                            <span style={{ color: "#16a34a" }}>Esperado: "{item.terapiaExibEsperada}"</span>
                          </div>
                        )}
                      </div>

                      {/* Botões */}
                      <div style={{ display: "flex", gap: "6px", alignSelf: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => setViewItem(item)}
                          style={{
                            padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                            cursor: "pointer", border: "1px solid #d1d5db",
                            background: "var(--color-card, white)", color: "#374151",
                            fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          🗓 Ver
                        </button>
                        <button
                          onClick={() => {
                            setExpandedId(isExpanded ? null : item.id)
                            if (!isExpanded) setDraftObs("")
                          }}
                          style={{
                            padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                            cursor: "pointer", border: "1px solid #d1d5db",
                            background: isExpanded ? "#f3f4f6" : "var(--color-card, white)", color: "#374151",
                            fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          {isExpanded ? "Cancelar" : "→ Exceção"}
                        </button>
                      </div>
                    </div>

                    {/* Formulário de exceção inline */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${c.border}`, padding: "10px 14px", background: c.bg, display: "flex", gap: "8px", alignItems: "flex-end" }}>
                        <textarea
                          value={draftObs}
                          onChange={e => setDraftObs(e.target.value)}
                          placeholder="Justificativa para a exceção..."
                          rows={2}
                          style={{
                            flex: 1, padding: "7px 10px",
                            border: "1px solid #d1d5db", borderRadius: "8px",
                            fontSize: "12px", fontFamily: "inherit",
                            resize: "none", background: "white",
                          }}
                        />
                        <button
                          onClick={() => promoverExcecao(item.id)}
                          disabled={!draftObs.trim()}
                          style={{
                            padding: "7px 14px", borderRadius: "8px",
                            fontSize: "12px", fontWeight: 700,
                            cursor: draftObs.trim() ? "pointer" : "not-allowed",
                            border: "none",
                            background: draftObs.trim() ? "#16a34a" : "#86efac",
                            color: "white", fontFamily: "inherit", whiteSpace: "nowrap",
                          }}
                        >
                          Confirmar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Aba Exceções ──────────────────────────────────────────────── */}
      {subTab === "exc" && (
        <>
          {excList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: "#9ca3af", fontSize: "13px" }}>
              Nenhuma exceção registrada ainda.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {excList.map(({ item, exc }) => {
                const c = TIPO_COLOR[item.tipo]
                return (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e5e7eb", borderRadius: "12px",
                      background: "var(--color-card, white)",
                      padding: "10px 14px", display: "flex", gap: "10px",
                      alignItems: "flex-start", flexWrap: "wrap",
                    }}
                  >
                    <span style={{
                      padding: "2px 8px", borderRadius: "999px",
                      fontSize: "10px", fontWeight: 700,
                      background: c.bg, color: c.c, border: `1px solid ${c.border}`,
                      whiteSpace: "nowrap", alignSelf: "center",
                    }}>
                      {TIPO_LABEL[item.tipo]}
                    </span>

                    <div style={{ flex: "1 1 160px" }}>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>{abrevNome(item.pac)}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>
                        {item.dia} {item.hora} · {item.terapia}
                      </div>
                    </div>

                    <div style={{ flex: "2 1 200px" }}>
                      <div style={{ fontSize: "12px", color: "#374151", fontStyle: "italic" }}>"{exc.obs}"</div>
                      <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "3px" }}>
                        {new Date(exc.confirmedAt).toLocaleDateString("pt-BR")}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignSelf: "center" }}>
                      <button
                        onClick={() => setViewItem(item)}
                        style={{
                          padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                          cursor: "pointer", border: "1px solid #d1d5db",
                          background: "var(--color-card, white)", color: "#374151",
                          fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                      >
                        🔍 Ver
                      </button>
                      <button
                        onClick={() => removerExcecao(item.id)}
                        style={{
                          padding: "5px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                          cursor: "pointer", border: "1px solid #fca5a5",
                          background: "#fef2f2", color: "#dc2626",
                          fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                      >
                        Remover Exceção
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Modal Ver Cronograma ──────────────────────────────────────── */}
      {viewItem && (
        <CronViewModal
          pac={viewItem.pac}
          conv={viewItem.conv}
          cRows={cRows}
          items={items}
          onClose={() => setViewItem(null)}
        />
      )}
    </div>
  )
}
