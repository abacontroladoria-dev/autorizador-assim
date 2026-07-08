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
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, HelpCircle, FileText, Download } from "lucide-react"
import { B } from "@/lib/cronograma/constants"
import { fmt, isSim } from "@/lib/remuneracao/formatacao"
import { formatDateBR } from "@/lib/remuneracao/datas"
import { InteractivePieChart } from "@/components/cronograma/indicadores/InteractivePieChart"
import type { ProfRemunReal, SessaoComPapel } from "@/lib/remuneracao/calculo"

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
  modoRP: boolean
  expandido: ExpandidoState
  setExpandido: React.Dispatch<React.SetStateAction<ExpandidoState>>
  remBusca?: string
  remPeriodo?: { inicio: string; fim: string } | null
  ccPA: number
  ccPE: number
  etaBonus: number
  taxasPA: Record<string, number>
  dadosPorProf: Array<{ prof: string; limiteCC?: number; alertaCC?: boolean }>
  onGerarPDF?: () => void
  onGerarWord?: () => void
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

const BADGE_COLORS: Record<string, [string, string]> = {
  "Evolução normal":        [B.limeLt,  B.green],
  "Substituição":           [B.blueLt,  B.blue],
  "Pendente retroativa":    [B.amberLt, B.amber],
  "Evolução sem presença":  ["#fee2e2",  B.red],
  "Cancelado evoluído":     ["#fee2e2",  B.red],
  "Cancelado":              ["#f3f4f6",  B.gray],
  "Não evoluído":           ["#fef3c7",  "#92400e"],
}

function ClassBadge({ cls }: { cls: string }) {
  const [bg, cor] = BADGE_COLORS[cls] ?? ["#f3f4f6", B.gray]
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: bg, color: cor }}
    >
      {cls}
    </span>
  )
}

// ─── Tooltip informativo inline ───────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-muted-foreground text-[9px] cursor-help align-middle"
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
  valorCor?: string
  getPARow: (s: SessaoComPapel) => number
}

const SessoesTabela = memo(function SessoesTabela({
  sessoes, mostrarPapel = false, valorCor = B.green, getPARow,
}: SessoesProps) {
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
            <th className="text-right p-1.5 whitespace-nowrap font-semibold tabular-nums" style={{ color: valorCor }}>Valor PA</th>
            <th className="text-left p-1.5">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {sessoes.map((s: SessaoComPapel, i: number) => {
            const paVal = getPARow(s)
            const presRecBg  = isSim(s.presencaOrbita) ? "#dcfce7" : "#fee2e2"
            const presRecCor = isSim(s.presencaOrbita) ? "#166534" : "#991b1b"
            const presTitBg  = isSim(s.presencaTita)   ? "#dcfce7" : "#fee2e2"
            const presTitCor = isSim(s.presencaTita)   ? "#166534" : "#991b1b"
            const tratBg  = isSim(s.possuiTratativa) ? "#dcfce7" : "#fef3c7"
            const tratCor = isSim(s.possuiTratativa) ? "#166534" : "#92400e"
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
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: presRecBg, color: presRecCor }}>
                    {s.presencaOrbita || "—"}
                  </span>
                </td>
                <td className="p-1.5 text-center">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: presTitBg, color: presTitCor }}>
                    {s.presencaTita || "—"}
                  </span>
                </td>
                <td className="p-1.5 text-center">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ background: tratBg, color: tratCor }}>
                    {s.possuiTratativa || "—"}
                  </span>
                </td>
                <td className="p-1.5 text-right font-bold whitespace-nowrap tabular-nums" style={{ color: valorCor }}>
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
           style={{ color: x.valor == null ? B.amber : B.purple }}>
        {x.valor == null ? "Em aberto" : fmt(x.valor)}
      </div>
      <div className="col-span-4 md:col-span-3 text-muted-foreground">{x.situacao}</div>
      {periodo && <div className="col-span-12 text-muted-foreground">Atendimentos: {periodo}{fimCalc}</div>}
      {x.observacao && <div className="col-span-12 text-muted-foreground">{x.observacao}</div>}
    </div>
  )
}

// ─── Bloco colapsável PE ──────────────────────────────────────────────────────

interface PeBlocoProps {
  titulo: string
  lista: PeLinhaItem[]
  cor: string
  bg: string
  total: number | null | undefined
  open: boolean
  onToggle: () => void
}

function PeBloco({ titulo, lista, cor, bg, total, open, onToggle }: PeBlocoProps) {
  return (
    <div>
      <button type="button" onClick={onToggle}
              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-opacity hover:opacity-90"
              style={{ background: bg }}>
        <span className="text-xs font-bold flex-1" style={{ color: cor }}>
          {titulo} · {lista.length} paciente(s)
        </span>
        {total != null && (
          <span className="text-xs font-black tabular-nums" style={{ color: cor }}>{fmt(total)}</span>
        )}
        {open ? <ChevronDown size={12} style={{ color: cor }} /> : <ChevronRight size={12} style={{ color: cor }} />}
      </button>
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
  p, modoRP, expandido, setExpandido, remBusca, remPeriodo,
  ccPA, ccPE, etaBonus, taxasPA, dadosPorProf,
  onGerarPDF, onGerarWord,
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

  const totalRecebeHoje = p.evoluidasProprias + p.substituicoesRealizadas
  const baseCalc = p.agendadas - p.canceladas
  const pctEv    = baseCalc > 0 ? (totalRecebeHoje / baseCalc * 100) : 0

  const corBorda = p.inconsistencias > 0 ? B.red
    : (p.pendentes + p.naoEvoluidas) > 0   ? B.amber
    : totalRecebeHoje > 0                   ? B.green
    : B.gray

  const aberto    = modoRP ? expandido[`rem:${p.prof}`] === true : expandido[`rem:${p.prof}`] !== false
  const blocoAberto = (key: string) => expandido[`rem:${p.prof}:${key}`] === true
  const togBloco    = (key: string) =>
    setExpandido(e => ({ ...e, [`rem:${p.prof}:${key}`]: !blocoAberto(key) }))

  // Estado local de hover → propaga como highlightGroup para ambos os donuts
  const [cardHover, setCardHover] = useState<string | null>(null)

  const peDetalheTela: PeLinhaItem[] = useMemo(() => modoRP
    ? (p.peDetalhe ?? [])
    : (p.peProporcionalAtivo
        ? (p.peConfirmadoDetalhe ?? p.peIntegralConfirmadoDetalhe ?? [])
        : (p.peDetalhe ?? [])), [modoRP, p.peDetalhe, p.peProporcionalAtivo, p.peConfirmadoDetalhe, p.peIntegralConfirmadoDetalhe])

  const pePacientesTela = modoRP
    ? (p.pacientesCCQtd ?? 0)
    : (p.peProporcionalAtivo
        ? (p.peConfirmadoQtd ?? (p.peConfirmadoDetalhe ?? []).length)
        : (p.pacientesCCQtd ?? 0))

  const peValorTela = modoRP
    ? (p.pe ?? 0)
    : (p.peProporcionalAtivo
        ? (p.peConfirmadoValor ?? (p.peConfirmadoDetalhe ?? []).reduce((s, x) => s + Number(x.valor ?? 0), 0))
        : (p.pe ?? 0))

  const valorConfirmadoTela = modoRP
    ? p.valorConfirmado
    : (p.valorConfirmado - (p.pe ?? 0) + peValorTela)

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
      ["Evolução sem presença", "Cancelado evoluído"].includes(s.classificacao ?? "")
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
        className={`p-4 ${modoRP
          ? "grid grid-cols-1 xl:grid-cols-[520px_minmax(560px,1fr)] gap-4 items-start cursor-pointer hover:bg-muted/40 transition-colors"
          : "flex items-start gap-3 flex-wrap justify-between"}`}
        onClick={() => modoRP && setExpandido(e => ({ ...e, [`rem:${p.prof}`]: aberto ? null : true }))}
        role={modoRP ? "button" : undefined}
        tabIndex={modoRP ? 0 : undefined}
        onKeyDown={modoRP ? (e) => (e.key === "Enter" || e.key === " ") &&
          setExpandido(prev => ({ ...prev, [`rem:${p.prof}`]: aberto ? null : true })) : undefined}
        aria-expanded={modoRP ? aberto : undefined}
      >
        {/* Avatar + nome + meta */}
        <div className="flex items-center gap-3">
          {modoRP ? (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-col text-center flex-shrink-0"
                 style={{ background: p.inconsistencias > 0 ? "#fee2e2" : (p.pendentes ?? 0) > 0 ? B.amberLt : B.limeLt, color: corBorda }}>
              <div className="text-xl font-bold leading-none">{p.agendadas}</div>
              <div className="text-[9px] mt-0.5 font-medium opacity-70">ag.</div>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 bg-muted">
              <span className="text-2xl" aria-hidden>👤</span>
            </div>
          )}

          <div>
            <div className="font-bold text-base flex items-center gap-2 text-foreground">
              {modoRP && (aberto
                ? <ChevronDown size={12} className="text-muted-foreground" />
                : <ChevronRight size={12} className="text-muted-foreground" />
              )}
              <span>{p.prof}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
              {modoRP && (p.contrato
                ? <>
                    <span>{p.contrato}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "#fef3c7", color: "#92400e" }}>
                      contrato antigo
                    </span>
                  </>
                : <span>sem contrato cadastrado</span>
              )}
              {isCC
                ? <span>· <span style={{ color: B.purple }}>
                    {modoRP
                      ? `${p.pacientesCCQtd} pac. CC analisado(s)`
                      : `${pePacientesTela} PE confirmado`}
                  </span></span>
                : <span>· {p.agendadas} sessões agendadas</span>
              }
            </div>
            {remPeriodo && (
              <div className="text-xs mt-0.5" style={{ color: B.gray }}>
                Período: {remPeriodo.inicio} a {remPeriodo.fim}
              </div>
            )}
            {modoRP && (
              <div className="text-xs mt-1 font-semibold"
                   style={{ color: pctEv >= 80 ? B.green : pctEv >= 50 ? B.amber : B.red }}>
                {pctEv.toFixed(1)}% base corrigida
                <span className="font-normal text-muted-foreground ml-1">
                  ({totalRecebeHoje} remun. / {baseCalc} válidas)
                </span>
              </div>
            )}
            {p.inconsistencias > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                    style={{ background: "#fee2e2", color: B.red }}>
                ⚠ {p.inconsistencias} inconsistência(s)
              </span>
            )}
          </div>
        </div>

        {/* Donuts ficam no corpo expandido — ver abaixo */}

        {/* Resumo compacto (recolhido) */}
        {modoRP && !aberto && (
          <div className="grid grid-cols-[minmax(220px,1fr)_110px_90px_90px_100px] gap-3 items-center min-w-0 w-full">
            <div>
              <div className="h-2 rounded-full overflow-hidden border border-border bg-muted">
                <div className="h-full rounded-full transition-all"
                     style={{ width: `${Math.max(0, Math.min(100, pctEv))}%`, background: corBorda }} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground text-right">
                {totalRecebeHoje} remun. / {baseCalc} válidas
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Recebe</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.green }}>{fmt(valorConfirmadoTela)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Pendente</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.amber }}>{(p.pendentes ?? 0) + (p.naoEvoluidas ?? 0)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Não recebe</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.red }}>{(p.substituidoPorOutro ?? 0) + p.canceladas}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground">Inconsistência</div>
              <div className="text-sm font-black tabular-nums" style={{ color: B.red }}>{p.inconsistencias}</div>
            </div>
          </div>
        )}

        {/* Botões Individual */}
        {!modoRP && (onGerarPDF || onGerarWord) && (
          <div className="flex gap-2 flex-wrap justify-end">
            {onGerarPDF && (
              <button type="button" onClick={onGerarPDF}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                      style={{ background: B.navy }}>
                <FileText size={13} aria-hidden /> Gerar PDF
              </button>
            )}
            {onGerarWord && (
              <button type="button" onClick={onGerarWord}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                      style={{ background: B.blue }}>
                <Download size={13} aria-hidden /> Exportar Word
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Corpo expandido ────────────────────────────────────────────── */}
      {aberto && (
        <>
          {/* ── Donuts + KPI cards — layout unificado horizontal ─────────── */}
          <div className="px-4 pb-4 border-t border-border/50 pt-4">
            <div className="flex gap-5 items-start">

              {/* Donuts premium — painel esquerdo mais largo */}
              {modoRP && p.agendadas > 0 && (
                <div className="flex gap-10 shrink-0 rounded-[20px] p-5 shadow-sm bg-gradient-to-br from-muted/70 to-muted/30 border border-border">
                  <div className="w-[200px]">
                    <DonutCard
                      title="Base total"
                      statLabel={`${p.agendadas} ag.`}
                      statColor={B.navy}
                      size={200}
                      centerLabel={`${(p.agendadas > 0 ? pctEv * (p.agendadas - p.canceladas) / p.agendadas : 0).toFixed(1)}%`}
                      centerFontSize={28}
                      segments={segmentosTotal}
                      highlightGroup={cardHover}
                    />
                  </div>
                  <div className="w-px self-stretch bg-border" />
                  <div className="w-[200px]">
                    <DonutCard
                      title="Base corrigida"
                      statLabel={`${p.agendadas - p.canceladas} ag.`}
                      statColor={pctEv >= 80 ? B.green : pctEv >= 50 ? B.amber : B.red}
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
              <div className="grid grid-cols-2 gap-2.5 flex-1 min-w-0">

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
                <div>• PE: {modoRP
                  ? (p.peProporcionalAtivo
                      ? `${p.pacientesCCQtd} pac. analisado(s)`
                      : `${p.pacientesCCQtd} pac. × ${fmt(ccPE)}`)
                  : `${pePacientesTela} pac. confirmado(s) · ${fmt(peValorTela)}`}
                </div>
              )}
                {isCC && p.peBloqueado && (
                  <div className="font-semibold" style={{ color: B.amber }}>• PE bloqueado: falta relatório 1 ou 2.</div>
                )}
                {modoRP && isCC && ((p.peEmAberto ?? 0) + (p.peAguardaDiretoria ?? 0)) > 0 && (
                  <div>• PE em aberto: {(p.peEmAberto ?? 0) + (p.peAguardaDiretoria ?? 0)} paciente(s)</div>
                )}
                {(p.diariaPeriodo ?? 0) > 0 && <div>• PPD: {fmt(p.diariaPeriodo ?? 0)}</div>}
                {(p.etaBonusPeriodo ?? 0) > 0 && <div>• Bônus ETA: {p.etaWeeksPeriodo}sem × {fmt(etaBonus)}</div>}
                <div className="font-semibold border-t pt-1 mt-1" style={{ borderColor: "#bbf7d0", color: "#15803d" }}>
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
              <div className="rounded-xl px-2.5 py-1.5 mt-2 text-xs leading-snug"
                   style={{ background: "#fef3c7", color: "#92400e" }}>
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
              tooltip="Presença Recep. ≠ Possui Tratativa: a recepção marcou falta mas há tratativa registrada (ou a sessão foi cancelada mas ainda assim evoluída). Confirme antes de pagar."
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
              <div className="rounded-2xl overflow-hidden shadow-sm"
                   style={{ border: "1px solid #e9d5ff" }}>

                {/* Cabeçalho */}
                <div className="px-4 py-2.5 flex items-center gap-2.5"
                     style={{ background: "linear-gradient(90deg, #7c3aed18 0%, #a855f718 100%)" }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: "#7c3aed20" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
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
                        {modoRP
                          ? (p.peProporcionalAtivo ? "PE por regra 2026" : "PE bloqueado")
                          : "PE confirmado"}
                        {p.peInfoTexto && <InfoTooltip text={p.peInfoTexto} />}
                      </p>
                      {p.peDiasMes && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: "#ede9fe", color: "#6d28d9" }}>
                          mês-base {p.peDiasMes}d
                        </span>
                      )}
                    </div>

                    {p.peBloqueado ? (
                      /* ── PE bloqueado: banner elegante ── */
                      <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                           style={{ background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%)", border: "1px solid #fed7aa" }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                             style={{ background: "#fde68a" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black" style={{ color: "#92400e" }}>
                            PE não calculado
                          </div>
                          <div className="text-xs mt-0.5 leading-snug" style={{ color: "#b45309" }}>
                            Importe os relatórios 1 e 2 para liberar a análise completa.
                          </div>
                        </div>
                      </div>
                    ) : p.peProporcionalAtivo ? (
                      <>
                        <PeBloco titulo="PE integral confirmado"    lista={peGrupos.integral}    cor={B.green}  bg="#f0fdf4" total={peGrupos.totalIntegral}    open={blocoAberto("pe_integral")}    onToggle={() => togBloco("pe_integral")} />
                        {(modoRP || peGrupos.proporcional.length > 0) && (
                          <PeBloco titulo="PE proporcional confirmado" lista={peGrupos.proporcional} cor={B.blue}  bg="#eff6ff" total={peGrupos.totalProporcional} open={blocoAberto("pe_proporcional")} onToggle={() => togBloco("pe_proporcional")} />
                        )}
                        {modoRP && <PeBloco titulo="PE em aberto / Diretoria" lista={peGrupos.aberto} cor={B.amber} bg="#fff7ed" total={null} open={blocoAberto("pe_aberto")} onToggle={() => togBloco("pe_aberto")} />}
                        {modoRP && <PeBloco titulo="PE zero automático"        lista={peGrupos.zero}   cor={B.red}   bg="#fff1f2" total={0}    open={blocoAberto("pe_zero")}   onToggle={() => togBloco("pe_zero")} />}
                      </>
                    ) : (
                      <div className="text-xs font-bold tabular-nums" style={{ color: "#7c3aed" }}>
                        {pePacientesTela} pac. × {fmt(ccPE)}
                      </div>
                    )}
                  </div>

                  {/* Coluna 3 — Totais */}
                  <div className="lg:col-span-3 px-4 py-3 space-y-3"
                       style={{ background: "linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)" }}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">
                        Total confirmado
                      </p>
                      <div className="text-xl font-black tabular-nums" style={{ color: B.green }}>
                        {fmt(valorConfirmadoTela)}
                      </div>
                    </div>
                    <div className="border-t border-purple-100 dark:border-purple-900/40 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">
                        PE confirmado
                      </p>
                      <div className="text-base font-black tabular-nums" style={{ color: "#7c3aed" }}>
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
                      [`rem:${p.prof}`]: modoRP ? (aberto ? null : true) : (aberto ? false : true)
                    }))}>
              {aberto ? "▲ Ocultar sessões" : "▼ Ver sessões detalhadas"}
            </button>
            {aberto && <span className="text-xs text-muted-foreground pt-2">{p.sessoes.length} registro(s)</span>}
          </div>

          {/* Listas de sessões agrupadas */}
          {aberto && (
            <div className="px-4 pb-4 space-y-2">
              {([
                { key: "recebe",    list: sRecebe,          cor: B.green,  bg: B.limeLt,  icon: <CheckCircle2 size={12} />, titulo: "Recebe agora",           mostrarPapel: true,  extra: (ss: SessaoComPapel[]) => fmt(ss.reduce((a, s) => a + getPARow(s), 0)) },
                { key: "registro",  list: sRegNaoRealizado, cor: B.amber,  bg: B.amberLt, icon: <AlertTriangle size={12} />, titulo: "Registro não realizado", mostrarPapel: false, extra: undefined },
                { key: "naoRecebe", list: sNaoRecebe,       cor: B.red,    bg: "#fee2e2",  icon: <XCircle size={12} />,     titulo: "Não recebe",              mostrarPapel: true,  extra: undefined },
                { key: "inc",       list: sInc,             cor: B.red,    bg: "#fee2e2",  icon: <HelpCircle size={12} />,  titulo: "Analisar Inconsistência", mostrarPapel: true,  extra: undefined, always: true },
              ] as const).map(bloco => {
                const lista = bloco.list as SessaoComPapel[]
                if (!lista.length && !("always" in bloco && bloco.always)) return null
                const filt = filtrarSessoes(lista)
                const open = blocoAberto(bloco.key)
                return (
                  <div key={bloco.key}>
                    <button type="button"
                            className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-opacity hover:opacity-90"
                            style={{ background: bloco.bg }}
                            onClick={() => togBloco(bloco.key)}>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-xs font-bold flex items-center gap-1" style={{ color: bloco.cor }}>
                          {bloco.icon} {bloco.titulo} · {filt.length} sessão(ões)
                        </span>
                      </div>
                      {bloco.extra && (
                        <span className="text-xs font-bold flex-shrink-0 tabular-nums" style={{ color: bloco.cor }}>
                          {bloco.extra(filt)}
                        </span>
                      )}
                      {open
                        ? <ChevronDown size={12} style={{ color: bloco.cor }} />
                        : <ChevronRight size={12} style={{ color: bloco.cor }} />
                      }
                    </button>
                    {open && bloco.key === "inc" && (
                      <div className="text-xs p-2 rounded mb-1 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400">
                        Presença Órbita ≠ Possui Tratativa. Confirme antes de pagar.
                      </div>
                    )}
                    {open && <SessoesTabela sessoes={filt} mostrarPapel={bloco.mostrarPapel} valorCor={bloco.cor} getPARow={getPARow} />}
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
