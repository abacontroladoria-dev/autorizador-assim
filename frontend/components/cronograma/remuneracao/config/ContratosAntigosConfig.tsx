"use client"

import { useEffect, useState } from "react"
import { Loader2, Upload, AlertCircle } from "lucide-react"
import Papa from "papaparse"
import { B } from "@/lib/cronograma/constants"
import { getContratosAntigos, upsertContratoAntigo } from "@/services/remuneracao.service"
import { parseNumeroBR } from "@/lib/remuneracao/formatacao"
import type { ContratoAntigo } from "@/types/remuneracao"

export function ContratosAntigosConfig() {
  const [contratos, setContratos] = useState<ContratoAntigo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const { data } = await getContratosAntigos()
    if (data) setContratos(data as ContratoAntigo[])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[]
          const falhas: string[] = []
          for (const row of rows) {
            const nome = row["Profissional"] || row["Nome"] || row["profissional_nome"]
            if (!nome) continue

            const record = {
              profissional_nome: nome.trim(),
              salario: parseNumeroBR(row["Salário"]),
              ch_semanal: row["CH Semanal"] ? Number(row["CH Semanal"]) : null,
              contrato: row["Contrato"] || null,
            }
            const ok = await upsertContratoAntigo(record)
            if (!ok) falhas.push(nome.trim())
          }
          await carregar()
          if (falhas.length > 0) {
            alert(`Importação concluída com ${falhas.length} erro(s). Linhas com falha: ${falhas.join(", ")}`)
          } else {
            alert("Importação concluída com sucesso!")
          }
        } catch (err) {
          console.error(err)
          alert("Erro ao processar CSV.")
        } finally {
          setUploading(false)
          e.target.value = ""
        }
      }
    })
  }

  const fmtMoeda = (v: number | null) => {
    if (v === null) return "-"
    return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg" style={{ color: B.navy }}>Contratos Antigos (Histórico)</h3>
          <p className="text-sm text-slate-500 mt-1">
            Esta tabela serve apenas como referência histórica de quanto os terapeutas recebiam antes.
          </p>
        </div>
        
        <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-white transition-all hover:opacity-90" style={{ background: B.blue }}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Importar CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : contratos.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-slate-300" />
            <p>Nenhum contrato antigo cadastrado.</p>
            <p className="text-xs">Importe um CSV com colunas: Profissional, Salário, CH Semanal, Contrato</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3">Profissional</th>
                  <th className="p-3">Contrato (Tipo)</th>
                  <th className="p-3 text-right">Salário Ref.</th>
                  <th className="p-3 text-right">CH Semanal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {contratos.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium" style={{ color: B.navy }}>{c.profissional_nome}</td>
                    <td className="p-3">{c.contrato || '-'}</td>
                    <td className="p-3 text-right">{fmtMoeda(c.salario)}</td>
                    <td className="p-3 text-right">{c.ch_semanal ? `${c.ch_semanal}h` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
