"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Upload, Search, ListFilter } from "lucide-react"
import Papa from "papaparse"
import { B } from "@/lib/cronograma/constants"
import { getContratosAntigos, getProfissionaisRoster, upsertContratoAntigo } from "@/services/remuneracao.service"
import { parseNumeroBR, numeroParaTextoBR } from "@/lib/remuneracao/formatacao"
import { useAutoSaveRow } from "@/hooks/useAutoSaveRow"
import { SaveStatusBadge } from "./SaveStatusBadge"
import type { ContratoAntigo } from "@/types/remuneracao"

type LinhaBase = {
  profissionalNome: string
  contrato: string | null
  chSemanal: number | null
  salario: number | null
}

type LinhaValor = {
  contrato: string
  chSemanalTexto: string
  salarioTexto: string
}

// ─── Linha da tabela: estado local + auto-save por linha (debounce 800ms) ────

const LinhaContratoAntigo = memo(function LinhaContratoAntigo({ linha }: { linha: LinhaBase }) {
  const save = useCallback(async (v: LinhaValor) => {
    return upsertContratoAntigo({
      profissional_nome: linha.profissionalNome,
      contrato: v.contrato.trim() || null,
      ch_semanal: parseNumeroBR(v.chSemanalTexto) ?? 0,
      salario: parseNumeroBR(v.salarioTexto) ?? 0,
    })
  }, [linha.profissionalNome])

  const initial = useMemo<LinhaValor>(() => ({
    contrato: linha.contrato ?? "",
    chSemanalTexto: numeroParaTextoBR(linha.chSemanal),
    salarioTexto: numeroParaTextoBR(linha.salario),
  }), [linha.contrato, linha.chSemanal, linha.salario])

  const { value, update, status } = useAutoSaveRow(initial, save)

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="p-2.5 font-medium text-foreground whitespace-nowrap">{linha.profissionalNome}</td>
      <td className="p-2.5">
        <input
          value={value.contrato}
          onChange={e => update({ contrato: e.target.value })}
          placeholder="—"
          className="w-full min-w-[9rem] rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </td>
      <td className="p-2.5">
        <input
          value={value.chSemanalTexto}
          onChange={e => update({ chSemanalTexto: e.target.value })}
          placeholder="0"
          inputMode="decimal"
          className="w-20 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-right text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </td>
      <td className="p-2.5">
        <div className="relative w-28 ml-auto">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
          <input
            value={value.salarioTexto}
            onChange={e => update({ salarioTexto: e.target.value })}
            placeholder="0"
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-transparent pl-7 pr-2 py-1 text-xs text-right text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </td>
      <td className="p-2.5 text-right">
        <SaveStatusBadge status={status} />
      </td>
    </tr>
  )
})

// ─── Tela ─────────────────────────────────────────────────────────────────

export function ContratosAntigosConfig() {
  const [contratos, setContratos] = useState<ContratoAntigo[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busca, setBusca] = useState("")
  const [apenasPendentes, setApenasPendentes] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: contratosData }, { data: rosterData }] = await Promise.all([
      getContratosAntigos(),
      getProfissionaisRoster(),
    ])
    if (contratosData) setContratos(contratosData as ContratoAntigo[])
    if (rosterData) setRoster(rosterData)
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const linhas = useMemo<LinhaBase[]>(() => {
    const porNome = new Map(contratos.map(c => [c.profissional_nome, c]))
    const nomes = new Set<string>([...roster, ...contratos.map(c => c.profissional_nome)])
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).map(nome => {
      const c = porNome.get(nome)
      return {
        profissionalNome: nome,
        contrato: c?.contrato ?? null,
        chSemanal: c?.ch_semanal ?? null,
        salario: c?.salario ?? null,
      }
    })
  }, [roster, contratos])

  const linhasFiltradas = useMemo(() => {
    let r = linhas
    const q = busca.trim().toLowerCase()
    if (q) r = r.filter(l => l.profissionalNome.toLowerCase().includes(q))
    if (apenasPendentes) r = r.filter(l => !l.contrato)
    return r
  }, [linhas, busca, apenasPendentes])

  const pendentesQtd = useMemo(() => linhas.filter(l => !l.contrato).length, [linhas])

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

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg" style={{ color: B.navy }}>Contratos Antigos (Histórico)</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Referência histórica de quanto os terapeutas recebiam antes. Edite direto na lista — cada campo salva
            sozinho ao parar de digitar.
          </p>
        </div>

        <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-white transition-all hover:opacity-90 shrink-0" style={{ background: B.blue }}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Importar CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">

          <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar profissional…"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="button"
              onClick={() => setApenasPendentes(v => !v)}
              aria-pressed={apenasPendentes}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors ${
                apenasPendentes
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "border-slate-200 dark:border-slate-700 text-foreground bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <ListFilter size={13} />
              Sem contrato
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${apenasPendentes ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                {pendentesQtd}
              </span>
            </button>
            <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
              {linhasFiltradas.length} de {linhas.length}
            </span>
          </div>

          {linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum profissional encontrado.</div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5">Profissional</th>
                    <th className="p-2.5">Contrato Nº</th>
                    <th className="p-2.5 text-right">CH sem.</th>
                    <th className="p-2.5 text-right">Salário/mês</th>
                    <th className="p-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map(linha => (
                    <LinhaContratoAntigo key={linha.profissionalNome} linha={linha} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
