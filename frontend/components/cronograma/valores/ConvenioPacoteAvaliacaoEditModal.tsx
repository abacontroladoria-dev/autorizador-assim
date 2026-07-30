"use client"

// ConvenioPacoteAvaliacaoEditModal — CRUD do valor das terapias de
// TERAPIAS_PACOTE (Avaliação Neuropsicológica / Psiquiatra-Neurologista) por
// convênio (tabela cronograma_convenio_pacote_avaliacao). Diferente da regra
// de valor_sessao: aqui é um valor por convênio + terapia, cobrado uma vez
// por paciente que tiver aquela terapia no cronograma — não por sessão (ex.:
// o pacote de Avaliação Neuropsicológica tem de 8 a 10 sessões, a quantidade
// exata não importa pro valor cobrado). Convênio só pode ser escolhido entre
// o que já existe na agenda real, mesmo padrão dos outros cadastros.

import { useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { criarConvenioPacoteAvaliacao, atualizarConvenioPacoteAvaliacao, excluirConvenioPacoteAvaliacao } from "@/services/convenioValores.service"
import { TERAPIAS_PACOTE, type ConvenioPacoteAvaliacao, type ConvenioPacoteAvaliacaoInput } from "@/lib/cronograma/convenioValoresTypes"

interface ConvenioPacoteAvaliacaoEditModalProps {
  regra: ConvenioPacoteAvaliacao | null
  /** Convênios distintos vistos na agenda real — única fonte de opções válidas. */
  conveniosAgenda: string[]
  onClose: () => void
  onSaved: () => void
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function ConvenioPacoteAvaliacaoEditModal({ regra, conveniosAgenda, onClose, onSaved }: ConvenioPacoteAvaliacaoEditModalProps) {
  const [convenioNome, setConvenioNome] = useState(regra?.convenio_nome ?? "")
  const [terapiaId, setTerapiaId] = useState<number | null>(regra?.terapia_id ?? TERAPIAS_PACOTE[0].terapia_id)
  const [valorAVista, setValorAVista] = useState<number | null>(regra?.valor_a_vista ?? null)
  const [valorParcelado, setValorParcelado] = useState<number | null>(regra?.valor_parcelado ?? null)
  const [observacoes, setObservacoes] = useState(regra?.observacoes ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const opcoesConvenio = convenioNome && !conveniosAgenda.includes(convenioNome)
    ? [convenioNome, ...conveniosAgenda]
    : conveniosAgenda

  const terapiaSelecionada = TERAPIAS_PACOTE.find(t => t.terapia_id === terapiaId)
  const valido = convenioNome.trim() !== "" && terapiaId !== null && valorAVista !== null && valorAVista > 0

  async function handleSalvar() {
    if (!valido || terapiaId === null || valorAVista === null || !terapiaSelecionada) return
    setSaving(true)
    setError(null)
    try {
      const payload: ConvenioPacoteAvaliacaoInput = {
        convenio_nome: convenioNome,
        terapia_id: terapiaId,
        terapia_nome: terapiaSelecionada.terapia_nome,
        valor_a_vista: valorAVista,
        valor_parcelado: valorParcelado,
        observacoes: observacoes.trim() || null,
      }
      if (regra) await atualizarConvenioPacoteAvaliacao(regra.id, payload)
      else await criarConvenioPacoteAvaliacao(payload)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar valor.")
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
      await excluirConvenioPacoteAvaliacao(regra.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir valor.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScheduleModal
      title={regra ? `Editar valor — ${regra.convenio_nome} · ${regra.terapia_nome}` : "Novo valor por terapia"}
      subtitle="Valor cobrado UMA vez por paciente com essa terapia no cronograma — não é por sessão. Valor à vista entra na Previsão de Receitas; valor parcelado é só referência."
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
          <select className={INPUT_CLS} value={convenioNome} onChange={e => setConvenioNome(e.target.value)}>
            <option value="" disabled>Selecione um convênio da agenda...</option>
            {opcoesConvenio.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Terapia *" className="col-span-2">
          <select className={INPUT_CLS} value={terapiaId ?? ""} onChange={e => setTerapiaId(Number(e.target.value))}>
            {TERAPIAS_PACOTE.map(t => (
              <option key={t.terapia_id} value={t.terapia_id}>{t.terapia_nome} (ID {t.terapia_id})</option>
            ))}
          </select>
        </Campo>
        <Campo label="Valor à vista (R$) *">
          <input
            type="number"
            step="0.01"
            className={INPUT_CLS}
            value={valorAVista ?? ""}
            onChange={e => setValorAVista(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="800.00"
          />
        </Campo>
        <Campo label="Valor parcelado (R$)">
          <input
            type="number"
            step="0.01"
            className={INPUT_CLS}
            value={valorParcelado ?? ""}
            onChange={e => setValorParcelado(e.target.value === "" ? null : Number(e.target.value))}
            placeholder="900.00"
          />
        </Campo>
        <Campo label="Observações" className="col-span-2">
          <textarea
            className={`${INPUT_CLS} min-h-[64px] resize-y`}
            value={observacoes ?? ""}
            onChange={e => setObservacoes(e.target.value)}
          />
        </Campo>
      </div>
      {error && <div className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {confirmandoExclusao && regra && (
        <ConfirmDialog
          title="Excluir valor?"
          description={`Excluir o valor de "${regra.terapia_nome}" pra "${regra.convenio_nome}"? Esta ação não pode ser desfeita.`}
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
