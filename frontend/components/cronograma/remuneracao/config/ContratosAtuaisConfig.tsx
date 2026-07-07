"use client"

import { useEffect, useState } from "react"
import { Loader2, Upload, AlertCircle, FileText } from "lucide-react"
import Papa from "papaparse"
import { B } from "@/lib/cronograma/constants"
import { getContratosAtuais, upsertContratoAtual } from "@/services/remuneracao.service"
import { parseNumeroBR, validarCpfCnpj } from "@/lib/remuneracao/formatacao"

export function ContratosAtuaisConfig() {
  const [contratos, setContratos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const { data } = await getContratosAtuais()
    if (data) setContratos(data)
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

          // Agrupar por profissional
          const byProf = new Map<string, any>()

          for (const row of rows) {
            const nome = row["Profissional"] || row["Nome"] || row["profissional_nome"]
            if (!nome) continue

            const profKey = nome.trim()
            if (!byProf.has(profKey)) {
              const cpfRaw = row["CPF"] || null
              const cnpjRaw = row["CNPJ"] || null
              const cpfValido = validarCpfCnpj(cpfRaw)
              const cnpjValido = validarCpfCnpj(cnpjRaw)
              if (cpfRaw && !cpfValido) falhas.push(`${profKey} (CPF em formato inválido)`)
              if (cnpjRaw && !cnpjValido) falhas.push(`${profKey} (CNPJ em formato inválido)`)

              byProf.set(profKey, {
                profissional_nome: profKey,
                documento_tipo: row["Tipo Doc"] || null,
                cpf: cpfValido ? cpfRaw : null,
                cnpj: cnpjValido ? cnpjRaw : null,
                observacoes: row["Observacoes"] || null,
                contratos_atuais: []
              })
            }

            const numero = row["Contrato Novo"] || row["numero"]
            const funcao = row["Funcao"] || row["funcao"]
            const valor = row["PA"] || row["valorPA"]

            if (numero || funcao || valor) {
              byProf.get(profKey).contratos_atuais.push({
                numero: numero || "",
                funcao: funcao || "",
                valorPA: parseNumeroBR(valor) ?? 0,
                vigente: true
              })
            }
          }

          // Upsert todos
          for (const record of byProf.values()) {
            const ok = await upsertContratoAtual(record)
            if (!ok) falhas.push(record.profissional_nome)
          }

          await carregar()
          if (falhas.length > 0) {
            alert(`Importação concluída com ${falhas.length} erro(s). Linhas com falha: ${falhas.join(", ")}`)
          } else {
            alert("Importação de contratos atuais concluída com sucesso!")
          }
        } catch (err) {
          console.error(err)
          alert("Erro ao processar CSV de contratos atuais.")
        } finally {
          setUploading(false)
          e.target.value = ""
        }
      }
    })
  }

  const fmtMoeda = (v: number | null) => {
    if (v === null || isNaN(v)) return "-"
    return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const badge = (ok: boolean, txtOk = "preenchido", txtBad = "pendente") => (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: ok ? "#dcfce7" : "#fff7ed", color: ok ? "#15803d" : "#c2410c" }}>
      {ok ? txtOk : txtBad}
    </span>
  )

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: B.navy }}>
            Cadastros de contratos atuais
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            A calculadora usa estes contratos vigentes para definir o PA que o prestador deve receber caso ele substitua ou preste horas.
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
            <FileText className="w-8 h-8 text-slate-300" />
            <p>Nenhum contrato atual cadastrado.</p>
            <p className="text-xs">Importe um CSV para popular a base de contratos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-xs">
                <tr>
                  <th className="p-3">Profissional</th>
                  <th className="p-3">Doc</th>
                  <th className="p-3">Contratos Vigentes</th>
                  <th className="p-3">PA Contratado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {contratos.map(c => {
                  const items = Array.isArray(c.contratos_atuais) ? c.contratos_atuais : []
                  const doc = c.cpf || c.cnpj
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
                      <td className="p-3">
                        <div className="font-bold" style={{ color: B.navy }}>{c.profissional_nome}</div>
                        {c.observacoes && <div className="text-[11px] text-slate-400 mt-1 max-w-[200px]">{c.observacoes}</div>}
                      </td>
                      <td className="p-3">
                        {badge(!!doc)}
                        {doc && <div className="text-xs text-slate-500 mt-1 font-mono">{doc}</div>}
                      </td>
                      <td className="p-3">
                        {badge(items.length > 0, `${items.length} vigente${items.length>1?'s':''}`, "pendente")}
                        <div className="mt-1 space-y-1">
                          {items.map((item: any, i: number) => (
                            <div key={i} className="text-xs text-slate-600">
                              {item.funcao || "Sem função"} {item.numero ? `- ${item.numero}` : ""}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        {items.length > 0 ? (
                          items.map((item: any, i: number) => (
                            <div key={i} className="text-xs font-bold whitespace-nowrap mb-1" style={{ color: B.purple }}>
                              {item.funcao}: {fmtMoeda(item.valorPA)}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
