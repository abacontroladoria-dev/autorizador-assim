"use client"

import { useMemo, useState } from "react"
import { B } from "@/lib/cronograma/constants"
import { waKey } from "@/lib/cronograma/helpers"
import { exportBase } from "@/lib/cronograma/xlsx"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { BancoDadosTab } from "@/components/cronograma/solicitacoes/BancoDadosTab"
import { RecusadosTab } from "./RecusadosTab"
import { InviavelTab } from "./InviavelTab"
import type { AlgorithmResult, Sugestao, WaStatus } from "@/types/cronograma"

interface Props {
  res: AlgorithmResult | null
  onWA: (s: Sugestao) => void
  onWAUndo: (s: Sugestao) => void
  onWAStatus: (s: Sugestao, st: WaStatus) => void
  onRec: (s: Sugestao) => void
  onInv: (s: Sugestao) => void
  onCron: (s: Sugestao) => void
}

type Sub = "aguardando" | "recusados" | "inviavel"
type Origem = "" | "ocupacao" | "saida"

const ORIGEM_LABELS: Record<string, string> = {
  ocupacao: "Aumentar Ocupação (Clínica)",
  saida: "Saída de Profissional",
}

export function AcompanhamentoTab({ res, onWA, onWAUndo, onWAStatus, onRec, onInv, onCron }: Props) {
  const { cRows, rec, inv, waMap, statusMap, sRec, sInv, sWa, persistStatus } = useCronogramaData()
  const [sub, setSub] = useState<Sub>("aguardando")
  const [fOrigem, setFOrigem] = useState<Origem>("")
  const [ocupOpen, setOcupOpen] = useState(false)
  const [saidaOpen, setSaidaOpen] = useState(false)
  const [invModalPac, setInvModalPac] = useState<string | null>(null)
  const [invMotivo, setInvMotivo] = useState("")

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

  const aguardandoSaidaCount = Object.values(statusMap).filter(v => v.status === "aguardando").length
  const aguardandoCount = aguardandoOcup.length + aguardandoSaidaCount

  const SUBS: { key: Sub; label: string; count: number }[] = [
    { key: "aguardando", label: "Aguardando Resposta", count: aguardandoCount },
    { key: "recusados",  label: "Recusados",           count: rec.length },
    { key: "inviavel",   label: "Inviáveis",            count: inv.length },
  ]

  function handleOcupAceito(key: string) {
    sWa({ ...waMap, [key]: "aceito" as WaStatus })
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
    // Remove all waMap entries for this patient
    const next = Object.fromEntries(Object.entries(waMap).filter(([k]) => !k.startsWith(`${invModalPac}|||`)))
    sWa(next)
    sInv([...inv, { paciente: invModalPac, motivo: invMotivo, registradoEm: new Date().toLocaleDateString("pt-BR") }])
    setInvModalPac(null)
    setInvMotivo("")
  }

  const showOcup  = fOrigem === "" || fOrigem === "ocupacao"
  const showSaida = fOrigem === "" || fOrigem === "saida"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* Sub-abas */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
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
      </div>

      {/* Conteúdo */}
      {sub === "aguardando" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Filtro por origem */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)", fontWeight: 600 }}>Filtrar por origem:</span>
            {(["", "ocupacao", "saida"] as Origem[]).map(o => (
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
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--cron-active-bg)", border: `1px solid ${B.blue}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
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
                  onAceito={() => handleOcupAceito(key)}
                  onRecusado={() => handleOcupRecusado(key, sug)}
                  onInviavel={() => handleOcupInviavel(pac)}
                  onCancelar={() => handleOcupCancelar(key)}
                  onVer={() => sug && onCron(sug)}
                />
              ))}
            </div>
          )}

          {/* Seção Saída de Profissional */}
          {showSaida && aguardandoSaidaCount > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={() => setSaidaOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--muted)", border: `1px solid ${B.purple}44`, borderRadius: "12px", padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ fontSize: "12px", color: B.purple, fontWeight: 700, flex: 1 }}>
                  🚪 Saída de Profissional · {aguardandoSaidaCount}
                </span>
                <span style={{ fontSize: "11px", color: B.purple }}>{saidaOpen ? "▲ Recolher" : "▼ Expandir"}</span>
              </button>
              {saidaOpen && <BancoDadosTab cRows={cRows} statusMap={statusMap} persistStatus={persistStatus} />}
            </div>
          )}
        </div>
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
          <div style={{ background: "var(--card)", borderRadius: "18px", boxShadow: "0 20px 60px rgba(0,0,0,.2)", maxWidth: "380px", width: "100%", padding: "20px" }}>
            <div style={{ fontWeight: 900, fontSize: "17px", marginBottom: "4px" }}>⛔ Marcar como Inviável</div>
            <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "10px" }}>Removido de TODAS as sugestões até tirado da lista.</div>
            <div style={{ background: "var(--muted)", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", fontWeight: 700, marginBottom: "10px" }}>{invModalPac}</div>
            <textarea value={invMotivo} onChange={e => setInvMotivo(e.target.value)} placeholder="Motivo (ex: família faltando muito...)" rows={2}
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: "10px", padding: "8px 12px", fontSize: "13px", fontFamily: "inherit", resize: "none", marginBottom: "14px", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={confirmarInviavel} style={{ padding: "8px 16px", borderRadius: "10px", background: B.navy, color: "white", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: "13px" }}>
                Confirmar
              </button>
              <button onClick={() => { setInvModalPac(null); setInvMotivo("") }} style={{ flex: 1, padding: "8px 16px", borderRadius: "10px", background: "var(--muted)", color: "var(--card-foreground)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OrigemLabel({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
      <span style={{ fontSize: "11px", fontWeight: 700, color, background: "var(--card)", padding: "2px 10px", border: `1px solid ${color}33`, borderRadius: "999px" }}>
        {label} · {count}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
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
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button onClick={onVer} style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "8px", background: "var(--card)", color: B.blue, border: `1px solid ${B.blue}33`, cursor: "pointer" }}>
            🗓 Ver
          </button>
          <button onClick={onAceito} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontWeight: 700 }}>
            Responsável Confirmou
          </button>
          <button onClick={onRecusado} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", cursor: "pointer", fontWeight: 700 }}>
            Recusou
          </button>
          <button onClick={onInviavel} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 700 }}>
            Inviável
          </button>
          <button onClick={onCancelar} style={{ fontSize: "11px", padding: "4px 9px", borderRadius: "8px", background: "var(--card)", color: "var(--muted-foreground)", border: "1px solid var(--border)", cursor: "pointer" }}
            title="Desfaz o aceite — volta como sugestão não trabalhada em Aumentar Ocupação (Clínica)">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
