"use client"

// ComparativoSessoesShell — compara a quantidade de sessões agendadas entre
// dois períodos. Ambos os períodos aceitam upload manual do XLSX
// "agendamentos_profissionais" (pra comparar qualquer mês). Se o Período 2
// não tiver upload, cai automaticamente pra busca via API em
// csv_grades_profissionais (primeira semana completa do mês subsequente —
// mesma "semana de referência" de Saída de Profissional).
// A lógica de filtro/mapeamento/agregação vive em lib/cronograma/comparativoSessoes.ts.
// Inspirado no resultado de "comparativo_julho_agosto_2026.xlsx".

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  Upload, CheckCircle2, X, Loader2, TrendingUp, TrendingDown, Minus, Building2, Users, ArrowRightLeft,
  DatabaseZap, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, Filter, Search, SlidersHorizontal, UserCheck, CalendarDays,
  Brain, Home, School, HandHelping, Paintbrush, ClipboardList, PawPrint, Dumbbell, Waves, MessageCircle, Music, Salad,
  BookOpenCheck, HeartHandshake, PersonStanding, BookOpen, Eye, Apple, Puzzle, ClipboardCheck, Footprints,
  UserMinus, UserPlus, UsersRound,
  type LucideIcon,
} from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { TONE_SOFT, TONE_SOLID, TONE_ACCENT, type Tone } from "@/components/cronograma/ui/tones"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { tCor, normTxt } from "@/lib/cronograma/constants"
import {
  normalizarLinhasUpload, normalizarLinhasApi, calcularComparativo, calcularPorPacienteDaUnidade, classificarMovimento, rangeDatas,
  filtrarSessoesPorTexto, passaFiltroNumerico, sessoesDoPaciente, validarDataMinimaUpload, DIAS_SEMANA_LABEL,
  calcularTurnoverProfissionais, calcularResumoTurnoverGeral, sessoesDoProfissionalNoGrupo, ROTULO_PSICOLOGIA_ABA, IDS_PSICOLOGIA_ABA,
  type SessaoComparativo, type ComparativoResultado, type UnidadeComparativo, type PacienteComparativo, type CategoriaMovimento,
  type TurnoverTerapia, type ProfissionalTurnover,
} from "@/lib/cronograma/comparativoSessoes"
import { buscarGradeComparativo } from "@/lib/cronograma/gradeService"

/** Filtro da tabela "Por Paciente": uma categoria de movimento, ou o total de um grupo (união de 2 categorias). */
type FiltroCategoria = CategoriaMovimento | "ganhos" | "perdas"

const FILTRO_LABEL: Record<FiltroCategoria, string> = {
  aumento: "Pacientes com aumento",
  novos: "Novos pacientes captados",
  reducao: "Pacientes com redução",
  desligados: "Pacientes desligados",
  semAlteracao: "Sem alteração",
  ganhos: "Total de ganhos",
  perdas: "Total de perdas",
}
const FILTRO_TONE: Record<FiltroCategoria, Tone> = {
  aumento: "green", novos: "green", reducao: "red", desligados: "red", semAlteracao: "slate",
  ganhos: "green", perdas: "red",
}
/** Categorias de movimento que cada filtro de grupo/total abrange. */
const FILTRO_CATEGORIAS: Record<FiltroCategoria, CategoriaMovimento[]> = {
  aumento: ["aumento"], novos: ["novos"], reducao: ["reducao"], desligados: ["desligados"], semAlteracao: ["semAlteracao"],
  ganhos: ["aumento", "novos"], perdas: ["reducao", "desligados"],
}
/** Mesmos rótulos de FILTRO_LABEL, mas pra profissionais em vez de pacientes — usado no resumo geral do turnover. */
const FILTRO_LABEL_PROFISSIONAL: Record<FiltroCategoria, string> = {
  aumento: "Profissionais com aumento",
  novos: "Novos profissionais captados",
  reducao: "Profissionais com redução",
  desligados: "Profissionais que saíram",
  semAlteracao: "Sem alteração",
  ganhos: "Total de ganhos",
  perdas: "Total de perdas",
}

const RING_TONE: Record<Tone, string> = {
  green: "ring-emerald-400", red: "ring-rose-400", slate: "ring-slate-400",
  blue: "ring-sky-400", amber: "ring-amber-400", purple: "ring-violet-400",
}

/** Ordem de exibição dos dias da semana na agenda (Segunda a Sábado, Domingo por último) — índices de DIAS_SEMANA_LABEL (0 = domingo). */
const ORDEM_DIAS_EXIBICAO = [1, 2, 3, 4, 5, 6, 0]

/** Segunda a Sábado aparecem sempre na agenda, mesmo sem sessão nenhuma naquele dia — só assim fica visível que o paciente "não vem" num dia específico, em vez da coluna simplesmente não existir. Domingo só aparece se tiver sessão real. */
const DIAS_UTEIS_SEMPRE_VISIVEIS = [1, 2, 3, 4, 5, 6]

function hexParaHsl(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "")
  const r = parseInt(limpo.slice(0, 2), 16) / 255
  const g = parseInt(limpo.slice(2, 4), 16) / 255
  const b = parseInt(limpo.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0, s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return [h, s, l]
}

function hslParaHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Cor do dot de especialidade com piso de contraste: várias entradas de
 * TERAPIA_CORES são tons claros (ex.: "Aplicador ABA Escola" é um cinza bem
 * lavado) que na grade de agenda — onde é a cor que mais se repete — ficam
 * quase invisíveis sobre fundo branco. Clampa a luminosidade sem trocar a
 * identidade de cor (mantém o matiz); cinzas quase-brancos ficam num cinza
 * médio visível em vez de inventar uma cor que não existia.
 */
function corDotComContraste(nome: string): string {
  const [h, s, l] = hexParaHsl(tCor(nome, true))
  if (l <= 0.62) return tCor(nome, true)
  return hslParaHex(h, s > 0.05 ? Math.max(s, 0.18) : 0, 0.55)
}

/** Ícone que remete ao nome da especialidade — só as que têm um símbolo óbvio (fala, escola, maçã...); o resto continua com a bolinha de cor pra não forçar um ícone genérico sem sentido. */
const ICONE_TERAPIA: Record<string, LucideIcon> = {
  [normTxt("Aplicador ABA (AE)")]: Paintbrush,
  [normTxt("Aplicador ABA (AV)")]: Brain,
  [normTxt("Aplicador ABA (EF)")]: Dumbbell,
  [normTxt("Aplicador ABA (HS)")]: Brain,
  [normTxt("Aplicador ABA (PS)")]: Brain,
  [normTxt("Aplicador ABA (SF)")]: Brain,
  [normTxt("Aplicador ABA Casa")]: Home,
  [normTxt("Aplicador ABA Escola")]: School,
  [normTxt("Aplicador Suporte")]: HandHelping,
  [normTxt("Arteterapia")]: Paintbrush,
  [normTxt("Coordenador de Caso")]: ClipboardList,
  [normTxt("Equoterapia")]: PawPrint,
  [normTxt("Fisioterapia")]: Dumbbell,
  [normTxt("Fisioterapia Aquática")]: Waves,
  [normTxt("Fonoaudiologia")]: MessageCircle,
  [normTxt("Musicoterapia")]: Music,
  [normTxt("Nutrição")]: Salad,
  [normTxt("Psicoeducação")]: BookOpenCheck,
  [normTxt("Psicologia")]: HeartHandshake,
  [normTxt("Psicomotricidade")]: PersonStanding,
  [normTxt("Psicopedagogia")]: BookOpen,
  [normTxt("Supervisão ABA")]: Eye,
  [normTxt("Terapia Alimentar")]: Apple,
  [normTxt("Terapia Ocupacional")]: Puzzle,
  [normTxt("Triagem")]: ClipboardCheck,
  [normTxt("Visita Guiada")]: Footprints,
  [normTxt("Psicologia ABA")]: Brain,
}

/** Ícone (quando existe um mapeado) ou bolinha de cor (fallback) representando a especialidade — usado na agenda e em "Por especialidade". */
function IconeOuDotTerapia({ nome, size = 14 }: { nome: string; size?: number }) {
  const Icone = ICONE_TERAPIA[normTxt(nome)]
  const cor = corDotComContraste(nome)
  if (Icone) return <Icone size={size} style={{ color: cor }} className="shrink-0" />
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
      style={{ background: cor }}
    />
  )
}

interface MetricButtonProps {
  label: string
  qtd: number
  sessoes: number
  sign: "pos" | "neg"
  tone: Tone
  active: boolean
  onClick: () => void
  unidade?: string
  titulo?: string
}

/** Metade clicável de um GroupCard — mostra qtd (pacientes/profissionais) + sessões e funciona como filtro toggle. */
function MetricButton({ label, qtd, sessoes, sign, tone, active, onClick, unidade = "pacientes", titulo }: MetricButtonProps) {
  const soft = TONE_SOFT[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={titulo ?? `Filtrar Por Paciente: ${label}`}
      className={`relative flex-1 px-4 py-3 text-left transition-colors ${active ? soft.bg : "hover:bg-muted/40"}`}
    >
      {active && <span className={`pointer-events-none absolute inset-1.5 rounded-xl ring-2 ${RING_TONE[tone]}`} />}
      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {active && <Filter size={10} className={soft.text} />}
        {label}
      </div>
      <div className="flex items-baseline gap-3">
        <div>
          <div className="text-xl font-black text-foreground">{qtd}</div>
          <div className="text-[10px] text-muted-foreground">{unidade}</div>
        </div>
        <div>
          <div className={`text-xl font-black ${sign === "pos" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {sign === "pos" ? "+" : "-"}{sessoes}
          </div>
          <div className="text-[10px] text-muted-foreground">sessões</div>
        </div>
      </div>
    </button>
  )
}

interface GroupCardProps {
  tone: "green" | "red"
  icon: React.ReactNode
  title: string
  totalQtd: number
  totalSessoes: number
  totalAtivo: boolean
  onTotalClick: () => void
  sign: "pos" | "neg"
  children: React.ReactNode
  unidade?: string
}

/** Card que agrupa duas métricas relacionadas (ex.: Ganhos = Aumento + Novos captados) + o total do grupo, sob um mesmo título/tom. */
function GroupCard({ tone, icon, title, totalQtd, totalSessoes, totalAtivo, onTotalClick, sign, children, unidade = "pacientes" }: GroupCardProps) {
  const soft = TONE_SOFT[tone]
  const accent = TONE_ACCENT[tone]
  const border = tone === "green" ? "border-emerald-200/70 dark:border-emerald-800/40" : "border-rose-200/70 dark:border-rose-800/40"
  return (
    <div className={`rounded-2xl border ${border} ${soft.bg} shadow-sm overflow-hidden`}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}33)` }} />
      <div className={`flex items-center gap-1.5 px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide ${soft.text}`}>
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-3 divide-x divide-border/60">
        {children}
        <MetricButton
          label="Total" sign={sign} tone={tone} unidade={unidade}
          qtd={totalQtd} sessoes={totalSessoes}
          active={totalAtivo} onClick={onTotalClick}
        />
      </div>
    </div>
  )
}

type SortDir = "asc" | "desc"
/** Um critério de ordenação (coluna + direção). A posição no array é a prioridade — [0] é o critério principal, o resto são desempates. */
interface SortCriterio { key: string; dir: SortDir }

function compararValores(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR")
  const an = typeof a === "number" ? a : -Infinity
  const bn = typeof b === "number" ? b : -Infinity
  return an - bn
}

/** Ordena por múltiplos critérios acumulados (ex.: Convênio desc, com Id desc como desempate). */
function ordenarPorMulti<T>(rows: T[], criterios: SortCriterio[]): T[] {
  if (criterios.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const { key, dir } of criterios) {
      const cmp = compararValores(a[key as keyof T], b[key as keyof T])
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp
    }
    return 0
  })
}

/** Clique acumula: coluna nova entra como critério principal (asc); clicar de novo alterna pra desc; clicar uma 3ª vez remove o critério (mantendo os demais). */
function cicloOrdenacao(criterios: SortCriterio[], key: string): SortCriterio[] {
  const atual = criterios.find(c => c.key === key)
  const resto = criterios.filter(c => c.key !== key)
  if (!atual) return [{ key, dir: "asc" }, ...resto]
  if (atual.dir === "asc") return [{ key, dir: "desc" }, ...resto]
  return resto
}

/** Remove todos os critérios de ordenação acumulados de uma vez — sem isso, desfazer 5 colunas ordenadas exigiria clicar 3x em cada uma. */
function BotaoLimparOrdenacao({ criterios, onClear }: { criterios: SortCriterio[]; onClear: () => void }) {
  if (criterios.length === 0) return null
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
    >
      <X size={10} />
      Limpar ordenação
    </button>
  )
}

interface SortableThProps {
  label: string
  sortKey: string
  criterios: SortCriterio[]
  align?: "left" | "right"
  onClick: (key: string) => void
  colSpan?: number
  rowSpan?: number
}

function SortableTh({ label, sortKey, criterios, align = "left", onClick, colSpan, rowSpan }: SortableThProps) {
  const idx = criterios.findIndex(c => c.key === sortKey)
  const active = idx !== -1
  const dir = active ? criterios[idx].dir : undefined
  const prioridade = active && criterios.length > 1 ? idx + 1 : null
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown
  return (
    <th
      colSpan={colSpan}
      rowSpan={rowSpan}
      className={`py-1.5 ${align === "right" ? "px-2 text-right" : "pr-2"} font-semibold cursor-pointer select-none hover:text-foreground transition-colors`}
      onClick={() => onClick(sortKey)}
      title={active ? "Clique: inverte / clique 3x: remove este critério" : "Clique pra ordenar (acumula com os demais critérios)"}
    >
      <span className={`inline-flex items-center gap-1 whitespace-nowrap ${align === "right" ? "justify-end w-full" : ""}`}>
        {label}
        {prioridade && <sup className="text-[9px] font-bold text-muted-foreground/70">{prioridade}</sup>}
        <Icon size={12} className={active ? "text-foreground" : "opacity-40"} />
      </span>
    </th>
  )
}

interface FilterBarProps {
  paciente: string
  onPaciente: (v: string) => void
  convenios: string[]
  onConvenios: (v: string[]) => void
  convenioOptions: string[]
  unidades: string[]
  onUnidades: (v: string[]) => void
  unidadeOptions: string[]
  p1Min: number | null
  onP1Min: (v: number | null) => void
  p2Min: number | null
  onP2Min: (v: number | null) => void
  diferencaMin: number | null
  onDiferencaMin: (v: number | null) => void
  diferencaMax: number | null
  onDiferencaMax: (v: number | null) => void
  ativo: boolean
  onLimpar: () => void
}

function NumberFilterInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
      {label}
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder="—"
        className="w-14 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground outline-none focus:border-primary/60"
      />
    </label>
  )
}

/** Dropdown de checkboxes pra selecionar vários convênios de uma vez (filtro "ou": qualquer um dos marcados). */
/** Dropdown de checkboxes genérico (filtro "ou": qualquer um dos marcados) — usado pra Convênio e Unidade. */
function MultiSelectDropdown({
  label, options, selecionados, onChange, vazio = "Nenhuma opção carregada.",
}: { label: string; options: string[]; selecionados: string[]; onChange: (v: string[]) => void; vazio?: string }) {
  function toggle(c: string) {
    onChange(selecionados.includes(c) ? selecionados.filter(x => x !== c) : [...selecionados, c])
  }
  return (
    <details className="relative">
      <summary
        className={`flex w-40 cursor-pointer list-none items-center justify-between gap-1 rounded-md border px-2 py-1 text-[11px] outline-none
          ${selecionados.length > 0 ? "border-primary/50 text-foreground" : "border-border text-muted-foreground"}`}
      >
        <span className="truncate">{selecionados.length > 0 ? `${label} (${selecionados.length})` : label}</span>
        <ChevronDown size={12} className="shrink-0" />
      </summary>
      <div className="absolute z-10 mt-1 max-h-56 w-52 overflow-auto rounded-md border border-border bg-card p-1 shadow-md">
        {options.length === 0 && <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{vazio}</div>}
        {options.map(c => (
          <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[11px] text-foreground hover:bg-muted/50">
            <input type="checkbox" checked={selecionados.includes(c)} onChange={() => toggle(c)} className="accent-primary" />
            <span className="truncate">{c}</span>
          </label>
        ))}
        {selecionados.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] font-semibold text-muted-foreground hover:bg-muted/50 hover:text-destructive"
          >
            Limpar seleção
          </button>
        )}
      </div>
    </details>
  )
}

/** Banco de filtros compartilhado por "Por Unidade" e "Por Paciente" — Paciente/Convênio recortam as sessões antes do cálculo; P1/P2/Diferença mín. filtram cada tabela linha a linha. */
function FilterBar({
  paciente, onPaciente, convenios, onConvenios, convenioOptions, unidades, onUnidades, unidadeOptions,
  p1Min, onP1Min, p2Min, onP2Min, diferencaMin, onDiferencaMin, diferencaMax, onDiferencaMax, ativo, onLimpar,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <SlidersHorizontal size={12} />
        Filtros
      </span>

      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={paciente}
          onChange={e => onPaciente(e.target.value)}
          placeholder="Buscar paciente..."
          className="w-40 rounded-md border border-border bg-card py-1 pl-6 pr-2 text-[11px] text-foreground outline-none focus:border-primary/60"
        />
      </div>

      <MultiSelectDropdown label="Convênio" options={convenioOptions} selecionados={convenios} onChange={onConvenios} vazio="Nenhum convênio carregado." />
      <MultiSelectDropdown label="Unidade" options={unidadeOptions} selecionados={unidades} onChange={onUnidades} vazio="Nenhuma unidade carregada." />

      <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />

      <NumberFilterInput label="Período 1 ≥" value={p1Min} onChange={onP1Min} />
      <NumberFilterInput label="Período 2 ≥" value={p2Min} onChange={onP2Min} />
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Diferença
        <NumberFilterInput label="entre" value={diferencaMin} onChange={onDiferencaMin} />
        <NumberFilterInput label="e" value={diferencaMax} onChange={onDiferencaMax} />
      </span>

      <button
        type="button"
        onClick={() => onP2Min(p2Min === 1 ? null : 1)}
        aria-pressed={p2Min === 1}
        title="Filtrar pacientes com Período 2 ≥ 1"
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors
          ${p2Min === 1 ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
      >
        <UserCheck size={11} />
        Apenas pacientes ativos
      </button>

      {ativo && (
        <button
          type="button"
          onClick={onLimpar}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
        >
          <X size={11} />
          Limpar filtros
        </button>
      )}
    </div>
  )
}

function fmtPct(v: number | null): string {
  if (v === null) return "—"
  const pct = (v * 100).toFixed(1).replace(".", ",")
  return `${v > 0 ? "+" : ""}${pct}%`
}

function DiffBadge({ v }: { v: number }) {
  if (v > 0) return <StatusPill tone="green" dense>+{v}</StatusPill>
  if (v < 0) return <StatusPill tone="red" dense>{v}</StatusPill>
  return <StatusPill tone="slate" dense>0</StatusPill>
}

interface ResumoTerapia { terapia: string; p1: number; p2: number; diferenca: number }

/**
 * Descobre, a partir das sessões reais do paciente, quais NOMES de terapia
 * correspondem aos Id Terapia do grupo "Psicologia ABA" — evita hardcodar
 * nomes (que variam) e funciona mesmo quando uma sessão deduplicada do Assim
 * Saúde guarda vários nomes juntos em `terapia` (ver dedupAssimSaude): como
 * a checagem é por nome, não por sessão, cada nome individual continua
 * classificado corretamente mesmo dentro de um texto "A + B".
 */
function nomesDoGrupoPsicologiaAba(sessoes: SessaoComparativo[]): Set<string> {
  const nomes = new Set<string>()
  for (const s of sessoes) {
    if (s.idTerapia !== null && IDS_PSICOLOGIA_ABA.has(s.idTerapia)) {
      for (const nome of (s.terapia || "").split(" + ")) if (nome) nomes.add(nome)
    }
  }
  return nomes
}

/**
 * Conta sessões por especialidade, separando terapias que uma sessão do
 * Assim Saúde deduplicada guarda juntas (ver dedupAssimSaude) — a contagem
 * daqui é POR ESPECIALIDADE, não por sessão: as duas terapias de um mesmo
 * horário deduplicado contam 1 cada na sua própria especialidade, mesmo que a
 * sessão em si conte só 1 no total geral. Quando `nomesAgrupar` é passado,
 * qualquer nome presente nele conta sob ROTULO_PSICOLOGIA_ABA em vez do
 * próprio nome (toggle "Agrupar Psicologia ABA").
 */
function contarPorTerapia(sessoes: SessaoComparativo[], nomesAgrupar?: Set<string>): Map<string, number> {
  const contagem = new Map<string, number>()
  for (const s of sessoes) {
    for (const nome of (s.terapia || "—").split(" + ")) {
      const chave = nomesAgrupar?.has(nome) ? ROTULO_PSICOLOGIA_ABA : nome
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
    }
  }
  return contagem
}

/** Resumo por especialidade (P1 x P2 x diferença) — usado abaixo da agenda no drill-down "Por Paciente". */
function calcularResumoPorTerapia(p1: SessaoComparativo[], p2: SessaoComparativo[], nomesAgrupar?: Set<string>): ResumoTerapia[] {
  const contagemP1 = contarPorTerapia(p1, nomesAgrupar)
  const contagemP2 = contarPorTerapia(p2, nomesAgrupar)
  const terapias = [...new Set([...contagemP1.keys(), ...contagemP2.keys()])]
  return terapias
    .map(terapia => {
      const t1 = contagemP1.get(terapia) ?? 0
      const t2 = contagemP2.get(terapia) ?? 0
      return { terapia, p1: t1, p2: t2, diferenca: t2 - t1 }
    })
    .sort((a, b) => a.terapia.localeCompare(b.terapia, "pt-BR"))
}

function parseXlsxGenerico(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", raw: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."))
    reader.readAsArrayBuffer(file)
  })
}

interface UploadCardProps {
  label: string
  fileName: string | null
  count: number
  loading: boolean
  error: string | null
  onFile: (file: File) => void
  onClear: () => void
}

function UploadCard({ label, fileName, count, loading, error, onFile, onClear }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const loaded = count > 0

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ""
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={`relative inline-flex w-auto max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] leading-none transition-colors select-none
        ${!loaded && !loading ? "cursor-pointer" : ""}
        ${dragging ? "border-primary bg-primary/5" : loaded ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-border bg-card hover:border-[#2A92C0]/40 hover:bg-muted/40"}`}
      onClick={() => !loaded && !loading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onInputChange} />
      {loaded ? (
        <>
          <CheckCircle2 size={11} className="shrink-0 text-green-500" />
          <span className="max-w-[140px] truncate font-semibold text-green-700 dark:text-green-400">{fileName ?? label}</span>
          <span className="shrink-0 text-green-600 dark:text-green-500">({count})</span>
          <button
            onClick={e => { e.stopPropagation(); onClear() }}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover"
          >
            <X size={11} />
          </button>
        </>
      ) : loading ? (
        <span className="text-primary animate-pulse">Processando...</span>
      ) : error ? (
        <>
          <Upload size={11} className="shrink-0 text-muted-foreground" />
          <span className="text-destructive">{error}</span>
        </>
      ) : (
        <>
          <Upload size={11} className="shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">(.xlsx/.xls)</span>
        </>
      )}
    </div>
  )
}

export function ComparativoSessoesShell() {
  const labelP1 = "Período 1"
  const labelP2 = "Período 2"

  const [sessoesP1, setSessoesP1] = useState<SessaoComparativo[]>([])
  const [fileNameP1, setFileNameP1] = useState<string | null>(null)
  const [loadingP1, setLoadingP1] = useState(false)
  const [errorP1, setErrorP1] = useState<string | null>(null)

  // Período 2: se o usuário não anexar um XLSX, cai automaticamente pra
  // busca via API (primeira semana completa do mês subsequente — mesma
  // "semana de referência" usada em Saída de Profissional — getRefWeek() —
  // já que csv_grades_profissionais só tem dados confiáveis a partir do mês
  // seguinte). O upload manual, quando presente, tem prioridade sobre a API.
  const refWeek = getRefWeek()
  const [sessoesApiP2, setSessoesApiP2] = useState<SessaoComparativo[]>([])
  const [loadingApiP2, setLoadingApiP2] = useState(true)
  const [errorApiP2, setErrorApiP2] = useState<string | null>(null)

  const [sessoesUploadP2, setSessoesUploadP2] = useState<SessaoComparativo[]>([])
  const [fileNameP2, setFileNameP2] = useState<string | null>(null)
  const [loadingP2, setLoadingP2] = useState(false)
  const [errorP2, setErrorP2] = useState<string | null>(null)

  const usandoUploadP2 = sessoesUploadP2.length > 0
  const sessoesP2 = usandoUploadP2 ? sessoesUploadP2 : sessoesApiP2

  async function handleFileP1(file: File) {
    setLoadingP1(true)
    setErrorP1(null)
    try {
      const raw = await parseXlsxGenerico(file)
      const rows = normalizarLinhasUpload(raw)
      if (rows.length === 0) throw new Error("Nenhuma sessão agendada encontrada no arquivo.")
      validarDataMinimaUpload(rows)
      setSessoesP1(rows)
      setFileNameP1(file.name)
    } catch (e: unknown) {
      setErrorP1(e instanceof Error ? e.message : "Erro ao processar arquivo.")
    } finally {
      setLoadingP1(false)
    }
  }

  async function handleFileP2(file: File) {
    setLoadingP2(true)
    setErrorP2(null)
    try {
      const raw = await parseXlsxGenerico(file)
      const rows = normalizarLinhasUpload(raw)
      if (rows.length === 0) throw new Error("Nenhuma sessão agendada encontrada no arquivo.")
      validarDataMinimaUpload(rows)
      setSessoesUploadP2(rows)
      setFileNameP2(file.name)
    } catch (e: unknown) {
      setErrorP2(e instanceof Error ? e.message : "Erro ao processar arquivo.")
    } finally {
      setLoadingP2(false)
    }
  }

  useEffect(() => {
    let cancelado = false
    setLoadingApiP2(true)
    setErrorApiP2(null)
    buscarGradeComparativo(refWeek.inicio, refWeek.fim)
      .then(raw => {
        if (cancelado) return
        const rows = normalizarLinhasApi(raw)
        if (rows.length === 0) throw new Error("Nenhuma sessão agendada encontrada no período.")
        setSessoesApiP2(rows)
      })
      .catch((e: unknown) => {
        if (cancelado) return
        setErrorApiP2(e instanceof Error ? e.message : "Erro ao buscar dados da grade.")
      })
      .finally(() => { if (!cancelado) setLoadingApiP2(false) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pronto = sessoesP1.length > 0 && sessoesP2.length > 0
  const dataRangeP1 = useMemo(() => rangeDatas(sessoesP1), [sessoesP1])
  const dataRangeP2 = useMemo(() => rangeDatas(sessoesP2), [sessoesP2])

  // Banco de filtros — serve tanto "Por Unidade" quanto "Por Paciente" (e o
  // drill-down por paciente dentro da unidade): Paciente/Convênio recortam as
  // sessões ANTES do cálculo, então tudo abaixo (totais, por unidade, por
  // paciente) recalcula de forma consistente só com quem bate no filtro. P1
  // mín./P2 mín./Diferença mín. são aplicados depois, linha a linha, em cada
  // tabela (a mesma pessoa pode ter escalas bem diferentes em Unidade x Paciente).
  const [filtroPaciente, setFiltroPaciente] = useState("")
  const [filtroConvenios, setFiltroConvenios] = useState<string[]>([])
  const [filtroUnidades, setFiltroUnidades] = useState<string[]>([])
  const [filtroP1Min, setFiltroP1Min] = useState<number | null>(null)
  const [filtroP2Min, setFiltroP2Min] = useState<number | null>(null)
  const [filtroDiferencaMin, setFiltroDiferencaMin] = useState<number | null>(null)
  const [filtroDiferencaMax, setFiltroDiferencaMax] = useState<number | null>(null)
  const filtrosTextoAtivos = filtroPaciente.trim() !== "" || filtroConvenios.length > 0 || filtroUnidades.length > 0
  const filtrosAtivos = filtrosTextoAtivos || filtroP1Min !== null || filtroP2Min !== null || filtroDiferencaMin !== null || filtroDiferencaMax !== null
  function limparFiltros() {
    setFiltroPaciente(""); setFiltroConvenios([]); setFiltroUnidades([])
    setFiltroP1Min(null); setFiltroP2Min(null); setFiltroDiferencaMin(null); setFiltroDiferencaMax(null)
  }

  const convenioOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of [...sessoesP1, ...sessoesP2]) if (s.convenio) set.add(s.convenio)
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [sessoesP1, sessoesP2])

  const unidadeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of [...sessoesP1, ...sessoesP2]) if (s.unidade) set.add(s.unidade)
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [sessoesP1, sessoesP2])

  // Paciente/Convênio/Unidade recortam as sessões ANTES do cálculo — um só
  // banco de filtros pra tudo (Por Unidade, Por Paciente, Rotatividade de
  // Profissionais, Por Profissional): a mesma Unidade selecionada aqui vale
  // pros dois lados (pacientes e profissionais).
  const sessoesP1Filtradas = useMemo(() => {
    const porTexto = filtrarSessoesPorTexto(sessoesP1, filtroPaciente, filtroConvenios)
    return filtroUnidades.length === 0 ? porTexto : porTexto.filter(s => filtroUnidades.includes(s.unidade))
  }, [sessoesP1, filtroPaciente, filtroConvenios, filtroUnidades])
  const sessoesP2Filtradas = useMemo(() => {
    const porTexto = filtrarSessoesPorTexto(sessoesP2, filtroPaciente, filtroConvenios)
    return filtroUnidades.length === 0 ? porTexto : porTexto.filter(s => filtroUnidades.includes(s.unidade))
  }, [sessoesP2, filtroPaciente, filtroConvenios, filtroUnidades])
  const resultado: ComparativoResultado | null = pronto ? calcularComparativo(sessoesP1Filtradas, sessoesP2Filtradas) : null

  const [sortUnidade, setSortUnidade] = useState<SortCriterio[]>([{ key: "unidade", dir: "asc" }])
  const [sortPaciente, setSortPaciente] = useState<SortCriterio[]>([{ key: "paciente", dir: "asc" }])

  const porUnidadeFiltrado = useMemo(() => {
    if (!resultado) return []
    const ordenado = ordenarPorMulti(resultado.porUnidade, sortUnidade)
    return ordenado.filter(u => passaFiltroNumerico(u, filtroP1Min, filtroP2Min, filtroDiferencaMin, filtroDiferencaMax))
  }, [resultado, sortUnidade, filtroP1Min, filtroP2Min, filtroDiferencaMin, filtroDiferencaMax])
  const porPacienteOrdenado = useMemo(
    () => resultado ? ordenarPorMulti(resultado.porPaciente, sortPaciente) : [],
    [resultado, sortPaciente],
  )

  // Filtro por categoria de movimento: clicar num card de resumo (Aumento,
  // Novos captados, Redução, Desligados, Sem alteração, ou o Total de um
  // grupo) filtra a tabela "Por Paciente" pra essa categoria (ou união de
  // categorias, no caso do Total). Clicar de novo no mesmo card limpa o filtro.
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria | null>(null)
  function toggleFiltro(categoria: FiltroCategoria) {
    setFiltroCategoria(prev => (prev === categoria ? null : categoria))
  }
  const porPacienteFiltrado = useMemo(() => {
    let rows = porPacienteOrdenado
    if (filtroCategoria) {
      const categorias = FILTRO_CATEGORIAS[filtroCategoria]
      rows = rows.filter(p => categorias.includes(classificarMovimento(p)))
    }
    return rows.filter(p => passaFiltroNumerico(p, filtroP1Min, filtroP2Min, filtroDiferencaMin, filtroDiferencaMax))
  }, [porPacienteOrdenado, filtroCategoria, filtroP1Min, filtroP2Min, filtroDiferencaMin, filtroDiferencaMax])

  function onSortUnidade(key: string) {
    setSortUnidade(prev => cicloOrdenacao(prev, key))
  }
  function onSortPaciente(key: string) {
    setSortPaciente(prev => cicloOrdenacao(prev, key))
  }

  // Drill-down: clicar numa unidade mostra por paciente só as sessões dela —
  // explica por que o total líquido da unidade pode esconder pacientes que
  // aumentaram bem mais e outros que reduziram na mesma unidade.
  const [unidadeExpandida, setUnidadeExpandida] = useState<string | null>(null)
  const [sortPacienteUnidade, setSortPacienteUnidade] = useState<SortCriterio[]>([{ key: "paciente", dir: "asc" }])
  function onSortPacienteUnidade(key: string) {
    setSortPacienteUnidade(prev => cicloOrdenacao(prev, key))
  }
  const porPacienteDaUnidade = useMemo(() => {
    if (!unidadeExpandida) return []
    const rows = calcularPorPacienteDaUnidade(sessoesP1Filtradas, sessoesP2Filtradas, unidadeExpandida)
    const ordenado = ordenarPorMulti(rows, sortPacienteUnidade)
    return ordenado.filter(p => passaFiltroNumerico(p, filtroP1Min, filtroP2Min, filtroDiferencaMin, filtroDiferencaMax))
  }, [sessoesP1Filtradas, sessoesP2Filtradas, unidadeExpandida, sortPacienteUnidade, filtroP1Min, filtroP2Min, filtroDiferencaMin, filtroDiferencaMax])

  // Drill-down: clicar num paciente na tabela "Por Paciente" mostra a sessão a
  // sessão (id terapia, terapia, data, hora) que compõe o total de cada
  // período — explica exatamente qual terapia sumiu/entrou entre P1 e P2.
  const [pacienteExpandido, setPacienteExpandido] = useState<string | null>(null)
  function chavePaciente(p: Pick<PacienteComparativo, "idFavorecido" | "paciente">): string {
    return `${p.idFavorecido ?? "s"}-${p.paciente}`
  }
  const [agruparPsicologiaAba, setAgruparPsicologiaAba] = useState(false)
  const sessoesPacienteExpandido = useMemo(() => {
    if (!pacienteExpandido) return null
    const p = porPacienteFiltrado.find(x => chavePaciente(x) === pacienteExpandido)
    if (!p) return null
    const contexto = [...sessoesP1Filtradas, ...sessoesP2Filtradas]
    const p1 = sessoesDoPaciente(sessoesP1Filtradas, p, contexto)
    const p2 = sessoesDoPaciente(sessoesP2Filtradas, p, contexto)
    // Mesmos horários/dias nos dois grids — pra comparar P1 x P2 lado a lado
    // na mesma grade (slot vazio num lado e preenchido no outro salta aos olhos).
    const todas = [...p1, ...p2]
    const horarios = [...new Set(todas.map(s => s.hora))].sort()
    const diasPresentes = new Set(todas.map(s => s.diaSemanaIndice).filter((d): d is number => d !== null))
    const dias = ORDEM_DIAS_EXIBICAO.filter(d => DIAS_UTEIS_SEMPRE_VISIVEIS.includes(d) || diasPresentes.has(d))
    const nomesAgrupar = agruparPsicologiaAba ? nomesDoGrupoPsicologiaAba(todas) : undefined
    const porTerapia = calcularResumoPorTerapia(p1, p2, nomesAgrupar)
    return { paciente: p, p1, p2, horarios, dias, porTerapia }
  }, [pacienteExpandido, porPacienteFiltrado, sessoesP1Filtradas, sessoesP2Filtradas, agruparPsicologiaAba])

  // Turnover de profissionais por terapia — independente do drill-down por
  // paciente acima, mas usa o MESMO banco de filtros (Paciente/Convênio/
  // Unidade, já aplicados em sessoesP1Filtradas/P2Filtradas acima) — só assim
  // Unidade filtra igual pros dois lados (pacientes e profissionais).
  const [agruparPsicologiaAbaTurnover, setAgruparPsicologiaAbaTurnover] = useState(false)
  const [turnoverExpandido, setTurnoverExpandido] = useState<string | null>(null)

  const turnover = useMemo(
    () => calcularTurnoverProfissionais(sessoesP1Filtradas, sessoesP2Filtradas, agruparPsicologiaAbaTurnover),
    [sessoesP1Filtradas, sessoesP2Filtradas, agruparPsicologiaAbaTurnover],
  )
  const turnoverAtivo = turnover.find(t => t.chave === turnoverExpandido) ?? null
  const resumoTurnover = useMemo(() => calcularResumoTurnoverGeral(turnover), [turnover])

  // Filtro por categoria de movimento (mesma lógica de "Por Paciente"): clicar
  // num card de Ganhos/Perdas de profissionais filtra a tabela "Por
  // Profissional" abaixo pra essa categoria (ou união, no caso do Total).
  const [filtroCategoriaTurnover, setFiltroCategoriaTurnover] = useState<FiltroCategoria | null>(null)
  function toggleFiltroTurnover(categoria: FiltroCategoria) {
    setFiltroCategoriaTurnover(prev => (prev === categoria ? null : categoria))
  }
  const linhasProfissionalTerapia = useMemo(
    () => turnover.flatMap(t => t.movimento.map(m => ({ ...m, terapia: t.terapia, chaveGrupo: t.chave }))),
    [turnover],
  )
  const [sortProfissionalTerapia, setSortProfissionalTerapia] = useState<SortCriterio[]>([{ key: "profissional", dir: "asc" }])
  function onSortProfissionalTerapia(key: string) {
    setSortProfissionalTerapia(prev => cicloOrdenacao(prev, key))
  }
  const linhasProfissionalFiltrado = useMemo(() => {
    let linhas = linhasProfissionalTerapia
    if (filtroCategoriaTurnover) {
      const categorias = FILTRO_CATEGORIAS[filtroCategoriaTurnover]
      linhas = linhas.filter(m => categorias.includes(classificarMovimento(m)))
    }
    return ordenarPorMulti(linhas, sortProfissionalTerapia)
  }, [linhasProfissionalTerapia, filtroCategoriaTurnover, sortProfissionalTerapia])

  const [anoIni, mesIni, diaIni] = refWeek.inicio.split("-")
  const [anoFim, mesFim, diaFim] = refWeek.fim.split("-")
  const rangeCompacto = anoIni === anoFim
    ? `${diaIni}/${mesIni} a ${diaFim}/${mesFim}/${anoFim}`
    : refWeek.label

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <div className="flex items-center gap-1">
          <span className="shrink-0 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Período 1</span>
          <UploadCard
            label="Agendamentos Profissionais"
            fileName={fileNameP1}
            count={sessoesP1.length}
            loading={loadingP1}
            error={errorP1}
            onFile={handleFileP1}
            onClear={() => { setSessoesP1([]); setFileNameP1(null); setErrorP1(null) }}
          />
        </div>

        <div className="hidden h-4 w-px shrink-0 bg-border sm:block" />

        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Período 2</span>
          <UploadCard
            label="Agendamentos Profissionais (opcional)"
            fileName={fileNameP2}
            count={sessoesUploadP2.length}
            loading={loadingP2}
            error={errorP2}
            onFile={handleFileP2}
            onClear={() => { setSessoesUploadP2([]); setFileNameP2(null); setErrorP2(null) }}
          />
          {!usandoUploadP2 && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none
                ${loadingApiP2 ? "border-border bg-card" : errorApiP2 ? "border-rose-300 bg-rose-50 dark:bg-rose-950/20" : "border-green-400 bg-green-50 dark:bg-green-950/20"}`}
            >
              {loadingApiP2 ? (
                <>
                  <Loader2 size={10} className="shrink-0 animate-spin text-muted-foreground" />
                  <span className="text-foreground">Carregando grade...</span>
                </>
              ) : errorApiP2 ? (
                <>
                  <AlertTriangle size={10} className="shrink-0 text-rose-500" />
                  <span className="text-rose-700 dark:text-rose-400">{errorApiP2}</span>
                </>
              ) : (
                <>
                  <DatabaseZap size={10} className="shrink-0 text-green-500" />
                  <span className="font-semibold text-green-700 dark:text-green-400">{sessoesApiP2.length} horários</span>
                  <span className="text-green-600 dark:text-green-500">· {rangeCompacto}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {!pronto && (
        <p className="text-xs text-muted-foreground text-center">
          Carregue o arquivo de Agendamentos do Período 1 para ver o comparativo (o Período 2 usa a grade da API automaticamente, a menos que você anexe um arquivo).
        </p>
      )}

      {resultado && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard tone="slate" icon={<Users size={15} />} label={labelP1}>
              <div className="text-2xl font-black text-foreground">{resultado.totalP1}</div>
              {dataRangeP1 && <div className="mt-0.5 text-xs text-muted-foreground">{dataRangeP1}</div>}
            </StatCard>
            <StatCard tone="blue" icon={<Users size={15} />} label={labelP2}>
              <div className="text-2xl font-black text-foreground">{resultado.totalP2}</div>
              {dataRangeP2 && <div className="mt-0.5 text-xs text-muted-foreground">{dataRangeP2}</div>}
            </StatCard>
            <StatCard tone={resultado.diferenca > 0 ? "green" : resultado.diferenca < 0 ? "red" : "slate"} icon={<ArrowRightLeft size={15} />} label="Diferença">
              <div className="text-2xl font-black text-foreground">{resultado.diferenca > 0 ? "+" : ""}{resultado.diferenca}</div>
            </StatCard>
            <StatCard tone={resultado.diferenca > 0 ? "green" : resultado.diferenca < 0 ? "red" : "slate"} icon={<TrendingUp size={15} />} label="Variação %">
              <div className="text-2xl font-black text-foreground">{fmtPct(resultado.variacaoPct)}</div>
            </StatCard>
          </div>

          {/* Ganhos e Perdas agrupados por sentido do movimento — cada metade é um
              filtro clicável da tabela "Por Paciente" abaixo (toggle). */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
            <GroupCard
              tone="green" icon={<TrendingUp size={14} />} title="Ganhos de sessões" sign="pos"
              totalQtd={resultado.resumo.pacientesAumentaram + resultado.resumo.pacientesNovosCaptados}
              totalSessoes={resultado.resumo.sessoesAumentadas + resultado.resumo.sessoesNovosCaptados}
              totalAtivo={filtroCategoria === "ganhos"} onTotalClick={() => toggleFiltro("ganhos")}
            >
              <MetricButton
                label="Pacientes com aumento" sign="pos" tone="green"
                qtd={resultado.resumo.pacientesAumentaram} sessoes={resultado.resumo.sessoesAumentadas}
                active={filtroCategoria === "aumento"} onClick={() => toggleFiltro("aumento")}
              />
              <MetricButton
                label="Novos pacientes captados" sign="pos" tone="green"
                qtd={resultado.resumo.pacientesNovosCaptados} sessoes={resultado.resumo.sessoesNovosCaptados}
                active={filtroCategoria === "novos"} onClick={() => toggleFiltro("novos")}
              />
            </GroupCard>
            <GroupCard
              tone="red" icon={<TrendingDown size={14} />} title="Perdas de sessões" sign="neg"
              totalQtd={resultado.resumo.pacientesReduziram + resultado.resumo.pacientesDesligados}
              totalSessoes={resultado.resumo.sessoesReduzidas + resultado.resumo.sessoesDesligados}
              totalAtivo={filtroCategoria === "perdas"} onTotalClick={() => toggleFiltro("perdas")}
            >
              <MetricButton
                label="Pacientes com redução" sign="neg" tone="red"
                qtd={resultado.resumo.pacientesReduziram} sessoes={resultado.resumo.sessoesReduzidas}
                active={filtroCategoria === "reducao"} onClick={() => toggleFiltro("reducao")}
              />
              <MetricButton
                label="Pacientes desligados" sign="neg" tone="red"
                qtd={resultado.resumo.pacientesDesligados} sessoes={resultado.resumo.sessoesDesligados}
                active={filtroCategoria === "desligados"} onClick={() => toggleFiltro("desligados")}
              />
            </GroupCard>
            <button
              type="button"
              onClick={() => toggleFiltro("semAlteracao")}
              aria-pressed={filtroCategoria === "semAlteracao"}
              title="Filtrar Por Paciente: Sem alteração"
              className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center shadow-sm transition-colors
                ${filtroCategoria === "semAlteracao" ? `${TONE_SOFT.slate.bg} border-slate-300 dark:border-slate-700` : "border-border bg-card hover:bg-muted/40"}`}
            >
              {filtroCategoria === "semAlteracao" && <span className="pointer-events-none absolute inset-1.5 rounded-xl ring-2 ring-slate-400" />}
              {filtroCategoria === "semAlteracao" && <Filter size={11} className={TONE_SOFT.slate.text} />}
              <Minus size={16} className="text-muted-foreground" />
              <div className="text-2xl font-black text-foreground">{resultado.resumo.pacientesSemAlteracao}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sem alteração</div>
            </button>
          </div>

          <FilterBar
            paciente={filtroPaciente} onPaciente={setFiltroPaciente}
            convenios={filtroConvenios} onConvenios={setFiltroConvenios} convenioOptions={convenioOptions}
            unidades={filtroUnidades} onUnidades={setFiltroUnidades} unidadeOptions={unidadeOptions}
            p1Min={filtroP1Min} onP1Min={setFiltroP1Min}
            p2Min={filtroP2Min} onP2Min={setFiltroP2Min}
            diferencaMin={filtroDiferencaMin} onDiferencaMin={setFiltroDiferencaMin}
            diferencaMax={filtroDiferencaMax} onDiferencaMax={setFiltroDiferencaMax}
            ativo={filtrosAtivos} onLimpar={limparFiltros}
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Building2 size={15} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Por Unidade</span>
              <span className="text-xs text-muted-foreground">({porUnidadeFiltrado.length})</span>
              <span className="text-[11px] font-normal text-muted-foreground">clique numa unidade pra ver o detalhe por paciente</span>
              <BotaoLimparOrdenacao criterios={sortUnidade} onClear={() => setSortUnidade([])} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortableTh label="Unidade" sortKey="unidade" criterios={sortUnidade} onClick={onSortUnidade} />
                    <SortableTh label={labelP1} sortKey="p1" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label={labelP2} sortKey="p2" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Sessões Aumentadas" sortKey="sessoesAumentadas" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Pacientes com Aumento" sortKey="pacientesComAumento" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Sessões Reduzidas" sortKey="sessoesReduzidas" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Pacientes com Redução" sortKey="pacientesComReducao" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Diferença de Sessões" sortKey="diferenca" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Variação %" sortKey="variacaoPct" criterios={sortUnidade} align="right" onClick={onSortUnidade} />
                  </tr>
                </thead>
                <tbody>
                  {porUnidadeFiltrado.length === 0 && (
                    <tr><td colSpan={9} className="py-4 text-center text-muted-foreground">Nenhuma unidade bate com os filtros.</td></tr>
                  )}
                  {porUnidadeFiltrado.map(u => {
                    const aberta = unidadeExpandida === u.unidade
                    return (
                      <Fragment key={u.unidade}>
                        <tr
                          className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                          onClick={() => setUnidadeExpandida(prev => prev === u.unidade ? null : u.unidade)}
                        >
                          <td className="py-1.5 pr-2 font-medium text-foreground">
                            <span className="inline-flex items-center gap-1">
                              {aberta ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                              {u.unidade}
                              <span className="font-normal text-muted-foreground">({u.qtdPacientes})</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{u.p1}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{u.p2}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{u.sessoesAumentadas > 0 ? `+${u.sessoesAumentadas}` : "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{u.pacientesComAumento > 0 ? u.pacientesComAumento : "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-rose-600 dark:text-rose-400">{u.sessoesReduzidas > 0 ? `-${u.sessoesReduzidas}` : "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{u.pacientesComReducao > 0 ? u.pacientesComReducao : "—"}</td>
                          <td className="py-1.5 px-2 text-right"><DiffBadge v={u.diferenca} /></td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">{fmtPct(u.variacaoPct)}</td>
                        </tr>
                        {aberta && (
                          <tr className="border-b border-border/60 last:border-0 bg-muted/20">
                            <td colSpan={9} className="p-0">
                              <div className="px-4 py-3">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-left text-muted-foreground">
                                      <SortableTh label="Paciente" sortKey="paciente" criterios={sortPacienteUnidade} onClick={onSortPacienteUnidade} />
                                      <SortableTh label="Convênio" sortKey="convenio" criterios={sortPacienteUnidade} onClick={onSortPacienteUnidade} />
                                      <SortableTh label={labelP1} sortKey="p1" criterios={sortPacienteUnidade} align="right" onClick={onSortPacienteUnidade} />
                                      <SortableTh label={labelP2} sortKey="p2" criterios={sortPacienteUnidade} align="right" onClick={onSortPacienteUnidade} />
                                      <SortableTh label="Diferença" sortKey="diferenca" criterios={sortPacienteUnidade} align="right" onClick={onSortPacienteUnidade} />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {porPacienteDaUnidade.length === 0 && (
                                      <tr><td colSpan={5} className="py-2 text-center text-muted-foreground">Sem pacientes nessa unidade.</td></tr>
                                    )}
                                    {porPacienteDaUnidade.map(p => (
                                      <tr key={`${p.idFavorecido ?? "s"}-${p.paciente}`} className="border-t border-border/40">
                                        <td className="py-1 pr-2 font-medium text-foreground">{p.paciente}</td>
                                        <td className="py-1 px-2 text-muted-foreground">{p.convenio || "—"}</td>
                                        <td className="py-1 px-2 text-right tabular-nums">{p.p1}</td>
                                        <td className="py-1 px-2 text-right tabular-nums">{p.p2}</td>
                                        <td className="py-1 pl-2 text-right"><DiffBadge v={p.diferenca} /></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  <tr className="border-t-2 border-border font-bold text-foreground">
                    <td className="py-1.5 pr-2">TOTAL</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{resultado.totalP1}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{resultado.totalP2}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">+{resultado.resumo.sessoesAumentadas}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{resultado.resumo.pacientesAumentaram}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-rose-600 dark:text-rose-400">-{resultado.resumo.sessoesReduzidas}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{resultado.resumo.pacientesReduziram}</td>
                    <td className="py-1.5 px-2 text-right"><DiffBadge v={resultado.diferenca} /></td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{fmtPct(resultado.variacaoPct)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Users size={15} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Por Paciente</span>
              <span className="text-xs text-muted-foreground">
                {filtroCategoria || filtrosAtivos ? `${porPacienteFiltrado.length} de ${porPacienteOrdenado.length}` : `(${porPacienteOrdenado.length})`}
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">clique num paciente pra ver a sessão a sessão</span>
              <BotaoLimparOrdenacao criterios={sortPaciente} onClear={() => setSortPaciente([])} />
              {filtroCategoria && (
                <button
                  type="button"
                  onClick={() => setFiltroCategoria(null)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${TONE_SOLID[FILTRO_TONE[filtroCategoria]].bg} ${TONE_SOLID[FILTRO_TONE[filtroCategoria]].text}`}
                >
                  <Filter size={11} />
                  {FILTRO_LABEL[filtroCategoria]}
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="max-h-[480px] overflow-auto">
              {/* table-fixed + colgroup: sem isso, o navegador recalcula a
                  largura das colunas com base no conteúdo mais largo de TODAS
                  as linhas — abrir "Ver agendamentos" injeta uma linha bem
                  larga (a agenda) e os títulos das colunas colapsadas
                  deslizavam de posição. Largura fixa por coluna evita isso. */}
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[26%]" />
                  <col className="w-[16%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortableTh label="Id" sortKey="idFavorecido" criterios={sortPaciente} onClick={onSortPaciente} />
                    <SortableTh label="Paciente" sortKey="paciente" criterios={sortPaciente} onClick={onSortPaciente} />
                    <SortableTh label="Convênio" sortKey="convenio" criterios={sortPaciente} onClick={onSortPaciente} />
                    <SortableTh label={labelP1} sortKey="p1" criterios={sortPaciente} align="right" onClick={onSortPaciente} />
                    <SortableTh label={labelP2} sortKey="p2" criterios={sortPaciente} align="right" onClick={onSortPaciente} />
                    <SortableTh label="Diferença" sortKey="diferenca" criterios={sortPaciente} align="right" onClick={onSortPaciente} />
                    <th className="py-1.5 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {porPacienteFiltrado.length === 0 && (
                    <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Nenhum paciente nessa categoria.</td></tr>
                  )}
                  {porPacienteFiltrado.map(p => {
                    const chave = chavePaciente(p)
                    const aberta = pacienteExpandido === chave
                    return (
                      <tr key={chave} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                        <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{p.idFavorecido ?? "—"}</td>
                        <td className="truncate py-1.5 px-2 text-foreground">{p.paciente}</td>
                        <td className="truncate py-1.5 px-2 text-muted-foreground">{p.convenio || "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{p.p1}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{p.p2}</td>
                        <td className="py-1.5 pl-2 text-right"><DiffBadge v={p.diferenca} /></td>
                        <td className="py-1.5 pl-2 pr-1 text-right">
                          <button
                            type="button"
                            onClick={() => setPacienteExpandido(chave)}
                            aria-pressed={aberta}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold shadow-sm transition-all
                              ${aberta
                                ? "border-sky-300 bg-sky-100 text-sky-700 ring-2 ring-sky-200 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300 dark:ring-sky-800/50"
                                : "border-border bg-gradient-to-r from-slate-50 to-sky-50 text-foreground hover:border-sky-300/60 hover:shadow-md dark:from-slate-800/60 dark:to-sky-950/30"}`}
                          >
                            <CalendarDays size={12} />
                            Ver agendamentos
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal quase full-screen em vez de linha expansível: a agenda +
              o resumo por especialidade precisam de espaço pra respirar —
              dentro da largura de uma linha de tabela ficava tudo espremido. */}
          <Dialog open={pacienteExpandido !== null} onOpenChange={aberto => !aberto && setPacienteExpandido(null)}>
            <DialogContent className="flex h-[92vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-2xl p-0 sm:max-w-6xl">
              {sessoesPacienteExpandido && (
                <>
                  <DialogHeader className="gap-3 border-b border-border px-6 py-5">
                    <DialogTitle className="text-lg font-bold text-foreground">
                      {sessoesPacienteExpandido.paciente.paciente}
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                        <span>Id {sessoesPacienteExpandido.paciente.idFavorecido ?? "—"}</span>
                        <span>{sessoesPacienteExpandido.paciente.convenio || "Sem convênio"}</span>
                        <span className="flex items-center gap-1.5">
                          {labelP1} <strong className="text-sm font-bold text-foreground">{sessoesPacienteExpandido.paciente.p1}</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {labelP2} <strong className="text-sm font-bold text-foreground">{sessoesPacienteExpandido.paciente.p2}</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                          Diferença <DiffBadge v={sessoesPacienteExpandido.paciente.diferenca} />
                        </span>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="grid gap-5">
                      <AgendaGrid
                        titulo={labelP1} sessoes={sessoesPacienteExpandido.p1}
                        horarios={sessoesPacienteExpandido.horarios} dias={sessoesPacienteExpandido.dias}
                      />
                      <AgendaGrid
                        titulo={labelP2} sessoes={sessoesPacienteExpandido.p2}
                        horarios={sessoesPacienteExpandido.horarios} dias={sessoesPacienteExpandido.dias}
                      />
                    </div>
                    <ResumoPorTerapiaTabela
                      labelP1={labelP1} labelP2={labelP2}
                      resumo={sessoesPacienteExpandido.porTerapia}
                      agrupado={agruparPsicologiaAba} onToggleAgrupado={() => setAgruparPsicologiaAba(prev => !prev)}
                    />
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Resumo geral do turnover — mesmo padrão visual E mesmo
              comportamento de filtro do resumo de pacientes acima: clicar num
              card filtra a tabela "Por Profissional" abaixo. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard tone="slate" icon={<UsersRound size={15} />} label={labelP1}>
              <div className="text-2xl font-black text-foreground">{resumoTurnover.totalP1}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">vínculos profissional × terapia</div>
            </StatCard>
            <StatCard tone="blue" icon={<UsersRound size={15} />} label={labelP2}>
              <div className="text-2xl font-black text-foreground">{resumoTurnover.totalP2}</div>
            </StatCard>
            <StatCard tone={resumoTurnover.diferenca > 0 ? "green" : resumoTurnover.diferenca < 0 ? "red" : "slate"} icon={<ArrowRightLeft size={15} />} label="Diferença">
              <div className="text-2xl font-black text-foreground">{resumoTurnover.diferenca > 0 ? "+" : ""}{resumoTurnover.diferenca}</div>
            </StatCard>
            <StatCard tone={resumoTurnover.diferenca > 0 ? "green" : resumoTurnover.diferenca < 0 ? "red" : "slate"} icon={<TrendingUp size={15} />} label="Variação %">
              <div className="text-2xl font-black text-foreground">{fmtPct(resumoTurnover.variacaoPct)}</div>
            </StatCard>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
            <GroupCard
              tone="green" icon={<TrendingUp size={14} />} title="Ganhos de profissionais" sign="pos"
              totalQtd={resumoTurnover.profissionaisAumentaram + resumoTurnover.profissionaisNovosCaptados}
              totalSessoes={resumoTurnover.sessoesAumentadas + resumoTurnover.sessoesNovosCaptados}
              totalAtivo={filtroCategoriaTurnover === "ganhos"} onTotalClick={() => toggleFiltroTurnover("ganhos")}
            >
              <MetricButton
                label="Profissionais com aumento" sign="pos" tone="green" unidade="profissionais"
                qtd={resumoTurnover.profissionaisAumentaram} sessoes={resumoTurnover.sessoesAumentadas}
                active={filtroCategoriaTurnover === "aumento"} onClick={() => toggleFiltroTurnover("aumento")}
                titulo="Filtrar Por Profissional: Profissionais com aumento"
              />
              <MetricButton
                label="Novos profissionais captados" sign="pos" tone="green" unidade="profissionais"
                qtd={resumoTurnover.profissionaisNovosCaptados} sessoes={resumoTurnover.sessoesNovosCaptados}
                active={filtroCategoriaTurnover === "novos"} onClick={() => toggleFiltroTurnover("novos")}
                titulo="Filtrar Por Profissional: Novos profissionais captados"
              />
            </GroupCard>
            <GroupCard
              tone="red" icon={<TrendingDown size={14} />} title="Perdas de profissionais" sign="neg"
              totalQtd={resumoTurnover.profissionaisReduziram + resumoTurnover.profissionaisDesligados}
              totalSessoes={resumoTurnover.sessoesReduzidas + resumoTurnover.sessoesDesligados}
              totalAtivo={filtroCategoriaTurnover === "perdas"} onTotalClick={() => toggleFiltroTurnover("perdas")}
            >
              <MetricButton
                label="Profissionais com redução" sign="neg" tone="red" unidade="profissionais"
                qtd={resumoTurnover.profissionaisReduziram} sessoes={resumoTurnover.sessoesReduzidas}
                active={filtroCategoriaTurnover === "reducao"} onClick={() => toggleFiltroTurnover("reducao")}
                titulo="Filtrar Por Profissional: Profissionais com redução"
              />
              <MetricButton
                label="Profissionais que saíram" sign="neg" tone="red" unidade="profissionais"
                qtd={resumoTurnover.profissionaisDesligados} sessoes={resumoTurnover.sessoesDesligados}
                active={filtroCategoriaTurnover === "desligados"} onClick={() => toggleFiltroTurnover("desligados")}
                titulo="Filtrar Por Profissional: Profissionais que saíram"
              />
            </GroupCard>
            <button
              type="button"
              onClick={() => toggleFiltroTurnover("semAlteracao")}
              aria-pressed={filtroCategoriaTurnover === "semAlteracao"}
              title="Filtrar Por Profissional: Sem alteração"
              className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center shadow-sm transition-colors
                ${filtroCategoriaTurnover === "semAlteracao" ? `${TONE_SOFT.slate.bg} border-slate-300 dark:border-slate-700` : "border-border bg-card hover:bg-muted/40"}`}
            >
              {filtroCategoriaTurnover === "semAlteracao" && <span className="pointer-events-none absolute inset-1.5 rounded-xl ring-2 ring-slate-400" />}
              {filtroCategoriaTurnover === "semAlteracao" && <Filter size={11} className={TONE_SOFT.slate.text} />}
              <Minus size={16} className="text-muted-foreground" />
              <div className="text-2xl font-black text-foreground">{resumoTurnover.profissionaisSemAlteracao}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sem alteração</div>
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <UsersRound size={15} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Por Profissional</span>
              <span className="text-xs text-muted-foreground">
                {filtroCategoriaTurnover ? `${linhasProfissionalFiltrado.length} de ${linhasProfissionalTerapia.length}` : `(${linhasProfissionalTerapia.length})`}
              </span>
              <BotaoLimparOrdenacao criterios={sortProfissionalTerapia} onClear={() => setSortProfissionalTerapia([])} />
              {filtroCategoriaTurnover && (
                <button
                  type="button"
                  onClick={() => setFiltroCategoriaTurnover(null)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${TONE_SOLID[FILTRO_TONE[filtroCategoriaTurnover]].bg} ${TONE_SOLID[FILTRO_TONE[filtroCategoriaTurnover]].text}`}
                >
                  <Filter size={11} />
                  {FILTRO_LABEL_PROFISSIONAL[filtroCategoriaTurnover]}
                  <X size={11} />
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto">
              {/* table-fixed + colgroup: sem isso, o navegador recalcula a
                  largura das colunas a cada filtro (conteúdo mais curto = colunas
                  deslizando de posição). Largura fixa por coluna evita isso. */}
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-52" />
                  <col />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col className="w-24" />
                </colgroup>
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortableTh label="Profissional" sortKey="profissional" criterios={sortProfissionalTerapia} onClick={onSortProfissionalTerapia} />
                    <SortableTh label="Terapia" sortKey="terapia" criterios={sortProfissionalTerapia} onClick={onSortProfissionalTerapia} />
                    <SortableTh label={labelP1} sortKey="p1" criterios={sortProfissionalTerapia} align="right" onClick={onSortProfissionalTerapia} />
                    <SortableTh label={labelP2} sortKey="p2" criterios={sortProfissionalTerapia} align="right" onClick={onSortProfissionalTerapia} />
                    <SortableTh label="Diferença" sortKey="diferenca" criterios={sortProfissionalTerapia} align="right" onClick={onSortProfissionalTerapia} />
                  </tr>
                </thead>
                <tbody>
                  {linhasProfissionalFiltrado.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum profissional nessa categoria.</td></tr>
                  )}
                  {linhasProfissionalFiltrado.map(m => (
                    <tr key={`${m.chave}-${m.chaveGrupo}`} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                      <td className="truncate py-1.5 pr-2 text-foreground">{m.profissional}</td>
                      <td className="py-1.5 px-2 text-foreground">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <IconeOuDotTerapia nome={m.terapia} />
                          <span className="truncate">{m.terapia}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{m.p1}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{m.p2}</td>
                      <td className="py-1.5 pl-2 text-right"><DiffBadge v={m.diferenca} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <TurnoverProfissionaisSection
            turnover={turnover}
            agrupado={agruparPsicologiaAbaTurnover} onToggleAgrupado={() => setAgruparPsicologiaAbaTurnover(prev => !prev)}
            expandido={turnoverExpandido} onExpandir={setTurnoverExpandido}
            grupoAtivo={turnoverAtivo}
            sessoesP1={sessoesP1Filtradas} sessoesP2={sessoesP2Filtradas}
            labelP1={labelP1} labelP2={labelP2}
          />
        </>
      )}
    </div>
  )
}

interface AgendaGridProps {
  titulo: string
  sessoes: SessaoComparativo[]
  /** Horários (linhas) e dias (colunas) — os MESMOS pra P1 e P2, calculados a partir da união das sessões dos dois períodos, pra dar pra comparar lado a lado na mesma grade. */
  horarios: string[]
  dias: number[]
}

/** Grade semanal (dia da semana x horário) das sessões de um paciente num período — formato agenda, pra comparar visualmente P1 x P2. Usada no drill-down "Por Paciente". */
function AgendaGrid({ titulo, sessoes, horarios, dias }: AgendaGridProps) {
  const porSlot = useMemo(() => {
    const m = new Map<string, SessaoComparativo[]>()
    for (const s of sessoes) {
      const dia = s.diaSemanaIndice
      if (dia === null) continue
      const key = `${dia}|||${s.hora}`
      const arr = m.get(key) ?? []
      arr.push(s)
      m.set(key, arr)
    }
    return m
  }, [sessoes])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-baseline gap-2 border-b border-border bg-muted/30 px-5 py-3">
        <span className="text-base font-bold uppercase tracking-wide text-foreground">{titulo}</span>
        <span className="text-sm font-medium text-muted-foreground">({sessoes.length} sessões)</span>
      </div>
      <div className="overflow-x-auto">
        {/* table-fixed + colgroup: mesma largura de coluna nos dois grids (mesmo
            "dias"), e célula com 1 linha só (truncate) — sem isso, uma terapia com
            nome mais longo num período quebra linha e desalinha as horas entre
            P1 e P2 (ver texto completo no tooltip). Bordas verticais entre dias
            (divide-x) porque, com poucas colunas ocupando a largura cheia do
            modal, o espaço em branco entre elas parecia vazio demais. */}
        <table className="w-full table-fixed divide-x divide-border/40 text-sm">
          <colgroup>
            <col className="w-16" />
            {dias.map(d => <col key={d} />)}
          </colgroup>
          <thead>
            <tr className="divide-x divide-border/40 text-left text-muted-foreground">
              <th className="py-2.5 pl-4 pr-4 font-semibold">Hora</th>
              {dias.map(d => (
                <th key={d} className="truncate px-3 py-2.5 text-left font-semibold">{DIAS_SEMANA_LABEL[d]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(horarios.length === 0 || dias.length === 0) && (
              <tr><td colSpan={dias.length + 1} className="py-3 pl-4 text-muted-foreground">Sem sessões nesse período.</td></tr>
            )}
            {horarios.map((hora, i) => (
              <tr key={hora} className={`divide-x divide-border/40 border-t border-border/40 ${i % 2 === 1 ? "bg-muted/15" : ""}`}>
                <td className="py-2 pl-4 pr-4 font-medium tabular-nums text-muted-foreground">{hora}</td>
                {dias.map(d => {
                  const celula = porSlot.get(`${d}|||${hora}`)
                  // Uma sessão do Assim Saúde deduplicada guarda as terapias
                  // originais juntas em `terapia` (ver dedupAssimSaude) só pra
                  // não descartar a informação — aqui elas voltam a virar uma
                  // linha por terapia, cada uma com sua própria bolinha de cor.
                  const nomes = celula?.flatMap(s => (s.terapia || "—").split(" + "))
                  const tooltip = celula?.map(s => `${s.terapia || "—"} (Id Terapia: ${s.idTerapia ?? "—"})`).join(" + ")
                  // Faixa vertical na borda direita da célula, na cor da
                  // terapia — reforça a identidade visual além do ícone,
                  // ocupando a altura inteira do slot de 40min.
                  return (
                    <td
                      key={d}
                      className="px-3 py-2 text-left text-foreground"
                      style={nomes ? { boxShadow: `inset -3px 0 0 0 ${corDotComContraste(nomes[0])}` } : undefined}
                      title={tooltip}
                    >
                      {nomes
                        ? nomes.map((nome, i) => (
                            <div key={i} className="flex min-w-0 items-center justify-start gap-2">
                              <IconeOuDotTerapia nome={nome} />
                              <span className="truncate font-medium">{nome}</span>
                            </div>
                          ))
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ResumoPorTerapiaTabelaProps {
  labelP1: string
  labelP2: string
  resumo: ResumoTerapia[]
  agrupado: boolean
  onToggleAgrupado: () => void
}

/**
 * Lista indicativa abaixo da agenda: quantas sessões de cada especialidade o
 * paciente tinha (P1), tem agora (P2) e a diferença. É a resposta pra "o que
 * mudou" — por isso tem peso visual próprio (faixa de destaque no topo) sem
 * cor de identidade própria: cor só entra onde ela significa algo (diferença
 * positiva/negativa nas linhas), nunca como decoração do painel inteiro.
 */
function ResumoPorTerapiaTabela({ labelP1, labelP2, resumo, agrupado, onToggleAgrupado }: ResumoPorTerapiaTabelaProps) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="h-1 w-full bg-gradient-to-r from-foreground/25 to-foreground/5" />
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3.5 pb-2.5">
        <span className="text-base font-bold uppercase tracking-wide text-foreground">Por especialidade</span>
        <button
          type="button"
          onClick={onToggleAgrupado}
          aria-pressed={agrupado}
          title={`Ids Terapia: ${[...IDS_PSICOLOGIA_ABA].join(", ")}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors
            ${agrupado
              ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              : "border-border bg-card text-muted-foreground hover:border-sky-300/60 hover:text-foreground"}`}
        >
          {agrupado ? <CheckCircle2 size={13} /> : <Brain size={13} />}
          Agrupar {ROTULO_PSICOLOGIA_ABA}
        </button>
      </div>
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-28" />
        </colgroup>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pl-5 pr-2 font-semibold">Especialidade</th>
            <th className="py-2 px-1 text-right font-semibold">{labelP1}</th>
            <th className="py-2 px-1 text-right font-semibold">{labelP2}</th>
            <th className="py-2 pl-1 pr-5 text-right font-semibold">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {resumo.length === 0 && (
            <tr><td colSpan={4} className="py-3 pl-5 text-muted-foreground">Sem sessões nesse paciente.</td></tr>
          )}
          {resumo.map(r => (
            <tr
              key={r.terapia}
              className={`border-t border-border/40
                ${r.diferenca > 0 ? "bg-emerald-50/60 dark:bg-emerald-950/20" : r.diferenca < 0 ? "bg-rose-50/60 dark:bg-rose-950/20" : ""}`}
            >
              <td className="py-2 pl-5 pr-2 text-foreground">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <IconeOuDotTerapia nome={r.terapia} />
                  <span className="truncate font-medium">{r.terapia}</span>
                </span>
              </td>
              <td className="py-2 px-1 text-right tabular-nums">{r.p1}</td>
              <td className="py-2 px-1 text-right tabular-nums">{r.p2}</td>
              <td className="py-2 pl-1 pr-5 text-right"><DiffBadge v={r.diferenca} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function somaSessoes(lista: ProfissionalTurnover[]): number {
  return lista.reduce((acc, p) => acc + p.sessoes, 0)
}

/** Horários/dias de uma lista de sessões — mesmo cálculo usado pra alimentar AgendaGrid, reaproveitado aqui pra agenda de um profissional isolado. */
function construirAgendaDe(sessoes: SessaoComparativo[]) {
  const horarios = [...new Set(sessoes.map(s => s.hora))].sort()
  const diasPresentes = new Set(sessoes.map(s => s.diaSemanaIndice).filter((d): d is number => d !== null))
  const dias = ORDEM_DIAS_EXIBICAO.filter(d => diasPresentes.has(d))
  return { horarios, dias }
}

interface TurnoverProfissionaisSectionProps {
  turnover: TurnoverTerapia[]
  agrupado: boolean
  onToggleAgrupado: () => void
  expandido: string | null
  onExpandir: (chave: string | null) => void
  grupoAtivo: TurnoverTerapia | null
  sessoesP1: SessaoComparativo[]
  sessoesP2: SessaoComparativo[]
  labelP1: string
  labelP2: string
}

/**
 * "Quantos profissionais de X existiam no Período 1 e não existem mais no
 * Período 2 (e quantas sessões)?" — por Id Terapia (nunca por nome, que pode
 * ser renomeado, ver calcularTurnoverProfissionais). "Saiu" aqui é por
 * TERAPIA específica: o profissional pode continuar atendendo outra
 * especialidade e ainda contar como saída desta.
 */
function TurnoverProfissionaisSection({
  turnover, agrupado, onToggleAgrupado,
  expandido, onExpandir, grupoAtivo, sessoesP1, sessoesP2, labelP1, labelP2,
}: TurnoverProfissionaisSectionProps) {
  const [profissionalAberto, setProfissionalAberto] = useState<{ chave: string; lado: "saida" | "entrada" } | null>(null)
  const [sortTurnover, setSortTurnover] = useState<SortCriterio[]>([{ key: "terapia", dir: "asc" }])
  function onSortTurnover(key: string) {
    setSortTurnover(prev => cicloOrdenacao(prev, key))
  }
  const turnoverOrdenado = useMemo(
    () => ordenarPorMulti(
      turnover.map(t => ({
        ...t,
        saidaQtd: t.saida.length,
        saidaSessoes: somaSessoes(t.saida),
        entradaQtd: t.entrada.length,
        entradaSessoes: somaSessoes(t.entrada),
        // Continuaram atendendo essa terapia nos dois períodos — explica por
        // que "Entraram" pode ser 0 mesmo com profissionais ativos em P2: eles
        // já vinham de P1, só não são NOVOS nessa terapia.
        permaneceram: t.movimento.filter(m => m.p1 > 0 && m.p2 > 0).length,
      })),
      sortTurnover,
    ),
    [turnover, sortTurnover],
  )

  function fecharDialog() {
    onExpandir(null)
    setProfissionalAberto(null)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <UsersRound size={15} className="text-muted-foreground" />
        <span className="text-sm font-bold text-foreground">Rotatividade de Profissionais por Terapia</span>
        <span className="text-xs text-muted-foreground">({turnover.length})</span>
        <span className="text-[11px] font-normal text-muted-foreground">quem atendia e não atende mais (e vice-versa), por especialidade</span>
        <BotaoLimparOrdenacao criterios={sortTurnover} onClear={() => setSortTurnover([])} />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAgrupado}
            aria-pressed={agrupado}
            title={`Ids Terapia: ${[...IDS_PSICOLOGIA_ABA].join(", ")}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors
              ${agrupado
                ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                : "border-border bg-card text-muted-foreground hover:border-sky-300/60 hover:text-foreground"}`}
          >
            {agrupado ? <CheckCircle2 size={12} /> : <Brain size={12} />}
            Agrupar {ROTULO_PSICOLOGIA_ABA}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-xs">
          <colgroup>
            <col />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-32" />
            <col className="w-36" />
            <col className="w-32" />
            <col className="w-36" />
            <col className="w-28" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh label="Terapia" sortKey="terapia" criterios={sortTurnover} onClick={onSortTurnover} />
              <SortableTh label="Prof. Período 1" sortKey="profissionaisP1" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <SortableTh label="Prof. Período 2" sortKey="profissionaisP2" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <SortableTh label="Permaneceram" sortKey="permaneceram" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <SortableTh label="Saíram Prof." sortKey="saidaQtd" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <SortableTh label="Redução Sessões" sortKey="saidaSessoes" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <SortableTh label="Entraram Prof." sortKey="entradaQtd" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <SortableTh label="Aumento Sessões" sortKey="entradaSessoes" criterios={sortTurnover} align="right" onClick={onSortTurnover} />
              <th className="py-1.5 pl-2" />
            </tr>
          </thead>
          <tbody>
            {turnover.length === 0 && (
              <tr><td colSpan={9} className="py-4 text-center text-muted-foreground">Nenhuma terapia encontrada.</td></tr>
            )}
            {turnoverOrdenado.map(t => {
              const temMovimento = t.saida.length > 0 || t.entrada.length > 0
              return (
                <tr key={t.chave} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 pr-2 text-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <IconeOuDotTerapia nome={t.terapia} />
                      <span className="truncate font-medium">{t.terapia}</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{t.profissionaisP1}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{t.profissionaisP2}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{t.permaneceram}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {t.saida.length > 0
                      ? <span className="font-bold text-rose-600 dark:text-rose-400">{t.saida.length}</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                    {t.saida.length > 0 ? somaSessoes(t.saida) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {t.entrada.length > 0
                      ? <span className="font-bold text-emerald-600 dark:text-emerald-400">{t.entrada.length}</span>
                      : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                    {t.entrada.length > 0 ? somaSessoes(t.entrada) : "—"}
                  </td>
                  <td className="py-1.5 pl-2 text-right">
                    {temMovimento && (
                      <button
                        type="button"
                        onClick={() => onExpandir(t.chave)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-sky-300/60 hover:text-foreground"
                      >
                        Ver detalhes
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={expandido !== null} onOpenChange={aberto => !aberto && fecharDialog()}>
        <DialogContent className="flex h-[96vh] w-[98vw] max-w-[1800px] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[1800px]">
          {grupoAtivo && (
            <>
              <DialogHeader className="border-b border-border px-6 py-4">
                <DialogTitle className="text-lg font-bold text-foreground">{grupoAtivo.terapia}</DialogTitle>
                <DialogDescription>
                  {labelP1}: {grupoAtivo.profissionaisP1} profissionais · {labelP2}: {grupoAtivo.profissionaisP2} profissionais
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="grid gap-6 lg:grid-cols-2">
                  <ListaProfissionaisTurnover
                    titulo="Saíram" icone={UserMinus} tom="rose" lado="saida"
                    lista={grupoAtivo.saida}
                    aberto={profissionalAberto} onAbrir={setProfissionalAberto}
                  />
                  <ListaProfissionaisTurnover
                    titulo="Entraram" icone={UserPlus} tom="emerald" lado="entrada"
                    lista={grupoAtivo.entrada}
                    aberto={profissionalAberto} onAbrir={setProfissionalAberto}
                  />
                </div>

                {/* Agenda do profissional aberto — fora da grade Saíram/Entraram,
                    ocupando a largura toda do modal (dentro da coluna de metade
                    ficava espremida, com ícone e texto se sobrepondo). */}
                {profissionalAberto && (() => {
                  const lista = profissionalAberto.lado === "saida" ? grupoAtivo.saida : grupoAtivo.entrada
                  const p = lista.find(x => x.chave === profissionalAberto.chave)
                  if (!p) return null
                  const sessoesOrigem = profissionalAberto.lado === "saida" ? sessoesP1 : sessoesP2
                  const labelPeriodo = profissionalAberto.lado === "saida" ? labelP1 : labelP2
                  const sessoesProf = sessoesDoProfissionalNoGrupo(sessoesOrigem, p, grupoAtivo.chave, agrupado)
                  const { horarios, dias } = construirAgendaDe(sessoesProf)
                  return (
                    <div className="mt-6 border-t border-border pt-5">
                      <div className="mb-3 text-sm font-bold text-foreground">{p.profissional}</div>
                      <AgendaGrid titulo={labelPeriodo} sessoes={sessoesProf} horarios={horarios} dias={dias} />
                    </div>
                  )
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ListaProfissionaisTurnoverProps {
  titulo: string
  icone: LucideIcon
  tom: "rose" | "emerald"
  lado: "saida" | "entrada"
  lista: ProfissionalTurnover[]
  aberto: { chave: string; lado: "saida" | "entrada" } | null
  onAbrir: (v: { chave: string; lado: "saida" | "entrada" } | null) => void
}

/** Lista de profissionais (saíram OU entraram) dentro do modal de detalhe do turnover — cada um seleciona pra ver a própria agenda (renderizada fora daqui, em largura cheia — ver TurnoverProfissionaisSection). */
function ListaProfissionaisTurnover({ titulo, icone: Icone, tom, lado, lista, aberto, onAbrir }: ListaProfissionaisTurnoverProps) {
  const cor = tom === "rose"
    ? "text-rose-600 dark:text-rose-400"
    : "text-emerald-600 dark:text-emerald-400"

  return (
    <div>
      <div className={`mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${cor}`}>
        <Icone size={15} />
        {titulo} <span className="font-normal text-muted-foreground">({lista.length})</span>
      </div>
      {lista.length === 0 && <div className="text-xs text-muted-foreground">Nenhum profissional.</div>}
      <div className="flex flex-col gap-2">
        {lista.map(p => {
          const estaAberto = aberto?.chave === p.chave && aberto.lado === lado
          return (
            <button
              key={p.chave}
              type="button"
              onClick={() => onAbrir(estaAberto ? null : { chave: p.chave, lado })}
              aria-pressed={estaAberto}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors
                ${estaAberto ? "border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30" : "border-border hover:bg-muted/40"}`}
            >
              <span className="truncate text-sm font-medium text-foreground">{p.profissional}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {p.sessoes} sessões
                {estaAberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
