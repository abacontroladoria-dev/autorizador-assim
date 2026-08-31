"use client"

import { useRef, useState } from "react"
import Papa from "papaparse"
import * as XLSX from "xlsx"
import { Upload, CheckCircle2, X, FolderInput, DatabaseZap } from "lucide-react"
import { pm, exU, getRefWeek } from "@/lib/cronograma/helpers"
import { parseHistoricoXlsx } from "@/lib/cronograma/xlsx"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import type { CsvRow, LaudoRow, DispRow, RecItem, InvItem, WaMap } from "@/types/cronograma"

interface Props {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  dispRows: DispRow[]
  onCRows: (rows: CsvRow[]) => void
  onLRows: (rows: LaudoRow[]) => void
  onDispRows: (rows: DispRow[]) => void
  onImport: (data: { rec: RecItem[]; inv: InvItem[]; waMap: WaMap }) => string
}

interface DropzoneProps<T> {
  label: string
  accept: string
  rows: T[]
  rowLabel: string
  onLoad: (rows: T[]) => void
  onClear: () => void
  parseFile: (file: File) => Promise<T[]>
  actionLabel?: string
  /**
   * O que escrever no lugar do nome do arquivo quando as linhas já vieram
   * prontas de fora (contexto) e nenhum arquivo foi escolhido AQUI.
   *
   * Sem isto o card carregado mostra uma linha em branco no meio: `fileName` só
   * é preenchido por `handleFile`, e desde que os laudos passaram a ser
   * carregados automaticamente do relatório do Órbita (ver
   * services/laudos/relatorio.ts) o caso comum é justamente chegar sem arquivo.
   */
  origemPadrao?: string
}

function Dropzone<T>({ label, accept, rows, rowLabel, onLoad, onClear, parseFile, actionLabel, origemPadrao }: DropzoneProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const loaded = rows.length > 0

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    try {
      const result = await parseFile(file)
      if (result.length === 0) throw new Error("Nenhuma linha encontrada no arquivo.")
      setFileName(file.name)
      onLoad(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao processar arquivo.")
    } finally {
      setLoading(false)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ""
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function clear() {
    setFileName(null)
    setError(null)
    onClear()
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-4 min-h-[120px] text-center transition-colors select-none
        ${!loaded && !loading ? "cursor-pointer" : ""}
        ${dragging ? "border-primary bg-primary/5" : loaded ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-border bg-card hover:border-[#2A92C0]/40 hover:bg-muted/40"}`}
      onClick={() => !loaded && !loading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onInputChange} />

      {loaded ? (
        <>
          <CheckCircle2 size={22} className="text-green-500 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">{label}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{fileName ?? origemPadrao}</p>
            <p className="text-xs font-medium text-green-600 dark:text-green-500">{rows.length} {rowLabel}</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); clear() }}
            className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
            title="Remover"
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <Upload size={20} className="text-muted-foreground shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">Arraste ou clique para selecionar</p>
          </div>
          {loading ? (
            <p className="text-xs text-primary animate-pulse">Processando...</p>
          ) : (
            <>
              {actionLabel && (
                <button
                  onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                  className="mt-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "#2A92C0" }}
                >
                  {actionLabel}
                </button>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}

interface ImportDropzoneProps {
  onImport: (data: { rec: RecItem[]; inv: InvItem[]; waMap: WaMap }) => string
}

function ImportDropzone({ onImport }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(file: File) {
    setLoading(true)
    setStatus(null)
    parseHistoricoXlsx(file, (rec, inv, err, waMap) => {
      setLoading(false)
      if (err) {
        setStatus({ type: "err", msg: `Erro: ${err}` })
      } else {
        const msg = onImport({ rec, inv, waMap })
        setStatus({ type: "ok", msg })
      }
      setTimeout(() => setStatus(null), 4000)
    })
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ""
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer select-none
        ${dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={onInputChange} />

      <FolderInput size={20} className="text-muted-foreground shrink-0" />
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">Importar Base</p>
        <p className="text-xs text-muted-foreground">XLSX exportado anteriormente</p>
      </div>
      {loading && <p className="text-xs text-primary animate-pulse">Importando...</p>}
      {status && (
        <p className={`text-xs ${status.type === "ok" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {status.msg}
        </p>
      )}
    </div>
  )
}

interface GradeStatusCardProps {
  rows: CsvRow[]
  loading: boolean
  error: string | null
  onClear: () => void
}

function GradeStatusCard({ rows, loading, error, onClear }: GradeStatusCardProps) {
  const rw = getRefWeek()
  const loaded = rows.length > 0

  if (loaded) {
    return (
      <div className="relative flex items-center gap-3 rounded-xl border-2 border-green-400 bg-green-50 dark:bg-green-950/20 px-4 py-4 min-h-[120px]">
        <CheckCircle2 size={20} className="text-green-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">Grade de Profissionais</p>
          <p className="text-xs text-green-600 dark:text-green-500">{rows.length} horários · {rw.label}</p>
        </div>
        <button
          onClick={onClear}
          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
          title="Limpar"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4 min-h-[120px] justify-center">
      <div className="flex items-center gap-1.5">
        <DatabaseZap size={14} className="shrink-0 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Grade de Profissionais</p>
      </div>
      <p className="text-xs text-muted-foreground">{rw.label}</p>
      {loading ? (
        <p className="text-xs text-primary animate-pulse">Carregando grade...</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Aguardando upload do laudo</p>
      )}
    </div>
  )
}

function parseCsv<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r: Papa.ParseResult<T>) => resolve(r.data),
      error: (e: { message: string }) => reject(new Error(e.message)),
    })
  })
}

/** Adiciona HI_str, HI e Unidade a cada linha bruta do CSV da grade */
function processGradeRow(raw: Record<string, string>): CsvRow {
  const hi_str = String(raw["Hora Inicial"] || "").slice(0, 5)
  return {
    ...raw,
    HI_str: hi_str,
    HI: pm(hi_str),
    Unidade: exU(raw["Sala"]),
  } as unknown as CsvRow
}

function parseCsvGrade(file: File): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data.map(processGradeRow)),
      error: (e: { message: string }) => reject(new Error(e.message)),
    })
  })
}

function parseXlsx<T>(file: File): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        // raw:true evita que o SheetJS "adivinhe" datas ao ler o .xls (que na prática é uma
        // tabela HTML exportada pelo TI): sem isso, datas em formato DD/MM/AAAA com dia <= 12
        // (ex.: "01/07/2026") são reinterpretadas como MM/DD/AAAA e viram outra data (7 de
        // janeiro em vez de 1 de julho) de forma silenciosa. Com raw:true o texto original da
        // célula é preservado como string, igual em todas as linhas.
        const wb = XLSX.read(e.target?.result, { type: "array", raw: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<T>(ws, { defval: "" })
        resolve(data)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."))
    reader.readAsArrayBuffer(file)
  })
}

// SEM CHAMADOR hoje (verificado em 2026-08-27): este painel era a área de upload
// da aba "Novo Cronograma", que foi retirada do ar por não estar pronta — ver o
// cabeçalho de SolicitacoesShell.tsx, onde `?tab=novo-cron` redireciona para
// `simulacao`. Mantido junto com NovoCronogramaTab, e ajustado quando os laudos
// passaram a vir do relatório do Órbita para não voltar com o card carregado
// mostrando uma linha em branco no lugar do nome do arquivo.
export function DadosUploadPanel({ cRows, lRows, dispRows, onCRows, onLRows, onDispRows, onImport }: Props) {
  const [gradeLoading, setGradeLoading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const rw = getRefWeek()
  const allLoaded = cRows.length > 0 && lRows.length > 0

  async function handleLaudosLoaded(rows: LaudoRow[]) {
    onLRows(rows)
    setGradeLoading(true)
    setGradeError(null)
    try {
      const gradeResult = await buscarGradeComoCSVRows(rw.inicio, rw.fim)
      if (gradeResult.length === 0) throw new Error("Nenhum registro encontrado para o período.")
      onCRows(gradeResult)
    } catch (e: unknown) {
      setGradeError(e instanceof Error ? e.message : "Erro ao buscar grade.")
    } finally {
      setGradeLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <GradeStatusCard
          rows={cRows}
          loading={gradeLoading}
          error={gradeError}
          onClear={() => { onCRows([]); setGradeError(null) }}
        />
        <Dropzone<LaudoRow>
          label="Laudos / Autorizações"
          accept=".xlsx,.xls"
          rows={lRows}
          rowLabel="laudos"
          onLoad={handleLaudosLoaded}
          onClear={() => onLRows([])}
          parseFile={f => parseXlsx<LaudoRow>(f)}
          actionLabel="Selecionar arquivo XLSX"
          // Neutro de propósito: quando os laudos chegam pelo contexto, este
          // componente não tem como saber se vieram do relatório do Órbita ou de
          // um arquivo que a pessoa subiu no badge do cabeçalho — e afirmar a
          // origem errada é pior do que apontar onde ela está escrita. O badge do
          // header tem a meta da importação e mostra data e arquivo no title.
          origemPadrao="Já carregado — ver o badge no cabeçalho"
        />
      </div>

      {!allLoaded && !gradeLoading && lRows.length === 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Selecione o arquivo de Laudos para iniciar a análise.
        </p>
      )}
    </div>
  )
}
