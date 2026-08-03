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
  DatabaseZap, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, Filter, Search, SlidersHorizontal,
} from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { TONE_SOFT, TONE_SOLID, TONE_ACCENT, type Tone } from "@/components/cronograma/ui/tones"
import { getRefWeek } from "@/lib/cronograma/helpers"
import {
  normalizarLinhasUpload, normalizarLinhasApi, calcularComparativo, calcularPorPacienteDaUnidade, classificarMovimento, rangeDatas,
  filtrarSessoesPorTexto, passaFiltroNumerico,
  type SessaoComparativo, type ComparativoResultado, type UnidadeComparativo, type PacienteComparativo, type CategoriaMovimento,
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
const RING_TONE: Record<Tone, string> = {
  green: "ring-emerald-400", red: "ring-rose-400", slate: "ring-slate-400",
  blue: "ring-sky-400", amber: "ring-amber-400", purple: "ring-violet-400",
}

interface MetricButtonProps {
  label: string
  qtd: number
  sessoes: number
  sign: "pos" | "neg"
  tone: Tone
  active: boolean
  onClick: () => void
}

/** Metade clicável de um GroupCard — mostra pacientes + sessões e funciona como filtro toggle da tabela "Por Paciente". */
function MetricButton({ label, qtd, sessoes, sign, tone, active, onClick }: MetricButtonProps) {
  const soft = TONE_SOFT[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Filtrar Por Paciente: ${label}`}
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
          <div className="text-[10px] text-muted-foreground">pacientes</div>
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
}

/** Card que agrupa duas métricas relacionadas (ex.: Ganhos = Aumento + Novos captados) + o total do grupo, sob um mesmo título/tom. */
function GroupCard({ tone, icon, title, totalQtd, totalSessoes, totalAtivo, onTotalClick, sign, children }: GroupCardProps) {
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
          label="Total" sign={sign} tone={tone}
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

interface SortableThProps {
  label: string
  sortKey: string
  criterios: SortCriterio[]
  align?: "left" | "right"
  onClick: (key: string) => void
}

function SortableTh({ label, sortKey, criterios, align = "left", onClick }: SortableThProps) {
  const idx = criterios.findIndex(c => c.key === sortKey)
  const active = idx !== -1
  const dir = active ? criterios[idx].dir : undefined
  const prioridade = active && criterios.length > 1 ? idx + 1 : null
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown
  return (
    <th
      className={`py-1.5 ${align === "right" ? "px-2 text-right" : "pr-2"} font-semibold cursor-pointer select-none hover:text-foreground transition-colors`}
      onClick={() => onClick(sortKey)}
      title={active ? "Clique: inverte / clique 3x: remove este critério" : "Clique pra ordenar (acumula com os demais critérios)"}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
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
function ConvenioDropdown({ options, selecionados, onChange }: { options: string[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  function toggle(c: string) {
    onChange(selecionados.includes(c) ? selecionados.filter(x => x !== c) : [...selecionados, c])
  }
  return (
    <details className="relative">
      <summary
        className={`flex w-40 cursor-pointer list-none items-center justify-between gap-1 rounded-md border px-2 py-1 text-[11px] outline-none
          ${selecionados.length > 0 ? "border-primary/50 text-foreground" : "border-border text-muted-foreground"}`}
      >
        <span className="truncate">{selecionados.length > 0 ? `Convênio (${selecionados.length})` : "Convênio"}</span>
        <ChevronDown size={12} className="shrink-0" />
      </summary>
      <div className="absolute z-10 mt-1 max-h-56 w-52 overflow-auto rounded-md border border-border bg-card p-1 shadow-md">
        {options.length === 0 && <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Nenhum convênio carregado.</div>}
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
  paciente, onPaciente, convenios, onConvenios, convenioOptions,
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

      <ConvenioDropdown options={convenioOptions} selecionados={convenios} onChange={onConvenios} />

      <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />

      <NumberFilterInput label="Período 1 ≥" value={p1Min} onChange={onP1Min} />
      <NumberFilterInput label="Período 2 ≥" value={p2Min} onChange={onP2Min} />
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Diferença
        <NumberFilterInput label="entre" value={diferencaMin} onChange={onDiferencaMin} />
        <NumberFilterInput label="e" value={diferencaMax} onChange={onDiferencaMax} />
      </span>

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
  const [filtroP1Min, setFiltroP1Min] = useState<number | null>(null)
  const [filtroP2Min, setFiltroP2Min] = useState<number | null>(null)
  const [filtroDiferencaMin, setFiltroDiferencaMin] = useState<number | null>(null)
  const [filtroDiferencaMax, setFiltroDiferencaMax] = useState<number | null>(null)
  const filtrosTextoAtivos = filtroPaciente.trim() !== "" || filtroConvenios.length > 0
  const filtrosAtivos = filtrosTextoAtivos || filtroP1Min !== null || filtroP2Min !== null || filtroDiferencaMin !== null || filtroDiferencaMax !== null
  function limparFiltros() {
    setFiltroPaciente(""); setFiltroConvenios([]); setFiltroP1Min(null); setFiltroP2Min(null); setFiltroDiferencaMin(null); setFiltroDiferencaMax(null)
  }

  const convenioOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of [...sessoesP1, ...sessoesP2]) if (s.convenio) set.add(s.convenio)
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [sessoesP1, sessoesP2])

  const sessoesP1Filtradas = useMemo(
    () => filtrarSessoesPorTexto(sessoesP1, filtroPaciente, filtroConvenios),
    [sessoesP1, filtroPaciente, filtroConvenios],
  )
  const sessoesP2Filtradas = useMemo(
    () => filtrarSessoesPorTexto(sessoesP2, filtroPaciente, filtroConvenios),
    [sessoesP2, filtroPaciente, filtroConvenios],
  )
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
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortableTh label="Id" sortKey="idFavorecido" criterios={sortPaciente} onClick={onSortPaciente} />
                    <SortableTh label="Paciente" sortKey="paciente" criterios={sortPaciente} onClick={onSortPaciente} />
                    <SortableTh label="Convênio" sortKey="convenio" criterios={sortPaciente} onClick={onSortPaciente} />
                    <SortableTh label={labelP1} sortKey="p1" criterios={sortPaciente} align="right" onClick={onSortPaciente} />
                    <SortableTh label={labelP2} sortKey="p2" criterios={sortPaciente} align="right" onClick={onSortPaciente} />
                    <SortableTh label="Diferença" sortKey="diferenca" criterios={sortPaciente} align="right" onClick={onSortPaciente} />
                  </tr>
                </thead>
                <tbody>
                  {porPacienteFiltrado.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Nenhum paciente nessa categoria.</td></tr>
                  )}
                  {porPacienteFiltrado.map(p => (
                    <tr key={`${p.idFavorecido ?? "s"}-${p.paciente}`} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{p.idFavorecido ?? "—"}</td>
                      <td className="py-1.5 px-2 text-foreground">{p.paciente}</td>
                      <td className="py-1.5 px-2 text-muted-foreground">{p.convenio || "—"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{p.p1}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{p.p2}</td>
                      <td className="py-1.5 pl-2 text-right"><DiffBadge v={p.diferenca} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
