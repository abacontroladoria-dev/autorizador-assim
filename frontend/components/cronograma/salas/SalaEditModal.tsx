"use client"

// SalaEditModal — CRUD de sala (criar/editar) sobre o shell ScheduleModal.

import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { criarSala, atualizarSala, arquivarSala, listarNucleosDistintos } from "@/services/salas.service"
import { normNumeroSala, sugerirNumerosSalaDisponiveis } from "@/lib/cronograma/salas"
import type { Sala, SalaInput, SalaCapacidade, SalaStatus } from "@/lib/cronograma/salasTypes"

interface SalaEditModalProps {
  sala: Sala | null
  /** Salas já cadastradas (todas as unidades) — usadas para sugerir números livres e avisar de duplicidade antes de tentar salvar. */
  todasSalas: Sala[]
  onClose: () => void
  onSaved: () => void
}

const CAPACIDADE_LABEL: Record<SalaCapacidade, string> = {
  unico: "Único (1 profissional/paciente por vez)",
  duplo: "Duplo (2 simultâneos)",
  multiplo: "Múltiplo (3+ simultâneos)",
}

const STATUS_LABEL: Record<SalaStatus, string> = {
  operacional: "Operacional",
  bloqueada: "Bloqueada",
  adm: "Administrativa (ADM)",
}

/** Unidades reais da operação (mesmo conjunto canônico usado em normalizarUnidadeOcupacao). */
const UNIDADES = ["Realengo", "Fazendinha", "Padre Miguel", "Ambiente Natural"]

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function SalaEditModal({ sala, todasSalas, onClose, onSaved }: SalaEditModalProps) {
  const [nucleos, setNucleos] = useState<string[]>([])

  useEffect(() => {
    listarNucleosDistintos().then(setNucleos).catch(() => {})
  }, [])

  const [form, setForm] = useState<SalaInput>({
    unidade_nome: sala?.unidade_nome ?? "",
    nucleo: sala?.nucleo ?? "",
    andar: sala?.andar ?? "",
    numero_sala: sala?.numero_sala ?? "",
    nome_exibicao: sala?.nome_exibicao ?? "",
    capacidade: sala?.capacidade ?? "unico",
    status: sala?.status ?? "operacional",
    sala_nome_referencia: sala?.sala_nome_referencia ?? "",
    observacoes: sala?.observacoes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  function set<K extends keyof SalaInput>(key: K, v: SalaInput[K]) {
    setForm(prev => ({ ...prev, [key]: v }))
  }

  const andarPreenchido = (form.andar ?? "").trim() !== ""

  /** Números já em uso na mesma unidade + andar (exceto a própria sala, quando editando) — a numeração é por andar, então "Sala 1" do 1º e do 2º andar podem coexistir. */
  const numerosUsadosNoAndar = useMemo(
    () => todasSalas
      .filter(s => s.unidade_nome === form.unidade_nome && (s.andar ?? "") === (form.andar ?? "") && s.id !== sala?.id)
      .map(s => s.numero_sala),
    [todasSalas, form.unidade_nome, form.andar, sala?.id],
  )

  const numerosSugeridos = useMemo(
    () => (form.unidade_nome && andarPreenchido) ? sugerirNumerosSalaDisponiveis(numerosUsadosNoAndar) : [],
    [form.unidade_nome, andarPreenchido, numerosUsadosNoAndar],
  )

  const numeroJaUsado = andarPreenchido && form.numero_sala.trim() !== ""
    && numerosUsadosNoAndar.some(n => normNumeroSala(n) === normNumeroSala(form.numero_sala))

  const valido = form.unidade_nome.trim() && andarPreenchido && form.numero_sala.trim() && form.nome_exibicao.trim() && !numeroJaUsado

  async function handleSalvar() {
    if (!valido) return
    setSaving(true)
    setError(null)
    try {
      if (sala) await atualizarSala(sala.id, form)
      else await criarSala(form)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar sala.")
    } finally {
      setSaving(false)
    }
  }

  async function confirmarExclusao() {
    if (!sala) return
    setConfirmandoExclusao(false)
    setSaving(true)
    setError(null)
    try {
      await arquivarSala(sala.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir sala.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScheduleModal
      title={sala ? `Editar ${sala.nome_exibicao}` : "Nova sala"}
      subtitle="Cadastro estrutural de sala — cruzado automaticamente com a agenda pela referência de nome."
      maxWidth={560}
      onClose={onClose}
      footer={
        <>
          {sala && (
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
        <Campo label="Unidade *">
          <select className={INPUT_CLS} value={form.unidade_nome} onChange={e => set("unidade_nome", e.target.value)}>
            <option value="" disabled>Selecione...</option>
            {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo label="Núcleo">
          <select className={INPUT_CLS} value={form.nucleo ?? ""} onChange={e => set("nucleo", e.target.value)}>
            <option value="">Nenhum</option>
            {nucleos.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Campo>
        <Campo label="Andar *">
          <input
            className={INPUT_CLS}
            value={form.andar ?? ""}
            onChange={e => set("andar", e.target.value)}
            placeholder="1"
          />
        </Campo>
        <Campo label="Número da sala *" className="col-span-2">
          <input
            className={`${INPUT_CLS} ${numeroJaUsado ? "border-rose-400 dark:border-rose-700" : ""}`}
            value={form.numero_sala}
            onChange={e => set("numero_sala", e.target.value)}
            placeholder="3"
          />
          {!andarPreenchido && (
            <span className="text-[11px] text-muted-foreground">
              Preencha o Andar para ver os números livres — a numeração é por andar, não pela unidade inteira.
            </span>
          )}
          {numeroJaUsado && (
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              Já existe uma sala &quot;{form.numero_sala}&quot; em {form.unidade_nome} · {form.andar}º andar. Escolha outro número.
            </span>
          )}
          {!numeroJaUsado && numerosSugeridos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Livres em {form.unidade_nome} · {form.andar}º andar:</span>
              {numerosSugeridos.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set("numero_sala", String(n))}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    normNumeroSala(form.numero_sala) === String(n)
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </Campo>
        <Campo label="Nome de exibição *" className="col-span-2">
          <input className={INPUT_CLS} value={form.nome_exibicao} onChange={e => set("nome_exibicao", e.target.value)} placeholder="Sala 3" />
        </Campo>
        <Campo label="Capacidade *">
          <select className={INPUT_CLS} value={form.capacidade} onChange={e => set("capacidade", e.target.value as SalaCapacidade)}>
            {Object.entries(CAPACIDADE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
        <Campo label="Status">
          <select className={INPUT_CLS} value={form.status} onChange={e => set("status", e.target.value as SalaStatus)}>
            {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
        <Campo label="Referência na agenda (informativo, não afeta o cruzamento)" className="col-span-2">
          <input
            className={INPUT_CLS}
            value={form.sala_nome_referencia ?? ""}
            onChange={e => set("sala_nome_referencia", e.target.value)}
            placeholder="Ex.: Unid. Realengo - Sala 3 — o cruzamento com a agenda usa Unidade + Número da sala acima, não este campo"
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
      {error && <div className="mt-3 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {confirmandoExclusao && sala && (
        <ConfirmDialog
          title="Excluir sala?"
          description={`Excluir a sala "${sala.nome_exibicao}"? Esta ação não pode ser desfeita.`}
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