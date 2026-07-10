"use client"

// Migrado de calculadora-remuneracao/src/views/RemuneracaoRP/CardRemun.jsx
// Port TypeScript — Passo 7 do plano eager-stream.
// • Reutiliza InteractivePieChart (já existe no Pulsar — hover linha↔donut via highlightGroup)
// • Paleta B de lib/cronograma/constants (gray/amber/amberLt adicionados de forma aditiva)
// • Dark mode: superfícies grandes → classes Tailwind semânticas; chips/accents pequenos → inline com B.*
// • Sem fonte M PLUS (herda --font-sans do Pulsar)
// • Ícones Lucide em lugar de emojis de ação
// • <button type="button"> reais para foco de teclado
// • tabular-nums em todos os valores monetários

import { useMemo, useCallback, memo, useState } from "react"
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Users, Lock } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { fmt, isSim } from "@/lib/remuneracao/formatacao"
import { formatDateBR } from "@/lib/remuneracao/datas"
import { useTheme } from "@/contexts/ThemeContext"
import { InteractivePieChart } from "@/components/cronograma/indicadores/InteractivePieChart"
import type { ProfRemunReal, SessaoComPapel } from "@/lib/remuneracao/calculo"

// ─── Tons semânticos (chip/pill) — substitui pares "bg clara + texto escuro"
// inline (invisíveis em fundo escuro) por classes Tailwind com par dark: ────

export type Tone = "green" | "amber" | "red" | "purple" | "blue" | "gray"

const TONE_CHIP: Record<Tone, { bg: string; text: string; border: string }> = {
  green:  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  amber:  { bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-200 dark:border-amber-800" },
  red:    { bg: "bg-rose-100 dark:bg-rose-900/40",       text: "text-rose-700 dark:text-rose-300",       border: "border-rose-200 dark:border-rose-800" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/40",   text: "text-purple-700 dark:text-purple-300",   border: "border-purple-200 dark:border-purple-800" },
  blue:   { bg: "bg-sky-100 dark:bg-sky-900/40",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-200 dark:border-sky-800" },
  gray:   { bg: "bg-slate-100 dark:bg-slate-800/60",     text: "text-slate-600 dark:text-slate-400",     border: "border-slate-200 dark:border-slate-700" },
}

function StatusChip({ tone, children, className = "", dense = false }: { tone: Tone; children: React.ReactNode; className?: string; dense?: boolean }) {
  const c = TONE_CHIP[tone]
  const sizing = dense ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${sizing} ${c.bg} ${c.text} ${className}`}>
      {children}
    </span>
  )
}

// Cores literais (não são classe) para props que exigem string de cor (SVG
// fill/stroke, DonutCard) — variam por tema porque B.amber/B.purple (feitos
// para fundo claro) ficam com contraste baixo (~3:1) sobre bg-card escuro.
const TONE_HEX: Record<Tone, { light: string; dark: string }> = {
  green:  { light: "#15803d", dark: "#34d399" },
  amber:  { light: "#b45309", dark: "#fbbf24" },
  red:    { light: "#dc2626", dark: "#fb7185" },
  purple: { light: "#7c3aed", dark: "#c4b5fd" },
  blue:   { light: "#2563eb", dark: "#60a5fa" },
  gray:   { light: "#6b7280", dark: "#9ca3af" },
}

function useToneColor() {
  const { theme } = useTheme()
  return useCallback((tone: Tone) => TONE_HEX[tone][theme], [theme])
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ExpandidoState = Record<string, boolean | null>

interface PeLinhaItem {
  paciente: string
  situacao?: string
  valor?: number | null
  dias?: number
  diasMes?: number
  diasEfetivos?: number
  inicio?: Date | string | null
  fim?: Date | string | null
  fimUsado?: Date | string | null
  observacao?: string
}

interface CardRemunProps {
  p: ProfRemunReal
  expandido: ExpandidoState
  setExpandido: React.Dispatch<React.SetStateAction<ExpandidoState>>
  remBusca?: string
  forceOpen?: boolean
  ccPA: number
  ccPE: number
  etaBonus: number
  taxasPA: Record<string, number>
  dadosPorProf: Array<{ prof: string; limiteCC?: number; alertaCC?: boolean }>
}

const DEFAULT_CC_LIM = 8

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normKey = (v: unknown): string =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

function fmtDataPE(d: Date | string | null | undefined): string {
  if (!d) return ""
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ""
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`
}

// ─── Badge de classificação de sessão ─────────────────────────────────────────

const CLASS_TONE: Record<string, Tone> = {
  "Evolução normal":        "green",
  "Substituição":           "blue",
  "Pendente retroativa":    "amber",
  "Evolução sem presença":  "red",
  "Cancelado evoluído":     "red",
  "Evolução sem agendamento": "red",
  "Cancelado":              "gray",
  "Não evoluído":           "amber",
}

function ClassBadge({ cls }: { cls: string }) {
  return <StatusChip tone={CLASS_TONE[cls] ?? "gray"}>{cls}</StatusChip>
}

// ─── Tooltip informativo inline ───────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      tabIndex={0}
      className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-muted-foreground text-[9px] cursor-help align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  )
}

// ─── Tabela de sessões ────────────────────────────────────────────────────────

interface SessoesProps {
  sessoes: SessaoComPapel[]
  mostrarPapel?: boolean
  tone?: Tone
  getPARow: (s: SessaoComPapel) => number
}

const SessoesTabela = memo(function SessoesTabela({
  sessoes, mostrarPapel = false, tone = "green", getPARow,
}: SessoesProps) {
  const valorCls = TONE_CHIP[tone].text
  return (
    <div className="overflow-x-auto mt-1">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr className="text-muted-foreground">
            <th className="text-left p-1.5 whitespace-nowrap">ID Agendamento</th>
            <th className="text-left p-1.5 whitespace-nowrap">Data</th>
            <th className="text-left p-1.5">Hora</th>
            <th className="text-left p-1.5">Paciente</th>
            <th className="text-left p-1.5">Especialidade</th>
            {mostrarPapel && <th className="text-left p-1.5">Papel</th>}
            <th className="text-left p-1.5 whitespace-nowrap">Prof. Agenda</th>
            <th className="text-left p-1.5 whitespace-nowrap">Evoluído por</th>
            <th className="text-center p-1.5">Presença Recep.</th>
            <th className="text-center p-1.5">Presença TiTa</th>
            <th className="text-center p-1.5">Tratativa</th>
            <th className={`text-right p-1.5 whitespace-nowrap font-semibold tabular-nums ${valorCls}`}>Valor PA</th>
            <th className="text-left p-1.5">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map((s: SessaoComPapel, i: number) => {
            const paVal = getPARow(s)
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
                  <StatusChip tone={isSim(s.presencaOrbita) ? "green" : "red"} dense>
                    {s.presencaOrbita || "—"}
                  </StatusChip>
                </td>
                <td className="p-1.5 text-center">
                  <StatusChip tone={isSim(s.presencaTita) ? "green" : "red"} dense>
                    {s.presencaTita || "—"}
                  </StatusChip>
                </td>
                <td className="p-1.5 text-center">
                  <StatusChip tone={isSim(s.possuiTratativa) ? "green" : "amber"} dense>
                    {s.possuiTratativa || "—"}
                  </StatusChip>
                </td>
                <td className={`p-1.5 text-right font-bold whitespace-nowrap tabular-nums ${valorCls}`}>
                  {s.valorPATexto || (paVal > 0 ? fmt(paVal) : "—")}
                  {s.explicacaoPA && <InfoTooltip text={s.explicacaoPA} />}
                </td>
                <td className="p-1.5 text-muted-foreground text-[11px]">{s.motivo}</td>
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

// ─── Linha de detalhe PE ──────────────────────────────────────────────────────

function PeLinha({ x }: { x: PeLinhaItem }) {
  const toneColor = useToneColor()
  const inicio  = fmtDataPE(x.inicio)
  const fim     = fmtDataPE(x.fim)
  const fimUsado = fmtDataPE(x.fimUsado)
  const periodo  = inicio && fim ? `${inicio} a ${fim}` : ""
  const fimCalc  = fimUsado && fimUsado !== fim ? ` · cálculo até ${fimUsado}` : ""
  return (
    <div className="grid grid-cols-12 gap-2 px-2 py-1.5 border-t border-border text-[11px] items-start">
      <div className="col-span-12 md:col-span-5 font-semibold min-w-0 text-foreground">{x.paciente}</div>
      <div className="col-span-4 md:col-span-2 text-muted-foreground">{x.diasEfetivos ?? x.dias}/{x.diasMes} dias</div>
      <div className="col-span-4 md:col-span-2 font-bold tabular-nums"
           style={{ color: x.valor == null ? toneColor("amber") : toneColor("purple") }}>
        {x.valor == null ? "Em aberto" : fmt(x.valor)}
      </div>
      <div className="col-span-4 md:col-span-3 text-muted-foreground">{x.situacao}</div>
      {periodo && <div className="col-span-12 text-muted-foreground">Atendimentos: {periodo}{fimCalc}</div>}
      {x.observacao && <div className="col-span-12 text-muted-foreground">{x.observacao}</div>}
    </div>
  )
}

// ─── Header colapsável genérico — reutilizado pelo bloco de PE e pelos
// blocos de sessões (mesmo padrão: ícone/título + contagem, valor extra,
// chevron) ──────────────────────────────────────────────────────────────────

interface BlocoHeaderProps {
  tone: Tone
  titulo: React.ReactNode
  extra?: React.ReactNode
  open: boolean
  onToggle: () => void
}

function BlocoHeader({ tone, titulo, extra, open, onToggle }: BlocoHeaderProps) {
  const c = TONE_CHIP[tone]
  return (
    <button type="button" onClick={onToggle}
            className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-opacity hover:opacity-90 ${c.bg}`}>
      <span className={`text-xs font-bold flex-1 flex items-center gap-1 min-w-0 ${c.text}`}>
        {titulo}
      </span>
      {extra != null && (
        <span className={`text-xs font-black tabular-nums flex-shrink-0 ${c.text}`}>{extra}</span>
      )}
      {open ? <ChevronDown size={12} className={c.text} /> : <ChevronRight size={12} className={c.text} />}
    </button>
  )
}

// ─── Bloco colapsável PE ──────────────────────────────────────────────────────

interface PeBlocoProps {
  titulo: string
  lista: PeLinhaItem[]
  tone: Tone
  total: number | null | undefined
  open: boolean
  onToggle: () => void
}

function PeBloco({ titulo, lista, tone, total, open, onToggle }: PeBlocoProps) {
  return (
    <div>
      <BlocoHeader
        tone={tone}
        titulo={`${titulo} · ${lista.length} paciente(s)`}
        extra={total != null ? fmt(total) : undefined}
        open={open}
        onToggle={onToggle}
      />
      {open && (
        <div className="rounded-b-lg bg-card border-x border-b border-border overflow-hidden">
          {lista.length
            ? lista.map((x, i) => <PeLinha key={`${x.paciente}-${i}`} x={x} />)
            : <div className="text-xs text-muted-foreground p-2">Nenhum paciente nesta situação.</div>
          }
        </div>
      )}
    </div>
  )
}

// ─── KPI Stat Card — design premium (ícone circular, gradiente, sem borda lateral) ──

type KpiCardVariant = "green" | "amber" | "red" | "purple"

const KPI_CARD_BG: Record<KpiCardVariant, { card: string; icon: string }> = {
  green:  { card: "bg-emerald-50 dark:bg-emerald-950/30", icon: "bg-emerald-100 dark:bg-emerald-900/40" },
  amber:  { card: "bg-amber-50 dark:bg-amber-950/30",     icon: "bg-amber-100 dark:bg-amber-900/40" },
  red:    { card: "bg-rose-50 dark:bg-rose-950/30",       icon: "bg-rose-100 dark:bg-rose-900/40" },
  purple: { card: "bg-violet-50 dark:bg-violet-950/30",   icon: "bg-violet-100 dark:bg-violet-900/40" },
}

interface KpiStatCardProps {
  group: string
  cor: string
  variant: KpiCardVariant
  iconColor: string
  icon: React.ReactNode
  titulo: string
  tooltip?: string
  valor: string
  onHover: (g: string | null) => void
  children?: React.ReactNode
}

function KpiStatCard({
  group, cor, variant, iconColor, icon,
  titulo, tooltip, valor, onHover, children,
}: KpiStatCardProps) {
  const bg = KPI_CARD_BG[variant]
  return (
    <div
      className={`rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-default ${bg.card}`}
      onMouseEnter={() => onHover(group)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(group)}
      onBlur={() => onHover(null)}
    >
      {/* Faixa de topo gradiente */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${cor}cc, ${cor}44)` }} />

      <div className="p-4">
        {/* Linha de título com ícone */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${bg.icon}`}
               style={{ color: iconColor }}>
            {icon}
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-sm font-semibold truncate" style={{ color: iconColor }}>{titulo}</span>
            {tooltip && <InfoTooltip text={tooltip} />}
          </div>
        </div>

        {/* Valor principal */}
        <div className="text-3xl font-black tabular-nums leading-none mb-3" style={{ color: cor }}>
          {valor}
        </div>

        {/* Detalhes */}
        <div className="text-sm text-foreground/85 space-y-1.5 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── DonutCard — premium: stat proeminente + donut + legenda esquerda ────────

interface DonutCardProps {
  title: string
  statLabel: string       // ex: "290 ag." ou "70.6%"
  statColor: string
  size: number
  centerLabel: string
  centerFontSize: number
  segments: import("@/components/cronograma/indicadores/InteractivePieChart").PieSegment[]
  highlightGroup: string | null
}

function DonutCard({ title, statLabel, statColor, size, centerLabel, centerFontSize, segments, highlightGroup }: DonutCardProps) {
  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      {/* Chip de título */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statColor }} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>

      {/* Número / percentual em destaque */}
      <div className="text-4xl font-black tabular-nums leading-none mb-1" style={{ color: statColor }}>
        {statLabel}
      </div>

      {/* Donut com legenda à esquerda */}
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CardRemun({
  p, expandido, setExpandido, remBusca, forceOpen,
  ccPA, ccPE, etaBonus, taxasPA, dadosPorProf,
}: CardRemunProps) {
  const isCC = useMemo(
    () => p.sessoes.some(s => s.especialidade === "Coordenador de Caso"),
    [p.sessoes]
  )
  const analProf = useMemo(
    () => dadosPorProf.find(d => normKey(d.prof) === normKey(p.prof)),
    [dadosPorProf, p.prof]
  )
  const limiteCC = analProf?.limiteCC ?? DEFAULT_CC_LIM
  void limiteCC // usado em tooltip futuro
  const alertaCC = analProf?.alertaCC ?? false
  void alertaCC

  const toneColor = useToneColor()

  const totalRecebeHoje = p.evoluidasProprias + p.substituicoesRealizadas
  const baseCalc = p.agendadas - p.canceladas
  const pctEv    = baseCalc > 0 ? (totalRecebeHoje / baseCalc * 100) : 0

  const corBorda = p.inconsistencias > 0 ? B.red
    : (p.pendentes + p.naoEvoluidas) > 0   ? B.amber
    : totalRecebeHoje > 0                   ? B.green
    : B.gray

  const avatarTone: Tone = p.inconsistencias > 0 ? "red" : (p.pendentes ?? 0) > 0 ? "amber" : "green"
  const pctEvTone: Tone = pctEv >= 80 ? "green" : pctEv >= 50 ? "amber" : "red"

  const aberto    = forceOpen || expandido[`rem:${p.prof}`] === true
  const blocoAberto = (key: string) => expandido[`rem:${p.prof}:${key}`] === true
  const togBloco    = (key: string) =>
    setExpandido(e => ({ ...e, [`rem:${p.prof}:${key}`]: !blocoAberto(key) }))

  // Estado local de hover → propaga como highlightGroup para ambos os donuts
  const [cardHover, setCardHover] = useState<string | null>(null)

  const peDetalheTela: PeLinhaItem[] = useMemo(() => p.peDetalhe ?? [], [p.peDetalhe])

  const pePacientesTela = p.pacientesCCQtd ?? 0

  const peValorTela = p.pe ?? 0

  const valorConfirmadoTela = p.valorConfirmado

  const peGrupos = useMemo(() => {
    const situacao = (x: PeLinhaItem) => String(x.situacao ?? "")
    const total    = (xs: PeLinhaItem[]) => xs.reduce((s, x) => s + Number(x.valor ?? 0), 0)
    const integral    = peDetalheTela.filter(x => situacao(x) === "PE integral")
    const proporcional = peDetalheTela.filter(x => situacao(x).includes("proporcional"))
    const aberto      = peDetalheTela.filter(x =>
      x.valor == null || situacao(x).includes("Diretoria") || situacao(x).includes("Conflito") || situacao(x).includes("troca")
    )
    const zero = peDetalheTela.filter(x => situacao(x).startsWith("PE zero"))
    return {
      integral, proporcional, aberto, zero,
      totalIntegral: total(integral),
      totalProporcional: total(proporcional),
    }
  }, [peDetalheTela])

  const { sRecebe, sRegNaoRealizado, sNaoRecebe, sInc } = useMemo(() => {
    const byData = (a: SessaoComPapel, b: SessaoComPapel) =>
      (a.data ?? "").localeCompare(b.data ?? "") || (a.hora ?? "").localeCompare(b.hora ?? "")
    const ehInc = (s: SessaoComPapel) =>
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
          (s.classificacao === "Substituição" || s.classificacao === "Cancelado"))
        .sort(byData),
    }
  }, [p.sessoes])

  const q = useMemo(() => normKey(remBusca ?? ""), [remBusca])
  const filtrarSessoes = useCallback(
    (ss: SessaoComPapel[]) => !q ? ss : ss.filter(s =>
      normKey(`${s.paciente} ${s.especialidade} ${s.data} ${s.hora} ${s.profAgenda} ${s.profCsv}`).includes(q)
    ),
    [q]
  )

  const getPARow = useCallback((s: SessaoComPapel): number => {
    if (s.valorPA !== undefined && s.valorPA !== null) return s.valorPA
    if (s.especialidade === "Coordenador de Caso") return ccPA
    const isEtaAdmin = s.especialidade === "Especialista Técnico de Área" &&
      ["Horário Administrativo"].some(n => (s.paciente ?? "").includes(n))
    if (isEtaAdmin) return 0
    return taxasPA[s.especialidade ?? ""] ?? 0
  }, [ccPA, taxasPA])

  // Segmentos dos donuts (idênticos à calculadora)
  const segmentosTotal = [
    { value: p.evoluidasProprias,       color: B.green,  label: "Evol. próprias",        group: "recebe"   },
    { value: p.substituicoesRealizadas, color: B.blue,   label: "Subs. realizadas",      group: "recebe"   },
    { value: (p.pendentes ?? 0) + (p.naoEvoluidas ?? 0), color: B.amber, label: "Registro não realizado", group: "registro" },
    { value: p.substituidoPorOutro,     color: B.red,    label: "Cedidas p/ outro",      group: "nao"      },
    { value: p.canceladas,              color: "#ef4444", label: "Canceladas",           group: "nao"      },
    { value: p.inconsistencias,         color: "#991b1b", label: "Inconsistências",      group: "inc"      },
  ]
  const segmentosCorrigida = segmentosTotal.filter(s => s.label !== "Canceladas")

  return (
    <div className="bg-card rounded-xl shadow-sm overflow-hidden mb-3"
         style={{ borderLeft: `4px solid ${corBorda}` }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="p-4 grid grid-cols-1 xl:grid-cols-[520px_minmax(560px,1fr)] gap-4 items-start cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpandido(e => ({ ...e, [`rem:${p.prof}`]: aberto ? null : true }))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") &&
          setExpandido(prev => ({ ...prev, [`rem:${p.prof}`]: aberto ? null : true }))}
        aria-expanded={aberto}
      >
        {/* Avatar + nome + meta */}
        <div className="flex items-center gap-3">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-col text-center flex-shrink-0 ${TONE_CHIP[avatarTone].bg} ${TONE_CHIP[avatarTone].text}`}>
            <div className="text-xl font-bold leading-none">{p.agendadas}</div>
            <div className="text-[9px] mt-0.5 font-medium opacity-70">ag.</div>
          </div>

          <div>
            <div className="font-bold text-base flex items-center gap-2 text-foreground">
              {aberto
                ? <ChevronDown size={12} className="text-muted-foreground" />
                : <ChevronRight size={12} className="text-muted-foreground" />
              }
              <span>{p.prof}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
              <span>{p.contratoNovo ?? "PS.ABA-PENDENTE"}</span>
              {isCC
                ? <span>· <span style={{ color: B.purple }}>
                    {p.pacientesCCQtd} pac. CC analisado(s)
                  </span></span>
                : <span>· {p.agendadas} sessões agendadas</span>
              }
            </div>
            <div className="text-xs mt-1 font-semibold" style={{ color: toneColor(pctEvTone) }}>
              {pctEv.toFixed(1)}% base corrigida
              <span className="font-normal text-muted-foreground ml-1">
                ({totalRecebeHoje} remun. / {baseCalc} válidas)
              </span>
            </div>
            {p.inconsistencias > 0 && (
              <StatusChip tone="red" className="mt-1 text-xs px-2">
                ⚠ {p.inconsistencias} inconsistência(s)
              </StatusChip>
            )}
          </div>
        </div>

        {/* Donuts ficam no corpo expandido — ver abaixo */}

        {/* Resumo compacto (recolhido) */}
        {!aberto && (
          <div className="flex flex-wrap gap-3 items-center min-w-0 w-full">
            <div className="min-w-[140px] flex-1 basis-[140px]">
              <div className="h-2 rounded-full overflow-hidden border border-border bg-muted">
                <div className="h-full rounded-full transition-all"
                     style={{ width: `${Math.max(0, Math.min(100, pctEv))}%`, background: corBorda }} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground text-right">
                {totalRecebeHoje} remun. / {baseCalc} válidas
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Recebe</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.green }}>{fmt(valorConfirmadoTela)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Pendente</div>
              <div className="text-sm font-black tabular-nums" style={{ color: toneColor("amber") }}>{(p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Não recebe</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.red }}>{(p.substituidoPorOutro ?? 0) + p.canceladas}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-muted-foreground">Inconsistência</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.red }}>{p.inconsistencias}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Corpo expandido ────────────────────────────────────────────── */}
      {aberto && (
        <>
          {/* ── Donuts + KPI cards — layout unificado horizontal ─────────── */}
          <div className="px-4 pb-4 border-t border-border/50 pt-4">
            <div className="flex flex-wrap gap-5 items-start">

              {/* Donuts premium — painel esquerdo mais largo */}
              {p.agendadas > 0 && (
                <div className="flex gap-10 justify-center flex-wrap w-full lg:w-auto lg:shrink-0 rounded-[20px] p-5 shadow-sm bg-gradient-to-br from-muted/70 to-muted/30 border border-border">
                  <div className="w-[200px]">
                    <DonutCard
                      title="Base total"
                      statLabel={`${p.agendadas} ag.`}
                      statColor="var(--foreground)"
                      size={200}
                      centerLabel={`${(p.agendadas > 0 ? pctEv * (p.agendadas - p.canceladas) / p.agendadas : 0).toFixed(1)}%`}
                      centerFontSize={28}
                      segments={segmentosTotal}
                      highlightGroup={cardHover}
                    />
                  </div>
                  <div className="w-px self-stretch bg-border hidden sm:block" />
                  <div className="w-[200px]">
                    <DonutCard
                      title="Base corrigida"
                      statLabel={`${p.agendadas - p.canceladas} ag.`}
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

              {/* 4 KPI cards — grade 2×2, ocupa o restante */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 min-w-[260px]">

            {/* Recebe agora */}
            <KpiStatCard
              group="recebe"
              cor={B.green}
              variant="green"
              iconColor="#16a34a"
              icon={<CheckCircle2 size={16} />}
              titulo="Recebe agora"
              tooltip="PA = Pagamento por Atendimento. Recebe agora soma evoluções próprias e substituições realizadas. Em contrato duplo AC+PS, a substituição usa a função do profissional substituído na agenda."
              valor={fmt(valorConfirmadoTela)}
              onHover={setCardHover}
            >
              {p.evoluidasProprias > 0 && <div>• {p.evoluidasProprias} evolução(ões) própria(s)</div>}
              {p.substituicoesRealizadas > 0 && <div>• {p.substituicoesRealizadas} substituição(ões)</div>}
              {isCC && pePacientesTela > 0 && (
                <div>• PE: {p.peProporcionalAtivo
                  ? `${p.pacientesCCQtd} pac. analisado(s)`
                  : `${p.pacientesCCQtd} pac. × ${fmt(ccPE)}`}
                </div>
              )}
                {isCC && p.peBloqueado && (
                  <div className="font-semibold" style={{ color: B.amber }}>• PE bloqueado: falta relatório 1 ou 2.</div>
                )}
                {isCC && ((p.peEmAberto ?? 0) + (p.peAguardaDiretoria ?? 0)) > 0 && (
                  <div>• PE em aberto: {(p.peEmAberto ?? 0) + (p.peAguardaDiretoria ?? 0)} paciente(s)</div>
                )}
                {(p.diariaPeriodo ?? 0) > 0 && <div>• PPD: {fmt(p.diariaPeriodo ?? 0)}</div>}
                {(p.etaBonusPeriodo ?? 0) > 0 && <div>• Bônus ETA: {p.etaWeeksPeriodo}sem × {fmt(etaBonus)}</div>}
                <div className="font-semibold border-t border-emerald-200 dark:border-emerald-800 pt-1 mt-1 text-emerald-700 dark:text-emerald-400">
                  {totalRecebeHoje} sessão(ões) elegível(is) ao PA
                </div>
            </KpiStatCard>

            {/* Registro não realizado */}
            <KpiStatCard
              group="registro"
              cor={B.amber}
              variant="amber"
              iconColor="#d97706"
              icon={<AlertTriangle size={16} />}
              titulo="Registro não realizado"
              valor={String((p.pendentes ?? 0) + (p.naoEvoluidas ?? 0))}
              onHover={setCardHover}
            >
              <div>• {(p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)} registro(s) não realizado(s)</div>
              <div className={`rounded-xl px-2.5 py-1.5 mt-2 text-xs leading-snug ${TONE_CHIP.amber.bg} ${TONE_CHIP.amber.text}`}>
                Verifique a coluna Presença Recep. linha a linha.
              </div>
              {((p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)) === 0 && (
                <div style={{ color: B.green }} className="font-semibold">Todos os registros realizados ✓</div>
              )}
            </KpiStatCard>

            {/* Não recebe */}
            <KpiStatCard
              group="nao"
              cor={B.red}
              variant="red"
              iconColor="#dc2626"
              icon={<XCircle size={16} />}
              titulo="Não recebe"
              valor={String((p.substituidoPorOutro ?? 0) + p.canceladas)}
              onHover={setCardHover}
            >
              {(p.substituidoPorOutro ?? 0) > 0 && <div>• {p.substituidoPorOutro} cedida(s) p/ outro prof.</div>}
              {p.canceladas > 0 && <div>• {p.canceladas} cancelada(s)</div>}
              {((p.substituidoPorOutro ?? 0) + p.canceladas) === 0 && (
                <div style={{ color: B.green }} className="font-semibold">Nenhuma ✓</div>
              )}
            </KpiStatCard>

            {/* Inconsistências */}
            <KpiStatCard
              group="inc"
              cor={"#7c3aed"}
              variant="purple"
              iconColor="#7c3aed"
              icon={<HelpCircle size={16} />}
              titulo="Inconsistências"
              tooltip="Presença Recep. ≠ Possui Tratativa: a recepção marcou falta mas há tratativa registrada (ou a sessão foi cancelada mas ainda assim evoluída, ou há evolução registrada sem ID Agendamento). Confirme antes de pagar."
              valor={String(p.inconsistencias)}
              onHover={setCardHover}
            >
              {p.inconsistencias > 0
                ? <div className="font-semibold">• {p.inconsistencias} sessão(ões) para investigar</div>
                : <div style={{ color: B.green }} className="font-semibold">Nenhuma ✓</div>}
            </KpiStatCard>

              </div>{/* fim grid 2×2 KPI */}
            </div>{/* fim flex horizontal */}
          </div>{/* fim wrapper px-4 */}

          {/* ── Bloco CC / PE ────────────────────────────────────── */}
          {isCC && (pePacientesTela > 0 || p.peBloqueado) && (
            <div className="px-4 pb-4">
              <div className="rounded-2xl overflow-hidden shadow-sm border border-purple-200 dark:border-purple-800/60">

                {/* Cabeçalho */}
                <div className="px-4 py-2.5 flex items-center gap-2.5"
                     style={{ background: "linear-gradient(90deg, #7c3aed18 0%, #a855f718 100%)" }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: "#7c3aed20" }}>
                    <Users size={13} strokeWidth={2.5} style={{ color: "#7c3aed" }} />
                  </div>
                  <span className="text-xs font-bold tracking-wide" style={{ color: "#6d28d9" }}>
                    Psicólogo Analista (CC) — PA + PE
                  </span>
                  <InfoTooltip text="AC = Analista do Comportamento (Coordenador de Caso). PE = Valor por Entregas Técnicas por paciente único de CC." />
                </div>

                {/* Corpo 3 colunas */}
                <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-purple-100 dark:divide-purple-900/40 bg-white dark:bg-background">

                  {/* Coluna 1 — PA */}
                  <div className="lg:col-span-3 px-4 py-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                      PA por sessões evoluídas
                    </p>
                    {(p.paBreakdown ?? []).map(b => (
                      <div key={b.label} className="text-xs tabular-nums text-foreground/80 leading-snug">
                        <span className="font-semibold">{b.label}:</span>{" "}
                        {b.count} sess. × {fmt(b.rate)}
                        {b.explicacao && <InfoTooltip text={b.explicacao} />}
                        <div className="font-bold" style={{ color: "#7c3aed" }}>{fmt(b.total)}</div>
                      </div>
                    ))}
                    <div className="pt-1 border-t border-purple-100 dark:border-purple-900/40">
                      <span className="text-base font-black tabular-nums" style={{ color: "#7c3aed" }}>
                        {fmt((p.paBreakdown ?? []).reduce((s, b) => s + b.total, 0))}
                      </span>
                    </div>
                  </div>

                  {/* Coluna 2 — PE */}
                  <div className="lg:col-span-6 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                        {p.peProporcionalAtivo ? "PE por regra 2026" : "PE bloqueado"}
                        {p.peInfoTexto && <InfoTooltip text={p.peInfoTexto} />}
                      </p>
                      {p.peDiasMes && (
                        <StatusChip tone="purple">
                          mês-base {p.peDiasMes}d
                        </StatusChip>
                      )}
                    </div>

                    {p.peBloqueado ? (
                      /* ── PE bloqueado: banner elegante ── */
                      <div className={`rounded-xl px-4 py-3 flex items-start gap-3 border ${TONE_CHIP.amber.border} bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-950/30 dark:to-amber-900/20`}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 bg-amber-200 dark:bg-amber-800/60">
                          <Lock size={16} strokeWidth={2.5} className={TONE_CHIP.amber.text} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black text-amber-900 dark:text-amber-200">
                            PE não calculado
                          </div>
                          <div className={`text-xs mt-0.5 leading-snug ${TONE_CHIP.amber.text}`}>
                            Importe os relatórios 1 e 2 para liberar a análise completa.
                          </div>
                        </div>
                      </div>
                    ) : p.peProporcionalAtivo ? (
                      <>
                        <PeBloco titulo="PE integral confirmado"    lista={peGrupos.integral}    tone="green" total={peGrupos.totalIntegral}    open={blocoAberto("pe_integral")}    onToggle={() => togBloco("pe_integral")} />
                        <PeBloco titulo="PE proporcional confirmado" lista={peGrupos.proporcional} tone="blue"  total={peGrupos.totalProporcional} open={blocoAberto("pe_proporcional")} onToggle={() => togBloco("pe_proporcional")} />
                        <PeBloco titulo="PE em aberto / Diretoria" lista={peGrupos.aberto} tone="amber" total={null} open={blocoAberto("pe_aberto")} onToggle={() => togBloco("pe_aberto")} />
                        <PeBloco titulo="PE zero automático"        lista={peGrupos.zero}   tone="red"   total={0}    open={blocoAberto("pe_zero")}   onToggle={() => togBloco("pe_zero")} />
                      </>
                    ) : (
                      <div className="text-xs font-bold tabular-nums" style={{ color: "#7c3aed" }}>
                        {pePacientesTela} pac. × {fmt(ccPE)}
                      </div>
                    )}
                  </div>

                  {/* Coluna 3 — Totais */}
                  <div className="lg:col-span-3 px-4 py-3 space-y-3 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                        Total confirmado
                      </p>
                      <div className="text-xl font-black tabular-nums" style={{ color: B.green }}>
                        {fmt(valorConfirmadoTela)}
                      </div>
                    </div>
                    <div className="border-t border-purple-100 dark:border-purple-900/40 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                        PE confirmado
                      </p>
                      <div className="text-base font-black tabular-nums text-violet-600 dark:text-violet-400">
                        {fmt(peValorTela)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* Toggle sessões */}
          <div className="px-4 pb-2 border-t border-border flex items-center justify-between">
            <button type="button"
                    className="text-xs font-semibold pt-2 transition-opacity hover:opacity-70"
                    style={{ color: B.blue }}
                    onClick={() => setExpandido(e => ({
                      ...e,
                      [`rem:${p.prof}`]: aberto ? null : true
                    }))}>
              {aberto ? "▲ Recolher" : "▼ Ver sessões detalhadas"}
            </button>
            {aberto && <span className="text-xs text-muted-foreground pt-2">{p.sessoes.length} registro(s)</span>}
          </div>

          {/* Listas de sessões agrupadas */}
          {aberto && (
            <div className="px-4 pb-4 space-y-2">
              {([
                { key: "recebe",    list: sRecebe,          tone: "green" as Tone, icon: <CheckCircle2 size={12} />, titulo: "Recebe agora",           mostrarPapel: true,  extra: (ss: SessaoComPapel[]) => fmt(ss.reduce((a, s) => a + getPARow(s), 0)) },
                { key: "registro",  list: sRegNaoRealizado, tone: "amber" as Tone, icon: <AlertTriangle size={12} />, titulo: "Registro não realizado", mostrarPapel: false, extra: undefined },
                { key: "naoRecebe", list: sNaoRecebe,       tone: "red" as Tone,   icon: <XCircle size={12} />,     titulo: "Não recebe",              mostrarPapel: true,  extra: undefined },
                { key: "inc",       list: sInc,             tone: "red" as Tone,   icon: <HelpCircle size={12} />,  titulo: "Analisar Inconsistência", mostrarPapel: true,  extra: undefined, always: true },
              ] as const).map(bloco => {
                const lista = bloco.list as SessaoComPapel[]
                if (!lista.length && !("always" in bloco && bloco.always)) return null
                const filt = filtrarSessoes(lista)
                const open = blocoAberto(bloco.key)
                return (
                  <div key={bloco.key}>
                    <BlocoHeader
                      tone={bloco.tone}
                      titulo={<>{bloco.icon} {bloco.titulo} · {filt.length} sessão(ões)</>}
                      extra={bloco.extra ? bloco.extra(filt) : undefined}
                      open={open}
                      onToggle={() => togBloco(bloco.key)}
                    />
                    {open && bloco.key === "inc" && (
                      <div className="text-xs p-2 rounded mb-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400">
                        Presença Órbita ≠ Possui Tratativa. Confirme antes de pagar.
                      </div>
                    )}
                    {open && <SessoesTabela sessoes={filt} mostrarPapel={bloco.mostrarPapel} tone={bloco.tone} getPARow={getPARow} />}
                  </div>
                )
              })}
              {p.sessoes.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">Nenhuma sessão vinculada a este profissional.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
