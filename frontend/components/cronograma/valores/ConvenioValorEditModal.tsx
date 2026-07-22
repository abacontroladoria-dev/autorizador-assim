"use client"

// ConvenioValorEditModal — CRUD de regra de valor por convênio. Uma linha de
// cronograma_convenio_valores é sempre um dos 3 tipos abaixo (mutuamente
// exclusivos):
// - Geral: vale pra qualquer sessão do convênio.
// - Por terapia: vale só pra uma terapia específica (terapia_id) dentro do
//   convênio (ex.: ASSIM Saúde tem valor diferente por terapia).
// - Por critério ABA: vale pra TODAS as sessões do paciente nesse convênio,
//   dependendo só de o cronograma dele conter Psicologia ABA ou não (ex.:
//   SEGUROS UNIMED: com ABA = R$170, sem ABA = R$135, não importa a terapia
//   específica de cada sessão).
// Convênio e Terapia SÓ podem ser escolhidos entre valores que já existem de
// fato na agenda real (csv_grades_profissionais, via useConvenioValores) —
// nunca texto livre, pra nunca cadastrar uma regra que não casa com nenhuma
// sessão real.

import { useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { criarConvenioValor, atualizarConvenioValor, excluirConvenioValor, type OpcaoTerapia } from "@/services/convenioValores.service"
import type { ConvenioValor, ConvenioValorInput, CriterioAba } from "@/lib/cronograma/convenioValoresTypes"

interface ConvenioValorEditModalProps {
  regra: ConvenioValor | null
  /** Convênios distintos vistos na agenda real — única fonte de opções válidas. */
  conveniosAgenda: string[]
  /** Terapias (ação) distintas vistas na agenda real, com terapia_id — única fonte de opções válidas. */
  terapiasAgenda: OpcaoTerapia[]
  onClose: () => void
  onSaved: () => void
}

type TipoRegra = "geral" | "terapia" | "aba"

function tipoInicial(regra: ConvenioValor | null): TipoRegra {
  if (regra?.criterio_aba) return "aba"
  if (regra?.terapia_id !== null && regra?.terapia_id !== undefined) return "terapia"
  if (regra?.terapia_nome) return "terapia"
  return "geral"
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function ConvenioValorEditModal({ regra, conveniosAgenda, terapiasAgenda, onClose, onSaved }: ConvenioValorEditModalProps) {
  const [tipo, setTipo] = useState<TipoRegra>(() => tipoInicial(regra))
  const [form, setForm] = useState<ConvenioValorInput>({
    convenio_nome: regra?.convenio_nome ?? "",
    terapia_id: regra?.terapia_id ?? null,
    terapia_nome: regra?.terapia_nome ?? "",
    criterio_aba: regra?.criterio_aba ?? null,
    valor_sessao: regra?.valor_sessao ?? null,
    observacoes: regra?.observacoes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  function set<K extends keyof ConvenioValorInput>(key: K, v: ConvenioValorInput[K]) {
    setForm(prev => ({ ...prev, [key]: v }))
  }

  // Trocar o tipo de regra limpa os campos dos outros tipos — uma linha nunca
  // tem terapia_id E criterio_aba preenchidos ao mesmo tempo.
  function handleTipoChange(novoTipo: TipoRegra) {
    setTipo(novoTipo)
    setForm(prev => ({
      ...prev,
      terapia_id: novoTipo === "terapia" ? prev.terapia_id : null,
      terapia_nome: novoTipo === "terapia" ? prev.terapia_nome : null,
      criterio_aba: novoTipo === "aba" ? (prev.criterio_aba ?? "com_aba") : null,
    }))
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

  const valido = form.convenio_nome.trim() !== "" && form.valor_sessao !== null

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
      subtitle="Geral (todo o convênio), por terapia específica, ou por critério ABA (vale pra todas as sessões do paciente, conforme o cronograma dele conter Psicologia ABA ou não)."
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
        <Campo label="Tipo de regra" className="col-span-2">
          <select className={INPUT_CLS} value={tipo} onChange={e => handleTipoChange(e.target.value as TipoRegra)}>
            <option value="geral">Geral (todas as sessões do convênio)</option>
            <option value="terapia">Por terapia específica</option>
            <option value="aba">Por critério ABA (cronograma do paciente contém Psicologia ABA?)</option>
          </select>
        </Campo>
        {tipo === "terapia" && (
          <Campo label="Terapia *" className="col-span-2">
            <select className={INPUT_CLS} value={form.terapia_nome ?? ""} onChange={e => handleTerapiaChange(e.target.value)}>
              <option value="" disabled>Selecione uma terapia da agenda...</option>
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
        )}
        {tipo === "aba" && (
          <Campo label="Critério *" className="col-span-2">
            <select
              className={INPUT_CLS}
              value={form.criterio_aba ?? "com_aba"}
              onChange={e => set("criterio_aba", e.target.value as CriterioAba)}
            >
              <option value="com_aba">Paciente TEM Psicologia ABA no cronograma</option>
              <option value="sem_aba">Paciente NÃO TEM Psicologia ABA no cronograma</option>
            </select>
            <span className="text-[11px] text-muted-foreground">
              Vale pra todas as sessões do paciente nesse convênio (qualquer terapia), com base no cronograma inteiro dele na semana de referência.
            </span>
          </Campo>
        )}
        <Campo label="Valor Sessão de 40min (R$) *" className="col-span-2">
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
        <div className="mt-2 text-[11px] text-muted-foreground">Preencha o Valor Sessão.</div>
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
