"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BarChart3, Calendar, ChevronDown, Clock, ClipboardList, Compass, DoorOpen,
  Download, FileText, Inbox, MapPin, RotateCcw, Search, User, UserRound, XCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { fmtName } from "@/lib/cronograma/helpers"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { ListCard, EmptyState, SearchInput } from "@/components/cronograma/ui/DataTable"
import type { InvItem, RecItem, WaMap } from "@/types/cronograma"
import {
  buildSlotChave, agruparAuditoriaPorSlot, listarAuditoriaRecusas,
  type CronogramaRecusaAuditoria, type RecusaOrigem,
} from "@/services/cronogramaRecusasAuditoria.service"

interface Props {
  rec: RecItem[]
  inv: InvItem[]
  waMap: WaMap
  onRemove: (i: number) => void
  onExportCSV?: () => void
}

// criado_em_brasilia chega formatado "DD/MM/AAAA HH:MM" (trigger no banco) —
// aqui só separa em data/hora pra virarem campos distintos no painel de
// detalhe. Recusas legadas sem linha de auditoria não têm hora registrada.
function splitDataHora(criadoEmBrasilia: string | null | undefined, dataFallback: string): { data: string; hora: string } {
  if (!criadoEmBrasilia) return { data: dataFallback, hora: "Registros a partir de 25/08/2026" }
  const [data, hora] = criadoEmBrasilia.split(" ")
  return { data: data || dataFallback, hora: hora || "Registros a partir de 25/08/2026" }
}

const ORIGEM_META: Record<RecusaOrigem, { label: string; icon: LucideIcon }> = {
  "ocp-clinica": { label: "Ocupação Clínica", icon: ClipboardList },
  "ocp-profissional": { label: "Ocupação Profissional", icon: BarChart3 },
  "ocp-paciente": { label: "Ocupação Paciente", icon: UserRound },
  "saida-profissional": { label: "Saída de Profissional", icon: DoorOpen },
}

const RECUSAS_VISIVEIS_PADRAO = 2

type ReativadoItem = {
  slotChave: string
  paciente: string
  profissional: string
  especialidade: string
  unidade: string
  dia: string
  hora: string
  historico: CronogramaRecusaAuditoria[]
}

export function RecusadosTab({ rec, onRemove, onExportCSV }: Props) {
  const [removIdx, setRemovIdx] = useState<number | null>(null)
  const [filtro, setFiltro] = useState("")
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)
  // Cards de paciente com mais de RECUSAS_VISIVEIS_PADRAO recusas começam
  // recolhidos (só as 2 primeiras) — "Ver todas" expande por paciente.
  const [pacientesExpandidos, setPacientesExpandidos] = useState<Set<string>>(new Set())
  // "Recusados" = ainda bloqueados (fonte: rec/pacBundles/statusMap, como sempre).
  // "Reativados" = já não bloqueiam mais nada — não existem em `rec`, só na
  // auditoria (última ação do slot_chave = "reativar"). Pedido do usuário:
  // reativar um item some da lista principal (correto, deixou de ser um
  // bloqueio ativo), mas ele precisa continuar revisável sem abrir o Supabase.
  const [modo, setModo] = useState<"recusados" | "reativados">("recusados")
  // Histórico de cada slot começa mostrando só os 2 últimos registros — um
  // slot recusado/reativado várias vezes gerava um scroll enorme dentro do
  // card. "Ver histórico completo" expande por slot (chave = slotChave).
  const [historicosExpandidos, setHistoricosExpandidos] = useState<Set<string>>(new Set())
  const toggleHistorico = (chave: string) => setHistoricosExpandidos(prev => {
    const next = new Set(prev)
    if (next.has(chave)) next.delete(chave)
    else next.add(chave)
    return next
  })

  // Auditoria (usuário/data/hora/histórico) é uma tabela paralela só de
  // leitura — não é a fonte de verdade de "o que está bloqueado" (isso
  // continua sendo `rec`/pacBundles/statusMap, sem mudança de comportamento).
  // Recusas registradas antes desta funcionalidade simplesmente não têm linha
  // aqui — o painel de detalhe cai no fallback "Registros a partir de 25/08/2026".
  const [auditoria, setAuditoria] = useState<CronogramaRecusaAuditoria[]>([])
  const [carregandoAuditoria, setCarregandoAuditoria] = useState(true)

  // Refaz a busca sempre que `rec` mudar (não só uma vez no mount) — sem
  // isso, recusar/reativar dentro da mesma sessão gravava certo no banco,
  // mas a tela continuava mostrando a auditoria "congelada" do primeiro
  // carregamento, parecendo que só existia 1 registro pra sempre.
  useEffect(() => {
    let ativo = true
    listarAuditoriaRecusas().then(rows => {
      if (!ativo) return
      setAuditoria(rows)
      setCarregandoAuditoria(false)
    })
    return () => { ativo = false }
  }, [rec])

  const auditoriaPorSlot = useMemo(() => agruparAuditoriaPorSlot(auditoria), [auditoria])

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return q ? rec.filter(r => r.paciente.toLowerCase().includes(q)) : rec
  }, [rec, filtro])

  // Agrupado por PACIENTE (não mais por dia da semana) — cada card lista os
  // horários bloqueados daquele paciente. Índice original preservado em cada
  // item pra "reativar" e "ver detalhes" continuarem apontando pra posição
  // certa em `rec` mesmo depois de agrupar/ordenar.
  const groups = useMemo(() => {
    const withIdx = filtrados.map(r => ({ r, i: rec.indexOf(r) }))
    const map = new Map<string, { r: RecItem; i: number }[]>()
    for (const item of withIdx) {
      const arr = map.get(item.r.paciente) ?? []
      arr.push(item)
      map.set(item.r.paciente, arr)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([paciente, items]) => [paciente, items.slice().sort((a, b) =>
        a.r.dia.localeCompare(b.r.dia, "pt-BR") || a.r.hora.localeCompare(b.r.hora))] as const)
  }, [filtrados, rec])

  // Um slot "reativado" é aquele cuja última linha de auditoria é "reativar"
  // — não existe mais em `rec` (por isso não aparece na aba Recusados), mas
  // precisa continuar revisável. Reconstituído inteiramente a partir da
  // auditoria (não depende de nenhum estado local/pacBundles).
  const reativados = useMemo((): ReativadoItem[] => {
    const out: ReativadoItem[] = []
    for (const [slotChave, historico] of auditoriaPorSlot) {
      const ultima = historico[historico.length - 1]
      if (ultima?.acao !== "reativar") continue
      out.push({
        slotChave,
        paciente: ultima.paciente,
        profissional: ultima.profissional ?? "",
        especialidade: ultima.especialidade ?? "",
        unidade: ultima.unidade ?? "",
        dia: ultima.dia ?? "",
        hora: ultima.hora ?? "",
        historico,
      })
    }
    return out
  }, [auditoriaPorSlot])

  const reativadosFiltrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return q ? reativados.filter(x => x.paciente.toLowerCase().includes(q)) : reativados
  }, [reativados, filtro])

  const gruposReativados = useMemo(() => {
    const map = new Map<string, ReativadoItem[]>()
    for (const item of reativadosFiltrados) {
      const arr = map.get(item.paciente) ?? []
      arr.push(item)
      map.set(item.paciente, arr)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([paciente, items]) => [paciente, items.slice().sort((a, b) =>
        a.dia.localeCompare(b.dia, "pt-BR") || a.hora.localeCompare(b.hora))] as const)
  }, [reativadosFiltrados])

  return (
    <>
    <style>{`
      .orec-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 24px;
        padding: 18px;
      }
      @media (max-width: 1024px) {
        .orec-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 640px) {
        .orec-grid { grid-template-columns: 1fr; gap: 16px; padding: 14px; }
      }
      .orec-subcard {
        transition: box-shadow 140ms ease, border-color 140ms ease;
      }
      .orec-subcard:hover {
        border-color: ${B.blue}55 !important;
        box-shadow: 0 2px 10px rgba(15, 23, 42, .07) !important;
      }
      .orec-chevron {
        transition: transform 160ms ease;
      }
    `}</style>
    <ListCard
      icon={modo === "recusados" ? XCircle : RotateCcw}
      title="Por Paciente"
      count={modo === "recusados" ? rec.length : reativados.length}
      titleColor={modo === "recusados" ? "#dc2626" : B.blue}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {onExportCSV && (
            <button onClick={onExportCSV} style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: "6px",
              fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", padding: "6px 12px",
              borderRadius: "var(--radius-md)", background: "var(--card)", color: "var(--muted-foreground)",
              border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit",
            }}>
              <Download size={12} /> Exportar CSV
            </button>
          )}
          <SearchInput value={filtro} onChange={setFiltro} />
        </div>
      }
    >
      {/* Recusados = ainda bloqueiam um horário. Reativados = já não bloqueiam
          mais nada, mas continuam revisáveis (ver comentário acima em `modo`). */}
      <div style={{ display: "flex", gap: "6px", padding: "14px 18px 0" }}>
        <button
          onClick={() => setModo("recusados")}
          className={modo === "recusados" ? "bg-red-100 text-red-700" : ""}
          style={{
            display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px",
            borderRadius: "999px", border: `1px solid ${modo === "recusados" ? "#dc2626" : "var(--border)"}`,
            background: modo === "recusados" ? undefined : "var(--card)",
            color: modo === "recusados" ? undefined : "var(--muted-foreground)",
            fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", cursor: "pointer", fontFamily: "inherit",
          }}>
          <XCircle size={12} /> Recusados ({rec.length})
        </button>
        <button onClick={() => setModo("reativados")} style={{
          display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px",
          borderRadius: "999px", border: `1px solid ${modo === "reativados" ? B.blue : "var(--border)"}`,
          background: modo === "reativados" ? "var(--cron-active-bg)" : "var(--card)",
          color: modo === "reativados" ? B.blue : "var(--muted-foreground)",
          fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", cursor: "pointer", fontFamily: "inherit",
        }}>
          <RotateCcw size={12} /> Reativados ({carregandoAuditoria ? "…" : reativados.length})
        </button>
      </div>

      {modo === "recusados" ? (
      !rec.length ? (
        <EmptyState icon={Inbox} text="Nenhuma recusa registrada" />
      ) : !filtrados.length ? (
        <EmptyState icon={Search} text={`Nenhum resultado para "${filtro}"`} />
      ) : (
        <div className="orec-grid">
          {groups.map(([paciente, items]) => (
            <div key={paciente} style={{
              background: "var(--card)", borderRadius: "20px", border: "1px solid var(--border)",
              overflow: "hidden", display: "flex", flexDirection: "column",
            }}>
              {/* Cabeçalho do card — só o topo leva o azul suave, separando a
                  identificação do paciente dos itens recusados abaixo. */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                padding: "16px 18px", background: "var(--cron-active-bg)",
              }}>
                <span style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--foreground)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {paciente}
                </span>
                <span className="bg-red-100 text-red-700" style={{
                  flexShrink: 0, fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)",
                  borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap",
                }}>
                  {items.length} {items.length === 1 ? "Recusa" : "Recusas"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px" }}>
                {(() => {
                  const expandido = pacientesExpandidos.has(paciente)
                  const visiveis = expandido ? items : items.slice(0, RECUSAS_VISIVEIS_PADRAO)
                  const ocultas = items.length - visiveis.length
                  return (
                    <>
                    {visiveis.map(({ r, i }) => {
                  const slotChave = buildSlotChave(r.paciente, r.profissional, r.dia, r.hora)
                  const historico = auditoriaPorSlot.get(slotChave) ?? []
                  const ultima = historico[historico.length - 1]
                  const chaveDetalhe = `recusado|||${i}`
                  const aberto = detalheAberto === chaveDetalhe
                  const OrigemIcon = ultima ? ORIGEM_META[ultima.origem].icon : Compass
                  const { data: dataRecusa, hora: horaRecusa } = splitDataHora(ultima?.criado_em_brasilia, r.registradoEm)

                  return (
                    <div key={i} className="orec-subcard" style={{
                      background: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, .04)", overflow: "hidden",
                    }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={aberto}
                        onClick={() => setDetalheAberto(aberto ? null : chaveDetalhe)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalheAberto(aberto ? null : chaveDetalhe) } }}
                        style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", cursor: "pointer" }}
                      >
                        <OrigemIcon size={15} style={{ color: B.blue, flexShrink: 0, marginTop: "2px" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--foreground)" }}>
                            {r.dia} · {r.hora} · {r.especialidade || "—"}
                          </div>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", marginTop: "3px" }}>
                            Recusado em {dataRecusa}
                          </div>
                        </div>
                        <ChevronDown size={15} className="orec-chevron" style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: "2px", transform: aberto ? "rotate(180deg)" : "none" }} />
                      </div>

                      <div style={{ padding: "0 14px 12px" }}>
                        <button
                          onClick={e => { e.stopPropagation(); setRemovIdx(i) }}
                          style={{
                            display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap",
                            fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)",
                            color: B.blue, background: "var(--cron-active-bg)", border: `1px solid ${B.blue}44`,
                            borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <RotateCcw size={11} /> Reativar sugestão
                        </button>
                      </div>

                      {aberto && (
                        <div style={{ borderTop: "1px solid var(--border)", background: "var(--muted)", padding: "14px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "12px 14px" }}>
                            <MiniCampo icon={Compass} rotulo="Origem" valor={ultima ? ORIGEM_META[ultima.origem].label : "Registros a partir de 25/08/2026"} />
                            <MiniCampo icon={User} rotulo="Profissional" valor={fmtName(r.profissional) || "—"} />
                            <MiniCampo icon={ClipboardList} rotulo="Especialidade" valor={r.especialidade || "—"} />
                            <MiniCampo icon={MapPin} rotulo="Unidade" valor={r.unidade || "—"} />
                            <MiniCampo icon={UserRound} rotulo="Autor da recusa" valor={carregandoAuditoria ? "Carregando..." : ultima?.usuario_nome ?? "Registros a partir de 25/08/2026"} />
                            <MiniCampo icon={Calendar} rotulo="Data da recusa" valor={dataRecusa} />
                            <MiniCampo icon={Clock} rotulo="Hora da recusa" valor={horaRecusa} />
                          </div>

                          {r.obs && (
                            <div style={{
                              display: "flex", alignItems: "flex-start", gap: "8px", marginTop: "12px",
                              background: "var(--cron-active-bg)", borderRadius: "10px", padding: "10px 12px",
                            }}>
                              <FileText size={13} style={{ color: B.blue, flexShrink: 0, marginTop: "1px" }} />
                              <div style={{ fontSize: "var(--text-xs)", color: "var(--foreground)", whiteSpace: "pre-wrap" }}>
                                <strong>Nota:</strong> {r.obs}
                              </div>
                            </div>
                          )}

                          {!carregandoAuditoria && historico.length > 1 && (
                            <HistoricoList
                              slotChave={slotChave} historico={historico}
                              expandidos={historicosExpandidos} onToggle={toggleHistorico}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                    })}
                    {(ocultas > 0 || expandido) && items.length > RECUSAS_VISIVEIS_PADRAO && (
                      <button
                        onClick={() => setPacientesExpandidos(prev => {
                          const next = new Set(prev)
                          if (expandido) next.delete(paciente)
                          else next.add(paciente)
                          return next
                        })}
                        style={{
                          alignSelf: "center", display: "flex", alignItems: "center", gap: "5px",
                          fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", color: B.blue,
                          background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 6px",
                        }}
                      >
                        <ChevronDown size={13} style={{ transform: expandido ? "rotate(180deg)" : "none" }} />
                        {expandido ? "Ver menos" : `Ver todas as ${items.length} recusas`}
                      </button>
                    )}
                    </>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>
      )
      ) : (
        carregandoAuditoria ? (
          <EmptyState icon={RotateCcw} text="Carregando..." />
        ) : !reativados.length ? (
          <EmptyState icon={RotateCcw} text="Nenhuma recusa reativada ainda" />
        ) : !reativadosFiltrados.length ? (
          <EmptyState icon={Search} text={`Nenhum resultado para "${filtro}"`} />
        ) : (
          <div className="orec-grid">
            {gruposReativados.map(([paciente, items]) => (
              <div key={paciente} style={{
                background: "var(--card)", borderRadius: "20px", border: "1px solid var(--border)",
                overflow: "hidden", display: "flex", flexDirection: "column",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                  padding: "16px 18px", background: "var(--cron-active-bg)",
                }}>
                  <span style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", color: "var(--foreground)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {paciente}
                  </span>
                  <span className="bg-emerald-100 text-emerald-700" style={{
                    flexShrink: 0, fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)",
                    borderRadius: "999px", padding: "4px 12px", whiteSpace: "nowrap",
                  }}>
                    {items.length} {items.length === 1 ? "Reativada" : "Reativadas"}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px" }}>
                  {items.map(item => {
                    const chaveDetalhe = `reativado|||${item.slotChave}`
                    const aberto = detalheAberto === chaveDetalhe
                    const ultimaRecusa = [...item.historico].reverse().find(h => h.acao === "recusar")
                    const ultimaReativacao = item.historico[item.historico.length - 1]
                    const OrigemIcon = ultimaRecusa ? ORIGEM_META[ultimaRecusa.origem].icon : Compass
                    const { data: dataReativacao, hora: horaReativacao } = splitDataHora(ultimaReativacao?.criado_em_brasilia, "—")

                    return (
                      <div key={item.slotChave} className="orec-subcard" style={{
                        background: "var(--card)", borderRadius: "12px", border: "1px solid var(--border)",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, .04)", overflow: "hidden",
                      }}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={aberto}
                          onClick={() => setDetalheAberto(aberto ? null : chaveDetalhe)}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalheAberto(aberto ? null : chaveDetalhe) } }}
                          style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px 14px", cursor: "pointer" }}
                        >
                          <OrigemIcon size={15} style={{ color: B.blue, flexShrink: 0, marginTop: "2px" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--foreground)" }}>
                              {item.dia} · {item.hora} · {item.especialidade || "—"}
                            </div>
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--muted-foreground)", marginTop: "3px" }}>
                              Reativado em {dataReativacao}
                            </div>
                          </div>
                          <ChevronDown size={15} className="orec-chevron" style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: "2px", transform: aberto ? "rotate(180deg)" : "none" }} />
                        </div>

                        {aberto && (
                          <div style={{ borderTop: "1px solid var(--border)", background: "var(--muted)", padding: "14px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "12px 14px" }}>
                              <MiniCampo icon={Compass} rotulo="Origem" valor={ultimaRecusa ? ORIGEM_META[ultimaRecusa.origem].label : "—"} />
                              <MiniCampo icon={User} rotulo="Profissional" valor={fmtName(item.profissional) || "—"} />
                              <MiniCampo icon={MapPin} rotulo="Unidade" valor={item.unidade || "—"} />
                              <MiniCampo icon={UserRound} rotulo="Autor da recusa" valor={ultimaRecusa?.usuario_nome ?? "—"} />
                              <MiniCampo icon={UserRound} rotulo="Autor da reativação" valor={ultimaReativacao?.usuario_nome ?? "—"} />
                              <MiniCampo icon={Calendar} rotulo="Data da reativação" valor={dataReativacao} />
                              <MiniCampo icon={Clock} rotulo="Hora da reativação" valor={horaReativacao} />
                            </div>

                            <HistoricoList
                              slotChave={item.slotChave} historico={item.historico}
                              expandidos={historicosExpandidos} onToggle={toggleHistorico}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </ListCard>
    {removIdx !== null && (
      <ConfirmDialog
        title="Reativar esta sugestão?"
        description="Ela sai da lista de recusados e volta a ser oferecida normalmente para este paciente."
        confirmLabel="Reativar"
        confirmColor={B.blue}
        onConfirm={() => { onRemove(removIdx); setRemovIdx(null) }}
        onCancel={() => setRemovIdx(null)}
      />
    )}
    </>
  )
}

const HISTORICO_VISIVEL_PADRAO = 2

// Mostra só os HISTORICO_VISIVEL_PADRAO registros mais recentes por padrão —
// um slot recusado/reativado várias vezes gerava uma lista sem fim dentro do
// card. "Ver histórico completo" expande por slot (chave = slotChave), sem
// afetar os outros cards.
function HistoricoList({ slotChave, historico, expandidos, onToggle }: {
  slotChave: string
  historico: CronogramaRecusaAuditoria[]
  expandidos: Set<string>
  onToggle: (chave: string) => void
}) {
  const expandido = expandidos.has(slotChave)
  const visiveis = expandido ? historico : historico.slice(-HISTORICO_VISIVEL_PADRAO)
  const ocultos = historico.length - visiveis.length

  return (
    <div style={{ marginTop: "12px" }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted-foreground)", marginBottom: "4px" }}>
        Histórico
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {ocultos > 0 && (
          <button onClick={() => onToggle(slotChave)} style={{
            display: "flex", alignItems: "center", gap: "4px", alignSelf: "flex-start",
            fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", color: B.blue,
            background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 0",
          }}>
            <ChevronDown size={11} /> Ver histórico completo ({historico.length})
          </button>
        )}
        {visiveis.map(h => (
          <div key={h.id} style={{ fontSize: "var(--text-xs)", color: "var(--foreground)" }}>
            <strong style={{ color: h.acao === "recusar" ? "#dc2626" : B.blue }}>
              {h.acao === "recusar" ? "Recusado" : "Reativado"}
            </strong> por {h.usuario_nome ?? "—"} em {h.criado_em_brasilia ?? "—"}
          </div>
        ))}
        {expandido && historico.length > HISTORICO_VISIVEL_PADRAO && (
          <button onClick={() => onToggle(slotChave)} style={{
            display: "flex", alignItems: "center", gap: "4px", alignSelf: "flex-start",
            fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)", color: B.blue,
            background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 0",
          }}>
            <ChevronDown size={11} style={{ transform: "rotate(180deg)" }} /> Ver menos
          </button>
        )}
      </div>
    </div>
  )
}

// Rótulo em maiúsculas + ícone, valor logo abaixo — usado só no mini-grid
// expandido de cada sub-card (escaneabilidade: rótulo cinza pequeno, valor
// escuro reforçado pelo ícone ao lado do rótulo).
function MiniCampo({ icon: Icon, rotulo, valor }: { icon: LucideIcon; rotulo: string; valor: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted-foreground)" }}>
        <Icon size={10} style={{ flexShrink: 0 }} />
        {rotulo}
      </div>
      <div style={{ marginTop: "2px", fontSize: "var(--text-xs)", color: "var(--foreground)", wordBreak: "break-word" }}>
        {valor}
      </div>
    </div>
  )
}
