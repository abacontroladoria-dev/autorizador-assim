"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { Loader2, Search, ListFilter, Plus, X } from "lucide-react"
import { getContratos, getProfissionaisRoster, upsertContrato } from "@/services/remuneracao.service"
import { parseNumeroBR, formatMoedaBRTexto, maskMoedaBR, validarCpfCnpj } from "@/lib/remuneracao/formatacao"
import { useDraftRow, useDraftTable, type DraftTable } from "@/hooks/useDraftRow"
import { SaveStatusBadge } from "./SaveStatusBadge"
import { SalvarTudoBar } from "./SalvarTudoBar"
import type { ContratoAtual, ContratoAtualItem } from "@/types/remuneracao"

type ContratoItemEdit = {
  numero: string
  funcao: string
  valorPATexto: string
  vigente: boolean
  modeloFaturamento: "atendimento" | "banco_horas"
  valorTotalTexto: string
}

type LinhaBase = {
  profissionalNome: string
  cpf: string | null
  cnpj: string | null
  documentoTipo: string | null
  observacoes: string | null
  contratosAtuais: ContratoAtualItem[]
}

type LinhaValor = {
  cpf: string
  cnpj: string
  documentoTipo: string
  observacoes: string
  contratos: ContratoItemEdit[]
}

const inputCls = "rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"

// ─── Linha da tabela: estado local "rascunho" — só commita quando o botão
// único "Salvar tudo" do pai é clicado (D.4) ──────────────────────────────

const LinhaContratoAtual = memo(function LinhaContratoAtual({ linha, table }: { linha: LinhaBase; table: DraftTable }) {
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = useCallback(async (v: LinhaValor) => {
    const cpfValido = validarCpfCnpj(v.cpf)
    const cnpjValido = validarCpfCnpj(v.cnpj)
    if (v.cpf.trim() && !cpfValido) {
      setSaveError("CPF inválido — corrija ou deixe em branco.")
      return false
    }
    if (v.cnpj.trim() && !cnpjValido) {
      setSaveError("CNPJ inválido — corrija ou deixe em branco.")
      return false
    }

    const { ok, error } = await upsertContrato({
      profissional_nome: linha.profissionalNome,
      documento_tipo: v.documentoTipo.trim() || null,
      cpf: v.cpf.trim() || null,
      cnpj: v.cnpj.trim() || null,
      observacoes: v.observacoes.trim() || null,
      contratos: v.contratos
        .filter(it => it.numero.trim() || it.funcao.trim() || it.valorPATexto.trim() || it.valorTotalTexto.trim())
        .map(it => ({
          numero: it.numero.trim(),
          funcao: it.funcao.trim(),
          valorPA: parseNumeroBR(it.valorPATexto) ?? 0,
          vigente: it.vigente,
          modeloFaturamento: it.modeloFaturamento,
          valorTotal: parseNumeroBR(it.valorTotalTexto) ?? 0,
        })),
    })
    setSaveError(error)
    return ok
  }, [linha.profissionalNome])

  const initial = useMemo<LinhaValor>(() => ({
    cpf: linha.cpf ?? "",
    cnpj: linha.cnpj ?? "",
    documentoTipo: linha.documentoTipo ?? "",
    observacoes: linha.observacoes ?? "",
    contratos: linha.contratosAtuais.map(it => ({
      numero: it.numero ?? "",
      funcao: it.funcao ?? "",
      valorPATexto: formatMoedaBRTexto(it.valorPA),
      vigente: it.vigente ?? true,
      modeloFaturamento: it.modeloFaturamento === "banco_horas" ? "banco_horas" : "atendimento",
      valorTotalTexto: formatMoedaBRTexto(it.valorTotal),
    })),
  }), [linha.cpf, linha.cnpj, linha.documentoTipo, linha.observacoes, linha.contratosAtuais])

  const { value, update, status } = useDraftRow(linha.profissionalNome, initial, save, table)

  const updateContrato = (idx: number, patch: Partial<ContratoItemEdit>) => {
    update({ contratos: value.contratos.map((c, i) => (i === idx ? { ...c, ...patch } : c)) })
  }
  const addContrato = () => {
    update({ contratos: [...value.contratos, { numero: "", funcao: "", valorPATexto: "", vigente: true, modeloFaturamento: "atendimento", valorTotalTexto: "" }] })
  }
  const removeContrato = (idx: number) => {
    update({ contratos: value.contratos.filter((_, i) => i !== idx) })
  }

  const documentoPreenchido = !!(value.cpf.trim() || value.cnpj.trim())

  // Uma linha por contrato — se o profissional tiver 2+ contratos, o nome e
  // os dados de documento se repetem em cada linha (mesmo estado "rascunho"
  // compartilhado, só a exibição é por contrato). Sem contrato ainda: 1 linha
  // "vazia" com espaço pra criar o primeiro.
  const rows: Array<ContratoItemEdit | null> = value.contratos.length > 0 ? value.contratos : [null]

  return (
    <>
      {rows.map((c, idx) => {
        const isFirst = idx === 0
        const isLast = idx === rows.length - 1
        return (
          <tr key={idx} className="border-t border-border hover:bg-muted/30 transition-colors align-top">
            <td className="p-2 font-medium text-foreground truncate" title={linha.profissionalNome}>
              <span className="truncate block">{linha.profissionalNome}</span>
              {isFirst && !documentoPreenchido && (
                <span className="inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  doc. pendente
                </span>
              )}
            </td>
            <td className="p-2">
              <input
                value={value.cpf}
                onChange={e => update({ cpf: e.target.value })}
                placeholder="CPF"
                aria-label={`CPF de ${linha.profissionalNome}`}
                className={`${inputCls} w-full font-mono`}
              />
            </td>
            <td className="p-2">
              <input
                value={value.cnpj}
                onChange={e => update({ cnpj: e.target.value })}
                placeholder="CNPJ"
                aria-label={`CNPJ de ${linha.profissionalNome}`}
                className={`${inputCls} w-full font-mono`}
              />
            </td>
            <td className="p-2">
              <input
                value={value.observacoes}
                onChange={e => update({ observacoes: e.target.value })}
                placeholder="—"
                aria-label={`Observações de ${linha.profissionalNome}`}
                className={`${inputCls} w-full`}
              />
            </td>
            <td className="p-2">
              {c ? (
                <input
                  value={c.numero}
                  onChange={e => updateContrato(idx, { numero: e.target.value })}
                  placeholder="Nº do contrato"
                  aria-label={`Número do contrato ${idx + 1} de ${linha.profissionalNome}`}
                  className={`${inputCls} w-full`}
                />
              ) : (
                <span className="text-xs text-muted-foreground">Nenhum contrato ainda</span>
              )}
            </td>
            <td className="p-2">
              {c && (
                <input
                  value={c.funcao}
                  onChange={e => updateContrato(idx, { funcao: e.target.value })}
                  placeholder="Especialidade/Objeto Contratual"
                  aria-label={`Especialidade/Objeto Contratual do contrato ${idx + 1} de ${linha.profissionalNome}`}
                  className={`${inputCls} w-full`}
                />
              )}
            </td>
            <td className="p-2">
              {c && (
                <select
                  value={c.modeloFaturamento}
                  onChange={e => updateContrato(idx, { modeloFaturamento: e.target.value as "atendimento" | "banco_horas" })}
                  aria-label={`Modelo de faturamento do contrato ${idx + 1} de ${linha.profissionalNome}`}
                  className={`${inputCls} w-full`}
                >
                  <option value="atendimento" className="text-foreground bg-white dark:bg-slate-900">Por Atendimento</option>
                  <option value="banco_horas" className="text-foreground bg-white dark:bg-slate-900">Por Banco de Horas</option>
                </select>
              )}
            </td>
            <td className="p-2">
              {c && (
                <div className="relative w-full">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                  {c.modeloFaturamento === "banco_horas" ? (
                    <input
                      value={c.valorTotalTexto}
                      onChange={e => updateContrato(idx, { valorTotalTexto: maskMoedaBR(e.target.value) })}
                      placeholder="Valor total pago"
                      inputMode="numeric"
                      aria-label={`Valor total pago do contrato ${idx + 1} de ${linha.profissionalNome}`}
                      className={`${inputCls} w-full pl-6 pr-1 text-right`}
                    />
                  ) : (
                    <input
                      value={c.valorPATexto}
                      onChange={e => updateContrato(idx, { valorPATexto: maskMoedaBR(e.target.value) })}
                      placeholder="PA"
                      inputMode="numeric"
                      aria-label={`Valor PA do contrato ${idx + 1} de ${linha.profissionalNome}`}
                      className={`${inputCls} w-full pl-6 pr-1 text-right`}
                    />
                  )}
                </div>
              )}
            </td>
            <td className="p-2 text-center">
              {c && (
                <input
                  type="checkbox"
                  checked={c.vigente}
                  onChange={e => updateContrato(idx, { vigente: e.target.checked })}
                  aria-label={`Contrato ${idx + 1} de ${linha.profissionalNome} vigente`}
                  className="rounded border-border"
                />
              )}
            </td>
            <td className="p-2 text-right">
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                {isFirst && <SaveStatusBadge status={status} errorMessage={saveError} />}
                {c && (
                  <button
                    type="button"
                    onClick={() => removeContrato(idx)}
                    className="text-rose-600 dark:text-rose-400 hover:opacity-70 transition-opacity"
                    title="Remover contrato"
                  >
                    <X size={14} />
                  </button>
                )}
                {isLast && (
                  <button
                    type="button"
                    onClick={addContrato}
                    className="text-sky-700 dark:text-sky-400 hover:opacity-70 transition-opacity"
                    title="Adicionar contrato"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
})

// ─── Tela ─────────────────────────────────────────────────────────────────

interface ContratosAtuaisConfigProps {
  onDirtyChange?: (dirty: boolean) => void
  registerSave?: (save: (() => Promise<boolean>) | null) => void
}

export function ContratosAtuaisConfig({ onDirtyChange, registerSave }: ContratosAtuaisConfigProps = {}) {
  const [contratos, setContratos] = useState<ContratoAtual[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [apenasPendentes, setApenasPendentes] = useState(false)
  const { table, dirtyCount, saving, saveAll } = useDraftTable()

  useEffect(() => { onDirtyChange?.(dirtyCount > 0) }, [dirtyCount, onDirtyChange])

  const carregar = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const [{ data: contratosData }, { data: rosterData }] = await Promise.all([
      getContratos(),
      getProfissionaisRoster(),
    ])
    if (contratosData) setContratos(contratosData as ContratoAtual[])
    if (rosterData) setRoster(rosterData)
    if (showLoading) setLoading(false)
  }, [])

  const handleSalvarTudo = useCallback(async () => {
    const { total, ok } = await saveAll()
    if (!total) return true
    const sucesso = ok === total
    if (sucesso) {
      toast.success(`${ok} ${ok === 1 ? "alteração salva" : "alterações salvas"}.`)
      // Recarrega a lista-fonte (sem flash de loading) para que contador/filtro
      // "Sem documento" e os badges reflitam os documentos recém-salvos.
      await carregar(false)
    } else {
      toast.error(`${ok} de ${total} salvas — passe o mouse no "erro" das linhas marcadas para ver o motivo.`)
    }
    return sucesso
  }, [saveAll, carregar])

  useEffect(() => {
    registerSave?.(handleSalvarTudo)
    return () => registerSave?.(null)
  }, [handleSalvarTudo, registerSave])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial via API, sem valor derivável no primeiro render
    carregar()
  }, [carregar])

  const linhas = useMemo<LinhaBase[]>(() => {
    const porNome = new Map(contratos.map(c => [c.profissional_nome, c]))
    const nomes = new Set<string>([...roster, ...contratos.map(c => c.profissional_nome)])
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).map(nome => {
      const c = porNome.get(nome)
      return {
        profissionalNome: nome,
        cpf: c?.cpf ?? null,
        cnpj: c?.cnpj ?? null,
        documentoTipo: c?.documento_tipo ?? null,
        observacoes: c?.observacoes ?? null,
        contratosAtuais: Array.isArray(c?.contratos) ? c!.contratos : [],
      }
    })
  }, [roster, contratos])

  const linhasFiltradas = useMemo(() => {
    let r = linhas
    const q = busca.trim().toLowerCase()
    if (q) r = r.filter(l => l.profissionalNome.toLowerCase().includes(q))
    if (apenasPendentes) r = r.filter(l => !l.cpf && !l.cnpj)
    return r
  }, [linhas, busca, apenasPendentes])

  const pendentesQtd = useMemo(() => linhas.filter(l => !l.cpf && !l.cnpj).length, [linhas])

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg text-foreground">Contratos</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            A calculadora usa os contratos <strong>vigentes</strong> para definir o PA que o prestador deve receber.
            Desmarque &ldquo;Vigente&rdquo; para manter um contrato antigo só como histórico/comparação, sem que ele
            afete o cálculo atual. Edite direto na lista e clique em &ldquo;Salvar tudo&rdquo; para gravar as alterações.
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
              Sem documento
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${apenasPendentes ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                {pendentesQtd}
              </span>
            </button>
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
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[13%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[6%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-2">Profissional</th>
                    <th className="p-2">CPF</th>
                    <th className="p-2">CNPJ</th>
                    <th className="p-2">Observações</th>
                    <th className="p-2">Contrato Nº</th>
                    <th className="p-2 break-words">Especialidade/Objeto Contratual</th>
                    <th className="p-2">Modelo</th>
                    <th className="p-2 text-right">Valor (R$)</th>
                    <th className="p-2 text-center">Vigente</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map(linha => (
                    <LinhaContratoAtual key={linha.profissionalNome} linha={linha} table={table} />
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
