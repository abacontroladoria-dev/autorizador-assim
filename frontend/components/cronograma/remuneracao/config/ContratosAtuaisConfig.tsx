"use client"

import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Upload, Search, ListFilter, ChevronDown, ChevronUp, Plus, X } from "lucide-react"
import Papa from "papaparse"
import { B } from "@/lib/cronograma/constants"
import { getContratosAtuais, getProfissionaisRoster, upsertContratoAtual } from "@/services/remuneracao.service"
import { parseNumeroBR, numeroParaTextoBR, validarCpfCnpj } from "@/lib/remuneracao/formatacao"
import { useAutoSaveRow } from "@/hooks/useAutoSaveRow"
import { SaveStatusBadge } from "./SaveStatusBadge"
import type { ContratoAtual, ContratoAtualItem } from "@/types/remuneracao"

type ContratoItemEdit = { numero: string; funcao: string; valorPATexto: string; vigente: boolean }

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

// ─── Linha da tabela: estado local + auto-save por linha (debounce 800ms) ────

const LinhaContratoAtual = memo(function LinhaContratoAtual({ linha }: { linha: LinhaBase }) {
  const [expandido, setExpandido] = useState(false)

  const save = useCallback(async (v: LinhaValor) => {
    const cpfValido = validarCpfCnpj(v.cpf)
    const cnpjValido = validarCpfCnpj(v.cnpj)
    if ((v.cpf.trim() && !cpfValido) || (v.cnpj.trim() && !cnpjValido)) return false

    return upsertContratoAtual({
      profissional_nome: linha.profissionalNome,
      documento_tipo: v.documentoTipo.trim() || null,
      cpf: v.cpf.trim() || null,
      cnpj: v.cnpj.trim() || null,
      observacoes: v.observacoes.trim() || null,
      contratos_atuais: v.contratos
        .filter(it => it.numero.trim() || it.funcao.trim() || it.valorPATexto.trim())
        .map(it => ({
          numero: it.numero.trim(),
          funcao: it.funcao.trim(),
          valorPA: parseNumeroBR(it.valorPATexto) ?? 0,
          vigente: it.vigente,
        })),
    })
  }, [linha.profissionalNome])

  const initial = useMemo<LinhaValor>(() => ({
    cpf: linha.cpf ?? "",
    cnpj: linha.cnpj ?? "",
    documentoTipo: linha.documentoTipo ?? "",
    observacoes: linha.observacoes ?? "",
    contratos: linha.contratosAtuais.map(it => ({
      numero: it.numero ?? "",
      funcao: it.funcao ?? "",
      valorPATexto: numeroParaTextoBR(it.valorPA),
      vigente: it.vigente ?? true,
    })),
  }), [linha.cpf, linha.cnpj, linha.documentoTipo, linha.observacoes, linha.contratosAtuais])

  const { value, update, status } = useAutoSaveRow(initial, save)

  const updateContrato = (idx: number, patch: Partial<ContratoItemEdit>) => {
    update({ contratos: value.contratos.map((c, i) => (i === idx ? { ...c, ...patch } : c)) })
  }
  const addContrato = () => {
    update({ contratos: [...value.contratos, { numero: "", funcao: "", valorPATexto: "", vigente: true }] })
    setExpandido(true)
  }
  const removeContrato = (idx: number) => {
    update({ contratos: value.contratos.filter((_, i) => i !== idx) })
  }

  const contratosVigentes = value.contratos.filter(c => c.vigente).length
  const documentoPreenchido = !!(value.cpf.trim() || value.cnpj.trim())

  return (
    <>
      <tr className="border-t border-border hover:bg-muted/30 transition-colors align-top">
        <td className="p-2.5 font-medium text-foreground whitespace-nowrap">
          {linha.profissionalNome}
          {!documentoPreenchido && (
            <span className="ml-2 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              doc. pendente
            </span>
          )}
        </td>
        <td className="p-2.5">
          <input
            value={value.cpf}
            onChange={e => update({ cpf: e.target.value })}
            placeholder="CPF"
            className={`${inputCls} w-32 font-mono`}
          />
        </td>
        <td className="p-2.5">
          <input
            value={value.cnpj}
            onChange={e => update({ cnpj: e.target.value })}
            placeholder="CNPJ"
            className={`${inputCls} w-36 font-mono`}
          />
        </td>
        <td className="p-2.5">
          <input
            value={value.observacoes}
            onChange={e => update({ observacoes: e.target.value })}
            placeholder="—"
            className={`${inputCls} w-full min-w-[10rem]`}
          />
        </td>
        <td className="p-2.5">
          <button
            type="button"
            onClick={() => setExpandido(v => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground hover:opacity-70 transition-opacity whitespace-nowrap"
          >
            {expandido ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {value.contratos.length} contrato{value.contratos.length !== 1 ? "s" : ""}
            {contratosVigentes > 0 ? ` · ${contratosVigentes} vigente${contratosVigentes !== 1 ? "s" : ""}` : ""}
          </button>
        </td>
        <td className="p-2.5 text-right"><SaveStatusBadge status={status} /></td>
      </tr>

      {expandido && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={6} className="p-3">
            <div className="space-y-2">
              {value.contratos.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum contrato cadastrado ainda.</p>
              )}
              {value.contratos.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 flex-wrap bg-card border border-border rounded-lg p-2">
                  <input
                    value={c.numero}
                    onChange={e => updateContrato(idx, { numero: e.target.value })}
                    placeholder="Nº do contrato"
                    className={`${inputCls} w-40`}
                  />
                  <input
                    value={c.funcao}
                    onChange={e => updateContrato(idx, { funcao: e.target.value })}
                    placeholder="Função (AC/PS/outra)"
                    className={`${inputCls} w-36`}
                  />
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                    <input
                      value={c.valorPATexto}
                      onChange={e => updateContrato(idx, { valorPATexto: e.target.value })}
                      placeholder="PA"
                      inputMode="decimal"
                      className={`${inputCls} w-full pl-7 text-right`}
                    />
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={c.vigente}
                      onChange={e => updateContrato(idx, { vigente: e.target.checked })}
                      className="rounded border-border"
                    />
                    vigente
                  </label>
                  <button
                    type="button"
                    onClick={() => removeContrato(idx)}
                    className="ml-auto text-rose-600 dark:text-rose-400 hover:opacity-70 transition-opacity"
                    title="Remover contrato"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addContrato}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 hover:opacity-70 transition-opacity"
              >
                <Plus size={13} /> Adicionar contrato
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
})

// ─── Tela ─────────────────────────────────────────────────────────────────

export function ContratosAtuaisConfig() {
  const [contratos, setContratos] = useState<ContratoAtual[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busca, setBusca] = useState("")
  const [apenasPendentes, setApenasPendentes] = useState(false)

  const carregar = async () => {
    setLoading(true)
    const [{ data: contratosData }, { data: rosterData }] = await Promise.all([
      getContratosAtuais(),
      getProfissionaisRoster(),
    ])
    if (contratosData) setContratos(contratosData as ContratoAtual[])
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
        cpf: c?.cpf ?? null,
        cnpj: c?.cnpj ?? null,
        documentoTipo: c?.documento_tipo ?? null,
        observacoes: c?.observacoes ?? null,
        contratosAtuais: Array.isArray(c?.contratos_atuais) ? c!.contratos_atuais : [],
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

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-bold text-lg" style={{ color: B.navy }}>Cadastros de contratos atuais</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            A calculadora usa estes contratos vigentes para definir o PA que o prestador deve receber caso ele
            substitua ou preste horas. Edite direto na lista — cada campo salva sozinho ao parar de digitar.
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
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum profissional encontrado.</div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5">Profissional</th>
                    <th className="p-2.5">CPF</th>
                    <th className="p-2.5">CNPJ</th>
                    <th className="p-2.5">Observações</th>
                    <th className="p-2.5">Contratos vigentes</th>
                    <th className="p-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.map(linha => (
                    <LinhaContratoAtual key={linha.profissionalNome} linha={linha} />
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
