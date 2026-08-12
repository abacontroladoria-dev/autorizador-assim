"use client"

// Card por profissional para a Análise de Tratativas — versão "só contagens" do
// CardRemun. Removido TUDO que envolve R$: coluna "Valor PA", KPI de valores,
// bloco monetário de PE, export. Mantém contagens, presença, tratativa,
// inconsistências e os donuts (que já eram baseados em contagem de sessões).

import { useMemo, useCallback, memo, useState } from "react"
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { isSim } from "@/lib/remuneracao/formatacao"
import { formatDateBR } from "@/lib/remuneracao/datas"
import { useToneColor, type Tone } from "@/hooks/useToneColor"
import { InteractivePieChart } from "@/components/cronograma/indicadores/InteractivePieChart"
import type { ProfTratativas, SessaoTratativa } from "@/lib/remuneracao/tratativas"

export type ExpandidoState = Record<string, boolean | null>

const TONE_CHIP: Record<Tone, { bg: string; text: string }> = {
  green:  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  amber:  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300" },
  red:    { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/40",   text: "text-purple-700 dark:text-purple-300" },
  blue:   { bg: "bg-sky-100 dark:bg-sky-900/40",         text: "text-sky-700 dark:text-sky-300" },
  gray:   { bg: "bg-slate-100 dark:bg-slate-800/60",     text: "text-slate-600 dark:text-slate-400" },
}

const normKey = (v: unknown): string =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

function StatusChip({ tone, children, className = "", dense = false }: { tone: Tone; children: React.ReactNode; className?: string; dense?: boolean }) {
  const c = TONE_CHIP[tone]
  const sizing = dense ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${sizing} ${c.bg} ${c.text} ${className}`}>
      {children}
    </span>
  )
}

const CLASS_TONE: Record<string, Tone> = {
  "Evolução normal":          "green",
  "Substituição":             "blue",
  "Pendente retroativa":      "amber",
  "Evolução sem presença":    "red",
  "Cancelado evoluído":       "red",
  "Evolução sem agendamento": "red",
  "Cancelado":                "gray",
  "Não evoluído":             "amber",
  "Feriado/Ponto Fac.":       "gray",
}

function ClassBadge({ cls }: { cls: string }) {
  return <StatusChip tone={CLASS_TONE[cls] ?? "gray"}>{cls}</StatusChip>
}

// ─── Tabela de sessões — SEM coluna de valor ────────────────────────────────

const SessoesTabela = memo(function SessoesTabela({
  sessoes, mostrarPapel = false,
}: { sessoes: SessaoTratativa[]; mostrarPapel?: boolean }) {
  return (
    <div className="overflow-x-auto mt-1">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-muted-foreground">
            <th scope="col" className="text-left p-1.5 whitespace-nowrap">ID Agendamento</th>
            <th scope="col" className="text-left p-1.5 whitespace-nowrap">Data</th>
            <th scope="col" className="text-left p-1.5">Hora</th>
            <th scope="col" className="text-left p-1.5">Paciente</th>
            <th scope="col" className="text-left p-1.5">Especialidade</th>
            {mostrarPapel && <th scope="col" className="text-left p-1.5">Situação</th>}
            <th scope="col" className="text-left p-1.5 whitespace-nowrap">Prof. Agenda</th>
            <th scope="col" className="text-left p-1.5 whitespace-nowrap">Evoluído por</th>
            <th scope="col" className="text-center p-1.5">Presença Recep.</th>
            <th scope="col" className="text-center p-1.5">Presença TiTa</th>
            <th scope="col" className="text-center p-1.5">Tratativa</th>
            <th scope="col" className="text-left p-1.5">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map((s, i) => {
            const isFeriado = s.classificacao === "Feriado/Ponto Fac."
            return (
              <tr key={`${s._idx ?? i}-${i}`} className="border-t border-border hover:bg-muted/40">
                <td className="p-1.5 whitespace-nowrap text-muted-foreground">{s.id || "—"}</td>
                <td className="p-1.5 whitespace-nowrap font-medium text-foreground">{formatDateBR(s.data)}</td>
                <td className="p-1.5 whitespace-nowrap text-foreground">{s.hora}</td>
                <td className="p-1.5 text-foreground">{s.paciente}</td>
                <td className="p-1.5 text-foreground">{s.especialidade}</td>
                {mostrarPapel && <td className="p-1.5"><ClassBadge cls={s.classificacao ?? ""} /></td>}
                <td className="p-1.5 text-muted-foreground">{s.profAgenda}</td>
                <td className="p-1.5 text-muted-foreground">{s.profCsv || "—"}</td>
                <td className="p-1.5 text-center">
                  {isFeriado ? "—" : (
                    <StatusChip tone={isSim(s.presencaOrbita) ? "green" : "red"} dense>
                      {s.presencaOrbita || "—"}
                    </StatusChip>
                  )}
                </td>
                <td className="p-1.5 text-center">
                  {isFeriado ? "—" : (
                    <StatusChip tone={isSim(s.presencaTita) ? "green" : "red"} dense>
                      {s.presencaTita || "—"}
                    </StatusChip>
                  )}
                </td>
                <td className="p-1.5 text-center">
                  <StatusChip tone={isSim(s.possuiTratativa) ? "green" : "amber"} dense>
                    {s.possuiTratativa || "—"}
                  </StatusChip>
                </td>
                <td className="p-1.5 text-muted-foreground text-[11px]">{isFeriado ? "Feriado/Ponto Fac." : s.motivo}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sessoes.length === 0 && (
        <div className="text-xs text-muted-foreground p-3 text-center">Nenhuma sessão nesta categoria.</div>
      )}
    </div>
  )
})

// ─── Header colapsável de bloco ───────────────────────────────────────────────

function BlocoHeader({ tone, titulo, extra, open, onToggle }: {
  tone: Tone; titulo: React.ReactNode; extra?: React.ReactNode; open: boolean; onToggle: () => void
}) {
  const c = TONE_CHIP[tone]
  return (
    <button type="button" onClick={onToggle}
            className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-opacity hover:opacity-90 ${c.bg}`}>
      <span className={`text-xs font-bold flex-1 flex items-center gap-1 min-w-0 ${c.text}`}>{titulo}</span>
      {extra != null && <span className={`text-xs font-black tabular-nums flex-shrink-0 ${c.text}`}>{extra}</span>}
      {open ? <ChevronDown size={12} className={c.text} /> : <ChevronRight size={12} className={c.text} />}
    </button>
  )
}

// ─── KPI de contagem ──────────────────────────────────────────────────────────

type KpiVariant = "green" | "amber" | "red" | "purple"

const KPI_CARD_BG: Record<KpiVariant, { card: string; icon: string }> = {
  green:  { card: "bg-emerald-50 dark:bg-emerald-950/30", icon: "bg-emerald-100 dark:bg-emerald-900/40" },
  amber:  { card: "bg-amber-50 dark:bg-amber-950/30",     icon: "bg-amber-100 dark:bg-amber-900/40" },
  red:    { card: "bg-rose-50 dark:bg-rose-950/30",       icon: "bg-rose-100 dark:bg-rose-900/40" },
  purple: { card: "bg-violet-50 dark:bg-violet-950/30",   icon: "bg-violet-100 dark:bg-violet-900/40" },
}

function KpiStatCard({ group, cor, variant, iconColor, icon, titulo, valor, onHover, children }: {
  group: string; cor: string; variant: KpiVariant; iconColor: string; icon: React.ReactNode
  titulo: string; valor: string; onHover: (g: string | null) => void; children?: React.ReactNode
}) {
  // Sem shadow/borda própria — já vive dentro do card do profissional. O
  // tint de fundo é o que separa os 4 grupos visualmente (nunca card dentro
  // de card); ver reference/layout.md do impeccable.
  const bg = KPI_CARD_BG[variant]
  return (
    <div
      className={`rounded-xl p-4 cursor-default ${bg.card}`}
      onMouseEnter={() => onHover(group)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(group)}
      onBlur={() => onHover(null)}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bg.icon}`} style={{ color: iconColor }}>
          {icon}
        </div>
        <span className="text-sm font-semibold truncate" style={{ color: iconColor }}>{titulo}</span>
      </div>
      <div className="text-3xl font-black tabular-nums leading-none mb-3" style={{ color: cor }}>{valor}</div>
      <div className="text-sm text-foreground/85 space-y-1.5 leading-relaxed">{children}</div>
    </div>
  )
}

function DonutCard({ title, statLabel, statColor, size, centerLabel, centerFontSize, segments, highlightGroup }: {
  title: string; statLabel: string; statColor: string; size: number; centerLabel: string; centerFontSize: number
  segments: import("@/components/cronograma/indicadores/InteractivePieChart").PieSegment[]; highlightGroup: string | null
}) {
  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statColor }} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="text-4xl font-black tabular-nums leading-none mb-1" style={{ color: statColor }}>{statLabel}</div>
      <InteractivePieChart
        size={size}
        centerLabel={centerLabel}
        centerFontSize={centerFontSize}
        legendAlign="left"
        legendFontSize={11}
        highlightGroup={highlightGroup}
        segments={segments}
        valueFormatter={(v) => `${v} sess.`}
      />
    </div>
  )
}

interface CardTratativasProps {
  p: ProfTratativas
  expandido: ExpandidoState
  setExpandido: React.Dispatch<React.SetStateAction<ExpandidoState>>
  remBusca?: string
  forceOpen?: boolean
}

export default function CardTratativas({ p, expandido, setExpandido, remBusca, forceOpen }: CardTratativasProps) {
  const isCC = useMemo(() => p.sessoes.some(s => s.especialidade === "Coordenador de Caso"), [p.sessoes])
  const toneColor = useToneColor()

  const totalRecebeHoje = p.evoluidasProprias + p.substituicoesRealizadas
  const baseCalc = p.agendadas - p.canceladas - (p.substituidoPorOutro ?? 0)
  const pctEv = baseCalc > 0 ? (totalRecebeHoje / baseCalc * 100) : 0

  // Mesmo sinal que antes ia pro borderLeft do card (banido — side-stripe
  // border) e pro avatar (que tinha uma versão incompleta, sem o estado
  // "gray" de nenhuma atividade). Unificado: o avatar tonalizado já é o
  // sinal de status, sem precisar de uma borda redundante ao lado.
  const statusTone: Tone = p.inconsistencias > 0 ? "red"
    : (p.pendentes + p.naoEvoluidas) > 0 ? "amber"
    : totalRecebeHoje > 0 ? "green"
    : "gray"

  const pctEvTone: Tone = pctEv >= 80 ? "green" : pctEv >= 50 ? "amber" : "red"

  const aberto = forceOpen || expandido[`trat:${p.prof}`] === true
  const blocoAberto = (key: string) => expandido[`trat:${p.prof}:${key}`] === true
  const togBloco = (key: string) => setExpandido(e => ({ ...e, [`trat:${p.prof}:${key}`]: !blocoAberto(key) }))

  const [cardHover, setCardHover] = useState<string | null>(null)

  const { sRecebe, sRegNaoRealizado, sNaoRecebe, sInc } = useMemo(() => {
    const byData = (a: SessaoTratativa, b: SessaoTratativa) =>
      (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "").localeCompare(b.hora ?? "")
    const ehInc = (s: SessaoTratativa) =>
      ["Evolução sem presença", "Cancelado evoluído", "Evolução sem agendamento"].includes(s.classificacao ?? "")
    return {
      sInc: p.sessoes.filter(ehInc).sort(byData),
      sRecebe: p.sessoes
        .filter(s => !ehInc(s) && (s.papel === "Substituição realizada" ||
          (s.papel === "Agenda" && s.classificacao === "Evolução normal")))
        .sort(byData),
      sRegNaoRealizado: p.sessoes
        .filter(s => !ehInc(s) && s.papel === "Agenda" &&
          (s.classificacao === "Pendente retroativa" || s.classificacao === "Não evoluído"))
        .sort(byData),
      sNaoRecebe: p.sessoes
        .filter(s => !ehInc(s) && s.papel === "Agenda" &&
          (s.classificacao === "Substituição" || s.classificacao === "Cancelado" || s.classificacao === "Feriado/Ponto Fac."))
        .sort(byData),
    }
  }, [p.sessoes])

  const q = useMemo(() => normKey(remBusca ?? ""), [remBusca])
  const filtrarSessoes = useCallback(
    (ss: SessaoTratativa[]) => !q ? ss : ss.filter(s =>
      normKey(`${s.paciente} ${s.especialidade} ${s.data} ${s.hora} ${s.profAgenda} ${s.profCsv}`).includes(q)
    ),
    [q]
  )

  const segmentosTotal = [
    { value: p.evoluidasProprias,       color: B.green,   label: "Evol. próprias",         group: "recebe"   },
    { value: p.substituicoesRealizadas, color: B.blue,    label: "Subs. realizadas",       group: "recebe"   },
    { value: (p.pendentes ?? 0) + (p.naoEvoluidas ?? 0), color: B.amber, label: "Registro não realizado", group: "registro" },
    { value: p.substituidoPorOutro,     color: B.red,     label: "Cedidas p/ outro",       group: "nao"      },
    { value: p.canceladas,              color: "#ef4444", label: "Canceladas",             group: "nao"      },
    { value: p.inconsistencias,         color: "#991b1b", label: "Inconsistências",        group: "inc"      },
  ]
  const segmentosCorrigida = segmentosTotal.filter(s => s.label !== "Canceladas" && s.label !== "Cedidas p/ outro")

  return (
    <div className="bg-card rounded-xl shadow-sm overflow-hidden mb-3">

      {/* Header */}
      <div
        className="p-4 grid grid-cols-1 xl:grid-cols-[520px_minmax(560px,1fr)] gap-4 items-start cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpandido(e => ({ ...e, [`trat:${p.prof}`]: aberto ? null : true }))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setExpandido(prev => ({ ...prev, [`trat:${p.prof}`]: aberto ? null : true }))}
        aria-expanded={aberto}
      >
        <div className="flex items-center gap-3">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-col text-center flex-shrink-0 ${TONE_CHIP[statusTone].bg} ${TONE_CHIP[statusTone].text}`}>
            <div className="text-xl font-bold leading-none">{p.agendadas}</div>
            <div className="text-[9px] mt-0.5 font-medium opacity-70">ag.</div>
          </div>

          <div>
            <div className="font-bold text-base flex items-center gap-2 text-foreground">
              {aberto ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
              <span>{p.prof}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
              {isCC
                ? <span style={{ color: B.purple }}>{p.pacientesCCQtd} pac. CC analisado(s)</span>
                : <span>{p.agendadas} sessões agendadas</span>}
            </div>
            <div className="text-xs mt-1 font-semibold" style={{ color: toneColor(pctEvTone) }}>
              {pctEv.toFixed(1)}% base corrigida
              <span className="font-normal text-muted-foreground ml-1">
                ({totalRecebeHoje} c/ tratativa / {baseCalc} válidas)
              </span>
            </div>
            {p.inconsistencias > 0 && (
              <StatusChip tone="red" className="mt-1 text-xs px-2">⚠ {p.inconsistencias} inconsistência(s)</StatusChip>
            )}
          </div>
        </div>

        {/* Resumo compacto (recolhido) — só contagens */}
        {!aberto && (
          <div className="flex flex-wrap gap-3 items-center min-w-0 w-full">
            <div className="min-w-[140px] flex-1 basis-[140px]">
              <div className="h-2 rounded-full overflow-hidden border border-border bg-muted">
                <div
                  className="h-full w-full"
                  style={{
                    background: toneColor(statusTone),
                    clipPath: `inset(0 ${100 - Math.max(0, Math.min(100, pctEv))}% 0 0)`,
                    transition: "clip-path 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground text-right">
                {totalRecebeHoje} c/ tratativa / {baseCalc} válidas
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Com tratativa</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.green }}>{totalRecebeHoje}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Pendente</div>
              <div className="text-sm font-black tabular-nums" style={{ color: toneColor("amber") }}>{(p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Não elegível</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.red }}>{(p.substituidoPorOutro ?? 0) + p.canceladas}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Inconsistência</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.red }}>{p.inconsistencias}</div>
            </div>
          </div>
        )}
      </div>

      {/* Corpo expandido */}
      {aberto && (
        <>
          <div className="px-4 pb-4 border-t border-border/50 pt-4">
            <div className="flex flex-wrap gap-5 items-start">
              {p.agendadas > 0 && (
                <div className="flex gap-10 justify-center flex-wrap w-full lg:w-auto lg:shrink-0 rounded-[20px] p-5 shadow-sm bg-gradient-to-br from-muted/70 to-muted/30 border border-border">
                  <div className="w-[200px]">
                    <DonutCard
                      title="Base total"
                      statLabel={`${p.agendadas} ag.`}
                      statColor="var(--foreground)"
                      size={200}
                      centerLabel={`${(p.agendadas > 0 ? pctEv * baseCalc / p.agendadas : 0).toFixed(1)}%`}
                      centerFontSize={28}
                      segments={segmentosTotal}
                      highlightGroup={cardHover}
                    />
                  </div>
                  <div className="w-px self-stretch bg-border hidden sm:block" />
                  <div className="w-[200px]">
                    <DonutCard
                      title="Base corrigida"
                      statLabel={`${baseCalc} ag.`}
                      statColor={toneColor(pctEvTone)}
                      size={200}
                      centerLabel={`${pctEv.toFixed(1)}%`}
                      centerFontSize={28}
                      segments={segmentosCorrigida}
                      highlightGroup={cardHover}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 min-w-[260px]">
                <KpiStatCard
                  group="recebe" cor={B.green} variant="green" iconColor="#16a34a"
                  icon={<CheckCircle2 size={16} />} titulo="Com tratativa"
                  valor={String(totalRecebeHoje)} onHover={setCardHover}
                >
                  {p.evoluidasProprias > 0 && <div>• {p.evoluidasProprias} evolução(ões) própria(s)</div>}
                  {p.substituicoesRealizadas > 0 && <div>• {p.substituicoesRealizadas} substituição(ões)</div>}
                  {isCC && p.pacientesCCQtd > 0 && <div>• {p.pacientesCCQtd} pac. de CC analisado(s)</div>}
                  <div className="font-semibold border-t border-emerald-200 dark:border-emerald-800 pt-1 mt-1 text-emerald-700 dark:text-emerald-400">
                    {totalRecebeHoje} sessão(ões) com tratativa registrada
                  </div>
                </KpiStatCard>

                <KpiStatCard
                  group="registro" cor={B.amber} variant="amber" iconColor="#d97706"
                  icon={<AlertTriangle size={16} />} titulo="Registro não realizado"
                  valor={String((p.pendentes ?? 0) + (p.naoEvoluidas ?? 0))} onHover={setCardHover}
                >
                  <div>• {(p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)} registro(s) não realizado(s)</div>
                  <div className={`rounded-xl px-2.5 py-1.5 mt-2 text-xs leading-snug ${TONE_CHIP.amber.bg} ${TONE_CHIP.amber.text}`}>
                    Verifique a coluna Presença Recep. linha a linha.
                  </div>
                  {((p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)) === 0 && (
                    <div style={{ color: B.green }} className="font-semibold">Todos os registros realizados ✓</div>
                  )}
                </KpiStatCard>

                <KpiStatCard
                  group="nao" cor={B.red} variant="red" iconColor="#dc2626"
                  icon={<XCircle size={16} />} titulo="Não elegível"
                  valor={String((p.substituidoPorOutro ?? 0) + p.canceladas)} onHover={setCardHover}
                >
                  {(p.substituidoPorOutro ?? 0) > 0 && <div>• {p.substituidoPorOutro} cedida(s) p/ outro prof.</div>}
                  {p.canceladas > 0 && <div>• {p.canceladas} cancelada(s)</div>}
                  {((p.substituidoPorOutro ?? 0) + p.canceladas) === 0 && (
                    <div style={{ color: B.green }} className="font-semibold">Nenhuma ✓</div>
                  )}
                </KpiStatCard>

                <KpiStatCard
                  group="inc" cor={"#7c3aed"} variant="purple" iconColor="#7c3aed"
                  icon={<HelpCircle size={16} />} titulo="Inconsistências"
                  valor={String(p.inconsistencias)} onHover={setCardHover}
                >
                  {p.inconsistencias > 0
                    ? <div className="font-semibold">• {p.inconsistencias} sessão(ões) para investigar</div>
                    : <div style={{ color: B.green }} className="font-semibold">Nenhuma ✓</div>}
                </KpiStatCard>
              </div>
            </div>
          </div>

          {/* Toggle sessões */}
          <div className="px-4 pb-2 border-t border-border flex items-center justify-between">
            <button type="button"
                    className="text-xs font-semibold pt-2 transition-opacity hover:opacity-70"
                    style={{ color: B.blue }}
                    onClick={() => setExpandido(e => ({ ...e, [`trat:${p.prof}`]: aberto ? null : true }))}>
              {aberto ? "▲ Recolher" : "▼ Ver sessões detalhadas"}
            </button>
            <span className="text-xs text-muted-foreground pt-2">{p.sessoes.length} registro(s)</span>
          </div>

          {/* Listas de sessões agrupadas — SEM valores */}
          <div className="px-4 pb-4 space-y-2">
            {([
              { key: "recebe",    list: sRecebe,          tone: "green" as Tone, icon: <CheckCircle2 size={12} />,  titulo: "Com tratativa",          mostrarPapel: true },
              { key: "registro",  list: sRegNaoRealizado, tone: "amber" as Tone, icon: <AlertTriangle size={12} />, titulo: "Registro não realizado", mostrarPapel: false },
              { key: "naoRecebe", list: sNaoRecebe,       tone: "red" as Tone,   icon: <XCircle size={12} />,       titulo: "Não elegível",           mostrarPapel: true },
              { key: "inc",       list: sInc,             tone: "red" as Tone,   icon: <HelpCircle size={12} />,    titulo: "Analisar Inconsistência", mostrarPapel: true, always: true },
            ] as const).map(bloco => {
              const lista = bloco.list as SessaoTratativa[]
              if (!lista.length && !("always" in bloco && bloco.always)) return null
              const filt = filtrarSessoes(lista)
              const open = blocoAberto(bloco.key)
              return (
                <div key={bloco.key}>
                  <BlocoHeader
                    tone={bloco.tone}
                    titulo={<>{bloco.icon} {bloco.titulo} · {filt.length} sessão(ões)</>}
                    open={open}
                    onToggle={() => togBloco(bloco.key)}
                  />
                  {open && bloco.key === "inc" && (
                    <div className="text-xs p-2 rounded mb-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400">
                      Presença Recep. ≠ Possui Tratativa. Encaminhe para conferência.
                    </div>
                  )}
                  {open && <SessoesTabela sessoes={filt} mostrarPapel={bloco.mostrarPapel} />}
                </div>
              )
            })}
            {p.sessoes.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">Nenhuma sessão vinculada a este profissional.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
