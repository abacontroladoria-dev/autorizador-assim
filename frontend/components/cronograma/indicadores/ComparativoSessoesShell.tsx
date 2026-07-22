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
  DatabaseZap, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight,
} from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { getRefWeek } from "@/lib/cronograma/helpers"
import {
  normalizarLinhasUpload, normalizarLinhasApi, calcularComparativo, calcularPorPacienteDaUnidade,
  type SessaoComparativo, type ComparativoResultado, type UnidadeComparativo, type PacienteComparativo,
} from "@/lib/cronograma/comparativoSessoes"
import { buscarGradeComparativo } from "@/lib/cronograma/gradeService"

type SortDir = "asc" | "desc"

function compararValores(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "pt-BR")
  const an = typeof a === "number" ? a : -Infinity
  const bn = typeof b === "number" ? b : -Infinity
  return an - bn
}

function ordenarPor<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  const sorted = [...rows].sort((a, b) => compararValores(a[key], b[key]))
  return dir === "asc" ? sorted : sorted.reverse()
}

interface SortableThProps {
  label: string
  sortKey: string
  activeKey: string
  dir: SortDir
  align?: "left" | "right"
  onClick: (key: string) => void
}

function SortableTh({ label, sortKey, activeKey, dir, align = "left", onClick }: SortableThProps) {
  const active = sortKey === activeKey
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown
  return (
    <th
      className={`py-1.5 ${align === "right" ? "px-2 text-right" : "pr-2"} font-semibold cursor-pointer select-none hover:text-foreground transition-colors`}
      onClick={() => onClick(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
        {label}
        <Icon size={12} className={active ? "text-foreground" : "opacity-40"} />
      </span>
    </th>
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
      className={`relative inline-flex w-auto max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors select-none
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
          <CheckCircle2 size={13} className="shrink-0 text-green-500" />
          <span className="max-w-[160px] truncate font-semibold text-green-700 dark:text-green-400">{fileName ?? label}</span>
          <span className="shrink-0 text-green-600 dark:text-green-500">({count})</span>
          <button
            onClick={e => { e.stopPropagation(); onClear() }}
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover"
          >
            <X size={12} />
          </button>
        </>
      ) : loading ? (
        <span className="text-primary animate-pulse">Processando...</span>
      ) : error ? (
        <>
          <Upload size={13} className="shrink-0 text-muted-foreground" />
          <span className="text-destructive">{error}</span>
        </>
      ) : (
        <>
          <Upload size={13} className="shrink-0 text-muted-foreground" />
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
  const resultado: ComparativoResultado | null = pronto ? calcularComparativo(sessoesP1, sessoesP2) : null

  const [sortUnidade, setSortUnidade] = useState<{ key: keyof UnidadeComparativo; dir: SortDir }>({ key: "unidade", dir: "asc" })
  const [sortPaciente, setSortPaciente] = useState<{ key: keyof PacienteComparativo; dir: SortDir }>({ key: "paciente", dir: "asc" })

  const porUnidadeOrdenado = useMemo(
    () => resultado ? ordenarPor(resultado.porUnidade, sortUnidade.key, sortUnidade.dir) : [],
    [resultado, sortUnidade],
  )
  const porPacienteOrdenado = useMemo(
    () => resultado ? ordenarPor(resultado.porPaciente, sortPaciente.key, sortPaciente.dir) : [],
    [resultado, sortPaciente],
  )

  function onSortUnidade(key: string) {
    setSortUnidade(prev => ({
      key: key as keyof UnidadeComparativo,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }))
  }
  function onSortPaciente(key: string) {
    setSortPaciente(prev => ({
      key: key as keyof PacienteComparativo,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }))
  }

  // Drill-down: clicar numa unidade mostra por paciente só as sessões dela —
  // explica por que o total líquido da unidade pode esconder pacientes que
  // aumentaram bem mais e outros que reduziram na mesma unidade.
  const [unidadeExpandida, setUnidadeExpandida] = useState<string | null>(null)
  const [sortPacienteUnidade, setSortPacienteUnidade] = useState<{ key: keyof PacienteComparativo; dir: SortDir }>({ key: "paciente", dir: "asc" })
  function onSortPacienteUnidade(key: string) {
    setSortPacienteUnidade(prev => ({
      key: key as keyof PacienteComparativo,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }))
  }
  const porPacienteDaUnidade = useMemo(() => {
    if (!unidadeExpandida) return []
    const rows = calcularPorPacienteDaUnidade(sessoesP1, sessoesP2, unidadeExpandida)
    return ordenarPor(rows, sortPacienteUnidade.key, sortPacienteUnidade.dir)
  }, [sessoesP1, sessoesP2, unidadeExpandida, sortPacienteUnidade])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Período 1</span>
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

        <div className="flex items-center gap-1.5">
          <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Período 2</span>
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]
                ${loadingApiP2 ? "border-border bg-card" : errorApiP2 ? "border-rose-300 bg-rose-50 dark:bg-rose-950/20" : "border-green-400 bg-green-50 dark:bg-green-950/20"}`}
            >
              {loadingApiP2 ? (
                <>
                  <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
                  <span className="text-foreground">Carregando grade...</span>
                </>
              ) : errorApiP2 ? (
                <>
                  <AlertTriangle size={12} className="shrink-0 text-rose-500" />
                  <span className="text-rose-700 dark:text-rose-400">{errorApiP2}</span>
                </>
              ) : (
                <>
                  <DatabaseZap size={12} className="shrink-0 text-green-500" />
                  <span className="font-semibold text-green-700 dark:text-green-400">Grade · {sessoesApiP2.length} horários</span>
                  <span className="text-green-600 dark:text-green-500">· {refWeek.label}</span>
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
            </StatCard>
            <StatCard tone="blue" icon={<Users size={15} />} label={labelP2}>
              <div className="text-2xl font-black text-foreground">{resultado.totalP2}</div>
            </StatCard>
            <StatCard tone={resultado.diferenca > 0 ? "green" : resultado.diferenca < 0 ? "red" : "slate"} icon={<ArrowRightLeft size={15} />} label="Diferença">
              <div className="text-2xl font-black text-foreground">{resultado.diferenca > 0 ? "+" : ""}{resultado.diferenca}</div>
            </StatCard>
            <StatCard tone={resultado.diferenca > 0 ? "green" : resultado.diferenca < 0 ? "red" : "slate"} icon={<TrendingUp size={15} />} label="Variação %">
              <div className="text-2xl font-black text-foreground">{fmtPct(resultado.variacaoPct)}</div>
            </StatCard>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StatCard tone="green" icon={<TrendingUp size={15} />} label="Pacientes com aumento">
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-2xl font-black text-foreground">{resultado.resumo.pacientesAumentaram}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">pacientes</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">+{resultado.resumo.sessoesAumentadas}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">sessões</div>
                </div>
              </div>
            </StatCard>
            <StatCard tone="red" icon={<TrendingDown size={15} />} label="Pacientes com redução">
              <div className="flex items-baseline gap-4">
                <div>
                  <div className="text-2xl font-black text-foreground">{resultado.resumo.pacientesReduziram}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">pacientes</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-rose-600 dark:text-rose-400">-{resultado.resumo.sessoesReduzidas}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">sessões</div>
                </div>
              </div>
            </StatCard>
            <StatCard tone="slate" icon={<Minus size={15} />} label="Sem alteração">
              <div className="text-2xl font-black text-foreground">{resultado.resumo.pacientesSemAlteracao}</div>
            </StatCard>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Building2 size={15} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Por Unidade</span>
              <span className="text-[11px] font-normal text-muted-foreground">clique numa unidade pra ver o detalhe por paciente</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortableTh label="Unidade" sortKey="unidade" activeKey={sortUnidade.key} dir={sortUnidade.dir} onClick={onSortUnidade} />
                    <SortableTh label={labelP1} sortKey="p1" activeKey={sortUnidade.key} dir={sortUnidade.dir} align="right" onClick={onSortUnidade} />
                    <SortableTh label={labelP2} sortKey="p2" activeKey={sortUnidade.key} dir={sortUnidade.dir} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Diferença" sortKey="diferenca" activeKey={sortUnidade.key} dir={sortUnidade.dir} align="right" onClick={onSortUnidade} />
                    <SortableTh label="Variação %" sortKey="variacaoPct" activeKey={sortUnidade.key} dir={sortUnidade.dir} align="right" onClick={onSortUnidade} />
                  </tr>
                </thead>
                <tbody>
                  {porUnidadeOrdenado.map(u => {
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
                          <td className="py-1.5 px-2 text-right"><DiffBadge v={u.diferenca} /></td>
                          <td className="py-1.5 pl-2 text-right tabular-nums">{fmtPct(u.variacaoPct)}</td>
                        </tr>
                        {aberta && (
                          <tr className="border-b border-border/60 last:border-0 bg-muted/20">
                            <td colSpan={5} className="p-0">
                              <div className="px-4 py-3">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="text-left text-muted-foreground">
                                      <SortableTh label="Paciente" sortKey="paciente" activeKey={sortPacienteUnidade.key} dir={sortPacienteUnidade.dir} onClick={onSortPacienteUnidade} />
                                      <SortableTh label="Convênio" sortKey="convenio" activeKey={sortPacienteUnidade.key} dir={sortPacienteUnidade.dir} onClick={onSortPacienteUnidade} />
                                      <SortableTh label={labelP1} sortKey="p1" activeKey={sortPacienteUnidade.key} dir={sortPacienteUnidade.dir} align="right" onClick={onSortPacienteUnidade} />
                                      <SortableTh label={labelP2} sortKey="p2" activeKey={sortPacienteUnidade.key} dir={sortPacienteUnidade.dir} align="right" onClick={onSortPacienteUnidade} />
                                      <SortableTh label="Diferença" sortKey="diferenca" activeKey={sortPacienteUnidade.key} dir={sortPacienteUnidade.dir} align="right" onClick={onSortPacienteUnidade} />
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
                    <td className="py-1.5 px-2 text-right"><DiffBadge v={resultado.diferenca} /></td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{fmtPct(resultado.variacaoPct)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users size={15} className="text-muted-foreground" />
              <span className="text-sm font-bold text-foreground">Por Paciente</span>
              <span className="text-xs text-muted-foreground">({resultado.porPaciente.length})</span>
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <SortableTh label="Id" sortKey="idFavorecido" activeKey={sortPaciente.key} dir={sortPaciente.dir} onClick={onSortPaciente} />
                    <SortableTh label="Paciente" sortKey="paciente" activeKey={sortPaciente.key} dir={sortPaciente.dir} onClick={onSortPaciente} />
                    <SortableTh label="Convênio" sortKey="convenio" activeKey={sortPaciente.key} dir={sortPaciente.dir} onClick={onSortPaciente} />
                    <SortableTh label={labelP1} sortKey="p1" activeKey={sortPaciente.key} dir={sortPaciente.dir} align="right" onClick={onSortPaciente} />
                    <SortableTh label={labelP2} sortKey="p2" activeKey={sortPaciente.key} dir={sortPaciente.dir} align="right" onClick={onSortPaciente} />
                    <SortableTh label="Diferença" sortKey="diferenca" activeKey={sortPaciente.key} dir={sortPaciente.dir} align="right" onClick={onSortPaciente} />
                  </tr>
                </thead>
                <tbody>
                  {porPacienteOrdenado.map(p => (
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
