"use client"

import { useRef, useState } from "react"
import { CheckCircle2, Upload, Loader2, X } from "lucide-react"
import Papa from "papaparse"
import * as XLSX from "xlsx"
import { validarModeloRelatorio, parseHtmlTable, type CsvGradeRow, type SessaoReal } from "@/lib/remuneracao/relatorio"
import { parseGradeCsv } from "@/lib/remuneracao/uploadParsers"

interface Props {
  evoRows: SessaoReal[]
  peRows: any[]
  carregarGrade: (rows: CsvGradeRow[]) => void
  carregarPE: (rows: CsvGradeRow[], fileName: string) => void
  limparGrade: () => void
  limparPE: () => void
  setCsvName: (name: string) => void
  // Esconde o badge de "Upload PE" — usado na aba Entregas PEP, onde a PEP do
  // Analista do Comportamento vem do registro manual, não desse relatório.
  hidePe?: boolean
}

function parsePeFile(file: File): Promise<CsvGradeRow[]> {
  const isExcel = /\.(xls|xlsx)$/i.test(file.name)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."))
    reader.onload = ev => {
      let parsed: CsvGradeRow[] = []
      try {
        if (isExcel) {
          const wb = XLSX.read(ev.target?.result, { type: "array" })
          const ws = wb.Sheets[wb.SheetNames[0]]
          parsed = XLSX.utils.sheet_to_json<CsvGradeRow>(ws, { defval: "" })
        } else {
          const text = String(ev.target?.result || "")
          parsed = parseHtmlTable(text) as unknown as CsvGradeRow[]
          if (!parsed.length && /\.csv$/i.test(file.name)) {
            parsed = Papa.parse<CsvGradeRow>(text, { header: true, skipEmptyLines: true }).data
          }
          if (!parsed.length) {
            const wb = XLSX.read(text, { type: "string" })
            const ws = wb.Sheets[wb.SheetNames[0]]
            parsed = XLSX.utils.sheet_to_json<CsvGradeRow>(ws, { defval: "" })
          }
        }
      } catch {
        reject(new Error("Não consegui ler o relatório de PE/disponibilidade. Envie CSV, XLS, XLSX ou HTML com tabela."))
        return
      }
      const validacao = validarModeloRelatorio("pe", parsed)
      if (!validacao.ok && validacao.faltantes.length) {
        reject(new Error(`Modelo do arquivo mudou. Colunas esperadas não encontradas: ${validacao.faltantes.join(", ")}.`))
        return
      }
      resolve(parsed)
    }
    if (isExcel) reader.readAsArrayBuffer(file)
    else reader.readAsText(file, "UTF-8")
  })
}

export function RemuneracaoUploadBadges({
  evoRows, peRows, carregarGrade, carregarPE, limparGrade, limparPE, setCsvName, hidePe = false
}: Props) {

  const gradeInputRef = useRef<HTMLInputElement>(null)
  const peInputRef = useRef<HTMLInputElement>(null)
  
  const [gradeLoading, setGradeLoading] = useState(false)
  const [peLoading, setPeLoading] = useState(false)
  
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [peError, setPeError] = useState<string | null>(null)

  const gradeLoaded = evoRows.length > 0
  const peLoaded = peRows.length > 0

  async function onGradeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    
    setGradeLoading(true)
    setGradeError(null)
    try {
      const rows = await parseGradeCsv(file)
      carregarGrade(rows)
      setCsvName(file.name)
    } catch (err: any) {
      setGradeError(err.message)
    } finally {
      setGradeLoading(false)
    }
  }

  async function onPeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    
    setPeLoading(true)
    setPeError(null)
    try {
      const rows = await parsePeFile(file)
      carregarPE(rows, file.name)
    } catch (err: any) {
      setPeError(err.message)
    } finally {
      setPeLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {/* Input escondidos */}
        <input ref={gradeInputRef} type="file" accept=".csv" className="hidden" onChange={onGradeChange} />
        <input ref={peInputRef} type="file" accept=".csv,.xls,.xlsx,.html" className="hidden" onChange={onPeChange} />

        {/* Badge 1: Grade */}
        {gradeLoaded ? (
          <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400 px-3 py-1 text-xs font-medium">
            <CheckCircle2 size={11} className="text-green-500" />
            Grade · {evoRows.length.toLocaleString("pt-BR")} registros
            <button onClick={limparGrade} className="ml-0.5 text-green-600/50 hover:text-destructive transition-colors" title="Remover Grade">
              <X size={11} />
            </button>
          </span>
        ) : (
          <button
            onClick={() => !gradeLoading && gradeInputRef.current?.click()}
            disabled={gradeLoading}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-[#2A92C0]/60 bg-[#2A92C0]/5 text-[#2A92C0] hover:bg-[#2A92C0]/10 px-3 py-1 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {gradeLoading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            {gradeLoading ? "Lendo..." : "Upload Grade"}
          </button>
        )}

        {/* Badge 2: PE */}
        {!hidePe && (
          peLoaded ? (
            <span className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400 px-3 py-1 text-xs font-medium">
              <CheckCircle2 size={11} className="text-green-500" />
              PE · {peRows.length.toLocaleString("pt-BR")} registros
              <button onClick={limparPE} className="ml-0.5 text-green-600/50 hover:text-destructive transition-colors" title="Remover PE">
                <X size={11} />
              </button>
            </span>
          ) : (
            <button
              onClick={() => !peLoading && peInputRef.current?.click()}
              disabled={peLoading}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-[#2A92C0]/60 bg-[#2A92C0]/5 text-[#2A92C0] hover:bg-[#2A92C0]/10 px-3 py-1 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {peLoading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              {peLoading ? "Lendo..." : "Upload PE"}
            </button>
          )
        )}
      </div>

      {(gradeError || peError) && (
        <p className="text-[11px] text-destructive mt-0.5 max-w-[400px] text-right leading-tight">
          {gradeError || peError}
        </p>
      )}
    </div>
  )
}
