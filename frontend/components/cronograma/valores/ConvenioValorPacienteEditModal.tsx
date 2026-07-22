"use client"

// ConvenioValorPacienteEditModal — CRUD de exceção de valor por paciente
// específico dentro de um convênio (tabela cronograma_convenio_valores_paciente),
// usada quando o convênio negocia valores individuais (ex.: Porto Seguro,
// SulAmérica). Convênio e Paciente SÓ podem ser escolhidos entre valores que
// já existem de fato na agenda real (csv_grades_profissionais) — nunca texto
// livre, pra nunca cadastrar uma exceção que não casa com nenhuma sessão real.

import { useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { criarConvenioValorPaciente, atualizarConvenioValorPaciente, excluirConvenioValorPaciente, type OpcaoPaciente } from "@/services/convenioValores.service"
import type { ConvenioValorPaciente, ConvenioValorPacienteInput } from "@/lib/cronograma/convenioValoresTypes"

interface ConvenioValorPacienteEditModalProps {
  regra: ConvenioValorPaciente | null
  /** Convênios distintos vistos na agenda real — única fonte de opções válidas. */
  conveniosAgenda: string[]
  /** Pacientes distintos vistos na agenda real, com paciente_id — única fonte de opções válidas. */
  pacientesAgenda: OpcaoPaciente[]
  onClose: () => void
  onSaved: () => void
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function ConvenioValorPacienteEditModal({ regra, conveniosAgenda, pacientesAgenda, onClose, onSaved }: ConvenioValorPacienteEditModalProps) {
  const [form, setForm] = useState<ConvenioValorPacienteInput>({
    convenio_nome: regra?.convenio_nome ?? "",
    paciente_id: regra?.paciente_id ?? null,
    paciente_nome: regra?.paciente_nome ?? "",
    valor_sessao: regra?.valor_sessao ?? null,
    observacoes: regra?.observacoes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  function set<K extends keyof ConvenioValorPacienteInput>(key: K, v: ConvenioValorPacienteInput[K]) {
    setForm(prev => ({ ...prev, [key]: v }))
  }

  // Mantém o valor já gravado como opção extra ao editar, mesmo que ele não
  // apareça mais entre as opções atuais da agenda (janela sincronizada mudou).
  const opcoesConvenio = form.convenio_nome && !conveniosAgenda.includes(form.convenio_nome)
    ? [form.convenio_nome, ...conveniosAgenda]
    : conveniosAgenda
  const opcoesPaciente = form.paciente_nome && !pacientesAgenda.some(p => p.nome === form.paciente_nome)
    ? [{ id: form.paciente_id ?? null, nome: form.paciente_nome }, ...pacientesAgenda]
    : pacientesAgenda

  // O <select> só tem o NOME como value — ao trocar, busca o par {id, nome}
  // completo na lista de opções e grava os dois juntos, já que paciente_id é
  // a chave real do cruzamento (paciente_nome é só rótulo, sujeito a typo).
  function handlePacienteChange(nome: string) {
    if (!nome) {
      setForm(prev => ({ ...prev, paciente_nome: "", paciente_id: null }))
      return
    }
    const opcao = opcoesPaciente.find(p => p.nome === nome)
    setForm(prev => ({ ...prev, paciente_nome: nome, paciente_id: opcao?.id ?? null }))
  }

  const valido = form.convenio_nome.trim() !== "" && form.paciente_nome.trim() !== "" && form.valor_sessao !== null

  async function handleSalvar() {
    if (!valido) return
    setSaving(true)
    setError(null)
    try {
      if (regra) await atualizarConvenioValorPaciente(regra.id, form)
      else await criarConvenioValorPaciente(form)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar exceção de valor.")
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
      await excluirConvenioValorPaciente(regra.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir exceção de valor.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScheduleModal
      title={regra ? `Editar exceção — ${regra.paciente_nome}` : "Nova exceção por paciente"}
      subtitle="Sobrescreve, só pra este paciente, qualquer regra geral/por terapia cadastrada pra este convênio. Convênio e Paciente só podem ser escolhidos entre o que já existe na agenda real."
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
        <Campo label="Paciente *" className="col-span-2">
          <select className={INPUT_CLS} value={form.paciente_nome} onChange={e => handlePacienteChange(e.target.value)}>
            <option value="" disabled>Selecione um paciente da agenda...</option>
            {opcoesPaciente.map(p => (
              <option key={p.id ?? p.nome} value={p.nome}>{p.id !== null ? `${p.nome} (ID ${p.id})` : p.nome}</option>
            ))}
          </select>
          {form.paciente_nome && (
            <span className="text-[11px] text-muted-foreground">
              Paciente selecionado: {form.paciente_nome} · ID {form.paciente_id ?? "—"}
              {form.paciente_id === null && " (sem id — o cruzamento vai usar o nome até você reselecionar esse paciente na lista)"}
            </span>
          )}
        </Campo>
        <Campo label="Valor Sessão de 40min (R$) *" className="col-span-2">
          <input
            type="number"
            step="0.01"
            className={INPUT_CLS}
            value={form.valor_sessao ?? ""}
            onChange={e => set("valor_sessao", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="215.00"
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
      {!valido && (form.convenio_nome.trim() !== "" || form.paciente_nome.trim() !== "") && (
        <div className="mt-2 text-[11px] text-muted-foreground">Preencha Convênio, Paciente e Valor Sessão.</div>
      )}
      {error && <div className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {confirmandoExclusao && regra && (
        <ConfirmDialog
          title="Excluir exceção de valor?"
          description={`Excluir a exceção de "${regra.paciente_nome}" (${regra.convenio_nome})? Esta ação não pode ser desfeita.`}
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
