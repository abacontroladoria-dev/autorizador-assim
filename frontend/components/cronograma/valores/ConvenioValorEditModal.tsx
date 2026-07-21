"use client"

// ConvenioValorEditModal — CRUD de regra de valor por convênio (geral, quando
// Terapia fica em branco, ou específica por terapia dentro do convênio —
// mesma tabela cronograma_convenio_valores, ver ConvenioValor.terapia_nome).
// Convênio e Terapia SÓ podem ser escolhidos entre valores que já existem de
// fato na agenda real (csv_grades_profissionais, via useConvenioValores) —
// nunca texto livre, pra nunca cadastrar uma regra que não casa com nenhuma
// sessão real.

import { useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { criarConvenioValor, atualizarConvenioValor, excluirConvenioValor, type OpcaoTerapia } from "@/services/convenioValores.service"
import type { ConvenioValor, ConvenioValorInput } from "@/lib/cronograma/convenioValoresTypes"

interface ConvenioValorEditModalProps {
  regra: ConvenioValor | null
  /** Convênios distintos vistos na agenda real — única fonte de opções válidas. */
  conveniosAgenda: string[]
  /** Terapias (ação) distintas vistas na agenda real, com terapia_id — única fonte de opções válidas. */
  terapiasAgenda: OpcaoTerapia[]
  onClose: () => void
  onSaved: () => void
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function ConvenioValorEditModal({ regra, conveniosAgenda, terapiasAgenda, onClose, onSaved }: ConvenioValorEditModalProps) {
  const [form, setForm] = useState<ConvenioValorInput>({
    convenio_nome: regra?.convenio_nome ?? "",
    terapia_id: regra?.terapia_id ?? null,
    terapia_nome: regra?.terapia_nome ?? "",
    valor_hora: regra?.valor_hora ?? null,
    valor_sessao: regra?.valor_sessao ?? null,
    observacoes: regra?.observacoes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  function set<K extends keyof ConvenioValorInput>(key: K, v: ConvenioValorInput[K]) {
    setForm(prev => ({ ...prev, [key]: v }))
  }

  // Ao editar uma regra cujo convênio/terapia não aparece mais entre as opções
  // atuais da agenda (janela sincronizada mudou), mantém o valor já gravado
  // como opção extra — não força perder o cadastro por causa disso.
  const opcoesConvenio = form.convenio_nome && !conveniosAgenda.includes(form.convenio_nome)
    ? [form.convenio_nome, ...conveniosAgenda]
    : conveniosAgenda
  const opcoesTerapia = form.terapia_nome && !terapiasAgenda.some(t => t.nome === form.terapia_nome)
    ? [{ id: form.terapia_id ?? null, nome: form.terapia_nome }, ...terapiasAgenda]
    : terapiasAgenda

  // O <select> só tem o NOME como value (HTML não aceita objeto) — ao trocar,
  // busca o par {id, nome} completo na lista de opções e grava os dois juntos,
  // já que terapia_id é a chave real do cruzamento (terapia_nome é só rótulo).
  function handleTerapiaChange(nome: string) {
    if (!nome) {
      setForm(prev => ({ ...prev, terapia_nome: null, terapia_id: null }))
      return
    }
    const opcao = opcoesTerapia.find(t => t.nome === nome)
    setForm(prev => ({ ...prev, terapia_nome: nome, terapia_id: opcao?.id ?? null }))
  }

  const valido = form.convenio_nome.trim() !== "" && (form.valor_hora !== null || form.valor_sessao !== null)

  async function handleSalvar() {
    if (!valido) return
    setSaving(true)
    setError(null)
    try {
      const payload: ConvenioValorInput = { ...form, terapia_nome: form.terapia_nome?.trim() || null }
      if (regra) await atualizarConvenioValor(regra.id, payload)
      else await criarConvenioValor(payload)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar regra de valor.")
    } finally {
      setSaving(false)
    }
  }

  async function confirmarExclusao() {
    if (!regra) return
    setConfirmandoExclusao(false)
    setSaving(true)
    setError(null)
    try {
      await excluirConvenioValor(regra.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir regra de valor.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScheduleModal
      title={regra ? `Editar valor — ${regra.convenio_nome}` : "Nova regra de valor"}
      subtitle="Regra geral do convênio (deixe Terapia em branco) ou específica de uma terapia dentro dele. Convênio e Terapia só podem ser escolhidos entre o que já existe na agenda real."
      maxWidth={480}
      onClose={onClose}
      footer={
        <>
          {regra && (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-400"
            >
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted/50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={saving || !valido}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Convênio *" className="col-span-2">
          <select className={INPUT_CLS} value={form.convenio_nome} onChange={e => set("convenio_nome", e.target.value)}>
            <option value="" disabled>Selecione um convênio da agenda...</option>
            {opcoesConvenio.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Terapia (vazio = regra geral do convênio)" className="col-span-2">
          <select className={INPUT_CLS} value={form.terapia_nome ?? ""} onChange={e => handleTerapiaChange(e.target.value)}>
            <option value="">— Regra geral (todas as terapias) —</option>
            {opcoesTerapia.map(t => (
              <option key={t.nome} value={t.nome}>{t.id !== null ? `${t.nome} (ID ${t.id})` : t.nome}</option>
            ))}
          </select>
          {form.terapia_nome && (
            <span className="text-[11px] text-muted-foreground">
              Terapia selecionada: {form.terapia_nome} · ID {form.terapia_id ?? "—"}
              {form.terapia_id === null && " (sem id — o cruzamento vai usar o nome até você reselecionar essa terapia na lista)"}
            </span>
          )}
        </Campo>
        <Campo label="Valor Hora (R$)">
          <input
            type="number"
            step="0.01"
            className={INPUT_CLS}
            value={form.valor_hora ?? ""}
            onChange={e => set("valor_hora", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="225.00"
          />
        </Campo>
        <Campo label="Valor Sessão de 40min (R$)">
          <input
            type="number"
            step="0.01"
            className={INPUT_CLS}
            value={form.valor_sessao ?? ""}
            onChange={e => set("valor_sessao", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="150.00"
          />
        </Campo>
        <Campo label="Observações" className="col-span-2">
          <textarea
            className={`${INPUT_CLS} min-h-[64px] resize-y`}
            value={form.observacoes ?? ""}
            onChange={e => set("observacoes", e.target.value)}
          />
        </Campo>
      </div>
      {!valido && form.convenio_nome.trim() !== "" && (
        <div className="mt-2 text-[11px] text-muted-foreground">Preencha Valor Hora e/ou Valor Sessão.</div>
      )}
      {error && <div className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {confirmandoExclusao && regra && (
        <ConfirmDialog
          title="Excluir regra de valor?"
          description={`Excluir a regra de "${regra.convenio_nome}"${regra.terapia_nome ? ` (${regra.terapia_nome})` : ""}? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          confirmColor="#dc2626"
          onConfirm={confirmarExclusao}
          onCancel={() => setConfirmandoExclusao(false)}
        />
      )}
    </ScheduleModal>
  )
}

function Campo({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${className}`}>
      <span className="font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
