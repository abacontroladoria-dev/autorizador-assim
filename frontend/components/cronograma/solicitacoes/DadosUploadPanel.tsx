"use client"

import { useRef, useState } from "react"
import Papa from "papaparse"
import * as XLSX from "xlsx"
import { Upload, CheckCircle2, X, FolderInput } from "lucide-react"
import { pm, exU } from "@/lib/cronograma/helpers"
import { parseHistoricoXlsx } from "@/lib/cronograma/xlsx"
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
}

function Dropzone<T>({ label, accept, rows, rowLabel, onLoad, onClear, parseFile }: DropzoneProps<T>) {
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
      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer select-none
        ${dragging ? "border-primary bg-primary/5" : loaded ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"}`}
      onClick={() => !loaded && inputRef.current?.click()}
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
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{fileName}</p>
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
            <p className="text-xs text-muted-foreground">{accept.includes("csv") ? "Arquivo CSV" : "Arquivo XLSX"}</p>
          </div>
          {loading && <p className="text-xs text-primary animate-pulse">Processando...</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
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
        const wb = XLSX.read(e.target?.result, { type: "array" })
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

export function DadosUploadPanel({ cRows, lRows, dispRows, onCRows, onLRows, onDispRows, onImport }: Props) {
  const allLoaded = cRows.length > 0 && lRows.length > 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Dropzone<CsvRow>
          label="Grade de Profissionais"
          accept=".csv"
          rows={cRows}
          rowLabel="linhas"
          onLoad={onCRows}
          onClear={() => onCRows([])}
          parseFile={parseCsvGrade}
        />
        <Dropzone<LaudoRow>
          label="Laudos / Autorizações"
          accept=".xlsx,.xls"
          rows={lRows}
          rowLabel="laudos"
          onLoad={onLRows}
          onClear={() => onLRows([])}
          parseFile={f => parseXlsx<LaudoRow>(f)}
        />
      </div>

      {!allLoaded && (
        <p className="text-xs text-muted-foreground text-center">
          Carregue a Grade e os Laudos para habilitar as análises.
        </p>
      )}
    </div>
  )
}
