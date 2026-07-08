"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Upload, Search } from "lucide-react"
import Papa from "papaparse"
import { B } from "@/lib/cronograma/constants"
import { capacidadePadraoProfissional } from "@/lib/remuneracao/ocupacao"
import { getCapacidades, getProfissionaisRosterComTerapia, upsertCapacidade } from "@/services/remuneracao.service"
import { useAutoSaveRow } from "@/hooks/useAutoSaveRow"
import { SaveStatusBadge } from "./SaveStatusBadge"
import type { CapacidadeProfissional } from "@/types/remuneracao"

const DIAS_CAPACIDADE: { key: "seg" | "ter" | "qua" | "qui" | "sex" | "sab"; label: string }[] = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sab" },
]

const DEFAULT_CC_LIM = 8

type LinhaBase = {
  profissionalNome: string
  terapiaPrincipal: string | null
  padrao: number | null
  dias: Record<string, number>
  limiteCC: number | null
}

type LinhaValor = {
  padraoTexto: string
  diasTexto: Record<string, string>
  limiteCCTexto: string
}

// ─── Linha da tabela: estado local + auto-save por linha (debounce 800ms) ────

const LinhaCapacidade = memo(function LinhaCapacidade({ linha }: { linha: LinhaBase }) {
  const padraoSistema = capacidadePadraoProfissional(linha.terapiaPrincipal ?? "")

  const save = useCallback(async (v: LinhaValor) => {
    const dias: Record<string, number> = {}
    DIAS_CAPACIDADE.forEach(({ key }) => {
      const n = Number(v.diasTexto[key])
      if (Number.isFinite(n) && n > 0) dias[key] = n
    })
    return upsertCapacidade({
      profissional_nome: linha.profissionalNome,
      padrao: Number(v.padraoTexto) > 0 ? Number(v.padraoTexto) : null,
      dias,
      limite_cc: Number(v.limiteCCTexto) > 0 ? Number(v.limiteCCTexto) : null,
    })
  }, [linha.profissionalNome])

  const initial = useMemo<LinhaValor>(() => ({
    padraoTexto: linha.padrao != null ? String(linha.padrao) : "",
    diasTexto: Object.fromEntries(DIAS_CAPACIDADE.map(({ key }) => [key, linha.dias[key] != null ? String(linha.dias[key]) : ""])),
    limiteCCTexto: linha.limiteCC != null ? String(linha.limiteCC) : "",
  }), [linha.padrao, linha.dias, linha.limiteCC])

  const { value, update, status } = useAutoSaveRow(initial, save)

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="p-2.5 font-medium text-foreground whitespace-nowrap">{linha.profissionalNome}</td>
      <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">{linha.terapiaPrincipal || "Sem terapia importada"}</td>
      <td className="p-2.5">
        <input
          value={value.padraoTexto}
          onChange={e => update({ padraoTexto: e.target.value })}
          placeholder={String(padraoSistema)}
          inputMode="numeric"
          className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="text-[10px] text-muted-foreground mt-0.5">base {padraoSistema}</div>
      </td>
      {DIAS_CAPACIDADE.map(({ key }) => (
        <td key={key} className="p-2.5">
          <input
            value={value.diasTexto[key]}
            onChange={e => update({ diasTexto: { ...value.diasTexto, [key]: e.target.value } })}
            placeholder="—"
            inputMode="numeric"
            className="w-14 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </td>
      ))}
      <td className="p-2.5">
        <input
          value={value.limiteCCTexto}
          onChange={e => update({ limiteCCTexto: e.target.value })}
          placeholder={String(DEFAULT_CC_LIM)}
          inputMode="numeric"
          title="Limite de pacientes de Coordenador de Caso"
          className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </td>
      <td className="p-2.5 text-right">
        <SaveStatusBadge status={status} />
      </td>
    </tr>
  )
})

// ─── Tela ─────────────────────────────────────────────────────────────────

export function CapacidadeConfig() {
  const [capacidades, setCapacidades] = useState<CapacidadeProfissional[]>([])
  const [roster, setRoster] = useState<{ profissional_nome: string; terapia_principal: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busca, setBusca] = useState("")

  const carregar = async () => {
    setLoading(true)
    const [{ data: capacidadesData }, { data: rosterData }] = await Promise.all([
      getCapacidades(),
      getProfissionaisRosterComTerapia(),
    ])
    if (capacidadesData) setCapacidades(capacidadesData as CapacidadeProfissional[])
    if (rosterData) setRoster(rosterData)
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const linhas = useMemo<LinhaBase[]>(() => {
    const porNome = new Map(capacidades.map(c => [c.profissional_nome, c]))
    const terapiaPorNome = new Map(roster.map(r => [r.profissional_nome, r.terapia_principal]))
    const nomes = new Set<string>([...roster.map(r => r.profissional_nome), ...capacidades.map(c => c.profissional_nome)])
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).map(nome => {
      const c = porNome.get(nome)
      return {
        profissionalNome: nome,
        terapiaPrincipal: terapiaPorNome.get(nome) ?? null,
        padrao: c?.padrao ?? null,
        dias: c?.dias ?? {},
        limiteCC: c?.limite_cc ?? null,
      }
    })
  }, [roster, capacidades])

  const linhasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return linhas
    return linhas.filter(l => l.profissionalNome.toLowerCase().includes(q))
  }, [linhas, busca])

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
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Padrão geral: 1 paciente por horário. Musicoterapia começa com 2. Edite direto na lista — cada campo
            salva sozinho ao parar de digitar.
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
            <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
              {linhasFiltradas.length} de {linhas.length}
            </span>
          </div>

          {linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum profissional encontrado.</div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-[900px] w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5">Profissional</th>
                    <th className="p-2.5">Terapia base</th>
                    <th className="p-2.5 text-center">Padrão</th>
                    {DIAS_CAPACIDADE.map(({ key, label }) => (
                      <th key={key} className="p-2.5 text-center">{label}</th>
                    ))}
                    <th className="p-2.5 text-center">Limite CC</th>
                    <th className="p-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map(linha => (
                    <LinhaCapacidade key={linha.profissionalNome} linha={linha} />
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
