"use client"

// Duplicado de components/cronograma/solicitacoes/DadosUploadPanel.tsx (não
// exportado de lá) — aditivo, sem editar o original.

import { useRef, useState } from "react"
import { Upload, CheckCircle2, X } from "lucide-react"

interface DropzoneProps<T> {
  label: string
  accept: string
  rows: T[]
  rowLabel: string
  onLoad: (rows: T[], fileName: string) => void
  onClear: () => void
  parseFile: (file: File) => Promise<T[]>
  actionLabel?: string
}

export function Dropzone<T>({ label, accept, rows, rowLabel, onLoad, onClear, parseFile, actionLabel }: DropzoneProps<T>) {
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
      onLoad(result, file.name)
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
            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{fileName}</p>
            <p className="text-xs font-medium text-green-600 dark:text-green-500">{rows.length} {rowLabel}</p>
          </div>
          <button
            type="button"
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
                  type="button"
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
