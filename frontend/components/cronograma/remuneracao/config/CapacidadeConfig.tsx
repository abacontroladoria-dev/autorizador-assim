"use client"

import { useEffect, useState } from "react"
import { Loader2, Upload, AlertCircle } from "lucide-react"
import Papa from "papaparse"
import { B } from "@/lib/cronograma/constants"
import { getCapacidades, upsertCapacidade } from "@/services/remuneracao.service"
import type { CapacidadeProfissional } from "@/types/remuneracao"

export function CapacidadeConfig() {
  const [capacidades, setCapacidades] = useState<CapacidadeProfissional[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const { data } = await getCapacidades()
    if (data) setCapacidades(data as CapacidadeProfissional[])
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
              padrao: row["Padrão"] ? Number(row["Padrão"]) : null,
              dias: {
                seg: row["Seg"] ? Number(row["Seg"]) : undefined,
                ter: row["Ter"] ? Number(row["Ter"]) : undefined,
                qua: row["Qua"] ? Number(row["Qua"]) : undefined,
                qui: row["Qui"] ? Number(row["Qui"]) : undefined,
                sex: row["Sex"] ? Number(row["Sex"]) : undefined,
                sab: row["Sab"] ? Number(row["Sab"]) : undefined,
              },
            }
            const ok = await upsertCapacidade(record)
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

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg" style={{ color: B.navy }}>Capacidade do profissional</h3>
          <p className="text-sm text-slate-500 mt-1">
            Defina o padrão (base) ou as capacidades específicas para cada dia da semana.
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
        ) : capacidades.length === 0 ? (
          <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-slate-300" />
            <p>Nenhuma capacidade cadastrada.</p>
            <p className="text-xs">Importe um CSV com colunas: Profissional, Padrão, Seg, Ter, Qua, Qui, Sex, Sab</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3">Profissional</th>
                  <th className="p-3 text-center">Padrão</th>
                  <th className="p-3 text-center">Seg</th>
                  <th className="p-3 text-center">Ter</th>
                  <th className="p-3 text-center">Qua</th>
                  <th className="p-3 text-center">Qui</th>
                  <th className="p-3 text-center">Sex</th>
                  <th className="p-3 text-center">Sab</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {capacidades.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-medium" style={{ color: B.navy }}>{c.profissional_nome}</td>
                    <td className="p-3 text-center">{c.padrao || '-'}</td>
                    <td className="p-3 text-center">{c.dias?.seg || '-'}</td>
                    <td className="p-3 text-center">{c.dias?.ter || '-'}</td>
                    <td className="p-3 text-center">{c.dias?.qua || '-'}</td>
                    <td className="p-3 text-center">{c.dias?.qui || '-'}</td>
                    <td className="p-3 text-center">{c.dias?.sex || '-'}</td>
                    <td className="p-3 text-center">{c.dias?.sab || '-'}</td>
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
