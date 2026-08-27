"use client"

import { useEffect, useId, useState } from "react"
import { Building2, X } from "lucide-react"
import type { Convenio, ConvenioEdit } from "@/types/convenio"

const CAMPO_VAZIO: ConvenioEdit = {
  nome: "",
  razao_social: null,
  cnpj: null,
  ans: null,
  observacao: null,
  email: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  bairro: null,
  cidade: null,
  uf: null,
}

const campo =
  "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
const rotulo = "mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"

export function ConvenioModal({
  convenio,
  onSalvar,
  onClose,
}: {
  /** Undefined = criar novo. Presente = editar. */
  convenio?: Convenio
  onSalvar: (input: ConvenioEdit) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<ConvenioEdit>(
    convenio
      ? {
          nome: convenio.nome,
          razao_social: convenio.razao_social,
          cnpj: convenio.cnpj,
          ans: convenio.ans,
          observacao: convenio.observacao,
          email: convenio.email,
          telefone: convenio.telefone,
          cep: convenio.cep,
          logradouro: convenio.logradouro,
          numero: convenio.numero,
          bairro: convenio.bairro,
          cidade: convenio.cidade,
          uf: convenio.uf,
        }
      : CAMPO_VAZIO
  )
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const tituloId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const set = <K extends keyof ConvenioEdit>(key: K, value: ConvenioEdit[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const setTexto = (key: keyof ConvenioEdit) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(key, (e.target.value || null) as any)

  const handleSalvar = async () => {
    if (!form.nome.trim()) {
      setErro("Nome é obrigatório.")
      return
    }
    setSaving(true)
    setErro(null)
    try {
      await onSalvar({ ...form, nome: form.nome.trim() })
      onClose()
    } catch (e: any) {
      setErro(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <Building2 size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 id={tituloId} className="flex-1 text-md font-semibold text-foreground">
            {convenio ? "Editar Convênio" : "Criar Convênio"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="convenio-nome" className={rotulo}>Nome</label>
              <input
                id="convenio-nome"
                autoFocus
                type="text"
                maxLength={100}
                value={form.nome}
                onChange={e => set("nome", e.target.value)}
                className={campo}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="convenio-razao-social" className={rotulo}>Razão Social <span className="normal-case font-normal">(opcional)</span></label>
              <input id="convenio-razao-social" type="text" value={form.razao_social ?? ""} onChange={setTexto("razao_social")} className={campo} />
            </div>
            <div>
              <label htmlFor="convenio-cnpj" className={rotulo}>CNPJ <span className="normal-case font-normal">(opcional)</span></label>
              <input id="convenio-cnpj" type="text" value={form.cnpj ?? ""} onChange={setTexto("cnpj")} className={campo} />
            </div>
            <div>
              <label htmlFor="convenio-ans" className={rotulo}>ANS <span className="normal-case font-normal">(opcional)</span></label>
              <input id="convenio-ans" type="text" value={form.ans ?? ""} onChange={setTexto("ans")} className={campo} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="convenio-observacao" className={rotulo}>Observação <span className="normal-case font-normal">(opcional)</span></label>
              <textarea
                id="convenio-observacao"
                rows={3}
                value={form.observacao ?? ""}
                onChange={e => set("observacao", e.target.value || null)}
                className={`${campo} resize-y`}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-foreground">Dados de contato e endereço</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="convenio-email" className={rotulo}>E-mail <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-email" type="email" value={form.email ?? ""} onChange={setTexto("email")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-telefone" className={rotulo}>Telefone <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-telefone" type="text" value={form.telefone ?? ""} onChange={setTexto("telefone")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-cep" className={rotulo}>CEP <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-cep" type="text" value={form.cep ?? ""} onChange={setTexto("cep")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-logradouro" className={rotulo}>Logradouro <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-logradouro" type="text" value={form.logradouro ?? ""} onChange={setTexto("logradouro")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-numero" className={rotulo}>Número <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-numero" type="text" value={form.numero ?? ""} onChange={setTexto("numero")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-bairro" className={rotulo}>Bairro <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-bairro" type="text" value={form.bairro ?? ""} onChange={setTexto("bairro")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-cidade" className={rotulo}>Cidade <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-cidade" type="text" value={form.cidade ?? ""} onChange={setTexto("cidade")} className={campo} />
              </div>
              <div>
                <label htmlFor="convenio-uf" className={rotulo}>UF <span className="normal-case font-normal">(opcional)</span></label>
                <input id="convenio-uf" type="text" maxLength={2} value={form.uf ?? ""} onChange={e => set("uf", (e.target.value.toUpperCase() || null) as any)} className={campo} />
              </div>
            </div>
          </div>

          {erro && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={saving || !form.nome.trim()}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
