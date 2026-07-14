"use client"

// Upload da grade para a Análise de Tratativas. Diferente de
// RemuneracaoUploadBadges: NÃO existe upload de PE (relatório monetário) aqui —
// só a grade de sessões, que não contém nenhum valor em R$.

import { useRef, useState } from "react"
import { CheckCircle2, Upload, Loader2, X } from "lucide-react"
import { parseGradeCsv } from "@/lib/remuneracao/uploadParsers"
import type { CsvGradeRow, SessaoReal } from "@/lib/remuneracao/relatorio"

interface Props {
  evoRows: SessaoReal[]
  carregarGrade: (rows: CsvGradeRow[]) => void
  limparGrade: () => void
  setCsvName: (name: string) => void
}

export function TratativasUploadBadge({ evoRows, carregarGrade, limparGrade, setCsvName }: Props) {
  const gradeInputRef = useRef<HTMLInputElement>(null)
  const [gradeLoading, setGradeLoading] = useState(false)
  const [gradeError, setGradeError] = useState<string | null>(null)

  const gradeLoaded = evoRows.length > 0

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

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input ref={gradeInputRef} type="file" accept=".csv" className="hidden" onChange={onGradeChange} />

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

      {gradeError && (
        <p className="text-[11px] text-destructive mt-0.5 max-w-[400px] text-right leading-tight">
          {gradeError}
        </p>
      )}
    </div>
  )
}
