"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Loader2, Search, ListFilter } from "lucide-react"
import { getContratosAntigos, getProfissionaisRoster, upsertContratoAntigo } from "@/services/remuneracao.service"
import { parseNumeroBR, numeroParaTextoBR } from "@/lib/remuneracao/formatacao"
import { useDraftRow, useDraftTable, type DraftTable } from "@/hooks/useDraftRow"
import { SaveStatusBadge } from "./SaveStatusBadge"
import { SalvarTudoBar } from "./SalvarTudoBar"
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

type CampoPendente = "contrato" | "salario" | "chSemanal"

const CAMPO_VAZIO: Record<CampoPendente, (l: LinhaBase) => boolean> = {
  contrato: l => !l.contrato,
  salario: l => !l.salario,
  chSemanal: l => !l.chSemanal,
}

const FILTROS_PENDENTES: { campo: CampoPendente; label: string }[] = [
  { campo: "contrato", label: "Sem contrato" },
  { campo: "salario", label: "Sem salário" },
  { campo: "chSemanal", label: "Sem CH semanal" },
]

// ─── Linha da tabela: estado local "rascunho" — só commita quando o botão
// único "Salvar tudo" do pai é clicado (D.4) ──────────────────────────────

const LinhaContratoAntigo = memo(function LinhaContratoAntigo({ linha, table }: { linha: LinhaBase; table: DraftTable }) {
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

  const { value, update, status } = useDraftRow(linha.profissionalNome, initial, save, table)

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="p-2.5 font-medium text-foreground whitespace-nowrap">{linha.profissionalNome}</td>
      <td className="p-2.5">
        <input
          value={value.contrato}
          onChange={e => update({ contrato: e.target.value })}
          placeholder="—"
          aria-label={`Contrato antigo de ${linha.profissionalNome}`}
          className="w-full min-w-[9rem] rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </td>
      <td className="p-2.5">
        <input
          value={value.chSemanalTexto}
          onChange={e => update({ chSemanalTexto: e.target.value })}
          placeholder="0"
          inputMode="decimal"
          aria-label={`Carga horária semanal de ${linha.profissionalNome}`}
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
            aria-label={`Salário de ${linha.profissionalNome}`}
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

interface ContratosAntigosConfigProps {
  onDirtyChange?: (dirty: boolean) => void
  registerSave?: (save: (() => Promise<boolean>) | null) => void
}

export function ContratosAntigosConfig({ onDirtyChange, registerSave }: ContratosAntigosConfigProps = {}) {
  const [contratos, setContratos] = useState<ContratoAntigo[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtrosPendentes, setFiltrosPendentes] = useState<Set<CampoPendente>>(new Set())
  const { table, dirtyCount, saving, saveAll } = useDraftTable()

  useEffect(() => { onDirtyChange?.(dirtyCount > 0) }, [dirtyCount, onDirtyChange])

  const handleSalvarTudo = useCallback(async () => {
    const { total, ok } = await saveAll()
    if (!total) return true
    const sucesso = ok === total
    if (sucesso) toast.success(`${ok} ${ok === 1 ? "alteração salva" : "alterações salvas"}.`)
    else toast.error(`${ok} de ${total} salvas — revise as linhas marcadas com erro.`)
    return sucesso
  }, [saveAll])

  useEffect(() => {
    registerSave?.(handleSalvarTudo)
    return () => registerSave?.(null)
  }, [handleSalvarTudo, registerSave])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial via API, sem valor derivável no primeiro render
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
    if (filtrosPendentes.size > 0) {
      r = r.filter(l => [...filtrosPendentes].some(campo => CAMPO_VAZIO[campo](l)))
    }
    return r
  }, [linhas, busca, filtrosPendentes])

  const pendentesQtd = useMemo(() => ({
    contrato: linhas.filter(CAMPO_VAZIO.contrato).length,
    salario: linhas.filter(CAMPO_VAZIO.salario).length,
    chSemanal: linhas.filter(CAMPO_VAZIO.chSemanal).length,
  }), [linhas])

  const toggleFiltroPendente = (campo: CampoPendente) => {
    setFiltrosPendentes(cur => {
      const next = new Set(cur)
      if (next.has(campo)) next.delete(campo)
      else next.add(campo)
      return next
    })
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg text-foreground">Contratos Antigos (Histórico)</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Referência histórica de quanto os terapeutas recebiam antes. Edite direto na lista e clique em
            &ldquo;Salvar tudo&rdquo; para gravar as alterações.
          </p>
        </div>
        <SalvarTudoBar dirtyCount={dirtyCount} saving={saving} onSave={handleSalvarTudo} />
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
                aria-label="Buscar profissional"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {FILTROS_PENDENTES.map(({ campo, label }) => {
              const ativo = filtrosPendentes.has(campo)
              return (
                <button
                  key={campo}
                  type="button"
                  onClick={() => toggleFiltroPendente(campo)}
                  aria-pressed={ativo}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold border transition-colors ${
                    ativo
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "border-slate-200 dark:border-slate-700 text-foreground bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <ListFilter size={13} />
                  {label}
                  <span className={`rounded-full px-1.5 text-[10px] font-bold ${ativo ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                    {pendentesQtd[campo]}
                  </span>
                </button>
              )
            })}
            <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
              {linhasFiltradas.length} de {linhas.length}
            </span>
          </div>

          {linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">Nenhum profissional encontrado.</div>
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
                    <LinhaContratoAntigo key={linha.profissionalNome} linha={linha} table={table} />
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
