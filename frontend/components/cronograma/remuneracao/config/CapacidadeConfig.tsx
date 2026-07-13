"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Loader2, Search } from "lucide-react"
import { capacidadePadraoProfissional } from "@/lib/remuneracao/ocupacao"
import { getCapacidades, getProfissionaisRosterComTerapia, upsertCapacidade } from "@/services/remuneracao.service"
import { useDraftRow, useDraftTable, type DraftTable } from "@/hooks/useDraftRow"
import { SaveStatusBadge } from "./SaveStatusBadge"
import { SalvarTudoBar } from "./SalvarTudoBar"
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

// ─── Linha da tabela: estado local "rascunho" — só commita quando o botão
// único "Salvar tudo" do pai é clicado (D.4) ──────────────────────────────

const LinhaCapacidade = memo(function LinhaCapacidade({ linha, table }: { linha: LinhaBase; table: DraftTable }) {
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

  const { value, update, status } = useDraftRow(linha.profissionalNome, initial, save, table)

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="p-2 font-medium text-foreground truncate" title={linha.profissionalNome}>
        <span className="truncate block">{linha.profissionalNome}</span>
      </td>
      <td className="p-2 text-xs text-muted-foreground truncate" title={linha.terapiaPrincipal || "Sem terapia importada"}>
        <span className="truncate block">{linha.terapiaPrincipal || "Sem terapia importada"}</span>
      </td>
      <td className="p-2">
        <input
          value={value.padraoTexto}
          onChange={e => update({ padraoTexto: e.target.value })}
          placeholder={String(padraoSistema)}
          inputMode="numeric"
          aria-label={`Padrão de capacidade de ${linha.profissionalNome}`}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="text-[10px] text-muted-foreground mt-0.5 text-center">base {padraoSistema}</div>
      </td>
      {DIAS_CAPACIDADE.map(({ key, label }) => (
        <td key={key} className="p-2">
          <input
            value={value.diasTexto[key]}
            onChange={e => update({ diasTexto: { ...value.diasTexto, [key]: e.target.value } })}
            placeholder="—"
            inputMode="numeric"
            aria-label={`Capacidade de ${linha.profissionalNome} em ${label}`}
            className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </td>
      ))}
      <td className="p-2">
        <input
          value={value.limiteCCTexto}
          onChange={e => update({ limiteCCTexto: e.target.value })}
          placeholder={String(DEFAULT_CC_LIM)}
          inputMode="numeric"
          title="Limite de pacientes de Coordenador de Caso"
          aria-label={`Limite de pacientes de Coordenador de Caso de ${linha.profissionalNome}`}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs text-center text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </td>
      <td className="p-2 text-right">
        <SaveStatusBadge status={status} />
      </td>
    </tr>
  )
})

// ─── Tela ─────────────────────────────────────────────────────────────────

interface CapacidadeConfigProps {
  onDirtyChange?: (dirty: boolean) => void
  registerSave?: (save: (() => Promise<boolean>) | null) => void
}

export function CapacidadeConfig({ onDirtyChange, registerSave }: CapacidadeConfigProps = {}) {
  const [capacidades, setCapacidades] = useState<CapacidadeProfissional[]>([])
  const [roster, setRoster] = useState<{ profissional_nome: string; terapia_principal: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
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
    const [{ data: capacidadesData }, { data: rosterData }] = await Promise.all([
      getCapacidades(),
      getProfissionaisRosterComTerapia(),
    ])
    if (capacidadesData) setCapacidades(capacidadesData as CapacidadeProfissional[])
    if (rosterData) setRoster(rosterData)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial via API, sem valor derivável no primeiro render
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

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg text-foreground">Capacidade do profissional</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Padrão geral: 1 paciente por horário. Musicoterapia começa com 2. Edite direto na lista e clique em
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
            <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
              {linhasFiltradas.length} de {linhas.length}
            </span>
          </div>

          {linhasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">Nenhum profissional encontrado.</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full table-fixed text-sm text-left">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[9%]" />
                  {DIAS_CAPACIDADE.map(({ key }) => (
                    <col key={key} className="w-[7.5%]" />
                  ))}
                  <col className="w-[9%]" />
                  <col className="w-[7%]" />
                </colgroup>
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-2">Profissional</th>
                    <th className="p-2">Terapia base</th>
                    <th className="p-2 text-center">Padrão</th>
                    {DIAS_CAPACIDADE.map(({ key, label }) => (
                      <th key={key} className="p-2 text-center">{label}</th>
                    ))}
                    <th className="p-2 text-center">Limite CC</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map(linha => (
                    <LinhaCapacidade key={linha.profissionalNome} linha={linha} table={table} />
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
