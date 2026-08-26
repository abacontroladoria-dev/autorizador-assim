"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Plus, Trash2, FileText, ExternalLink } from "lucide-react"
import toast from "react-hot-toast"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { campo, rotulo, CampoSelect } from "@/components/cadastros/pacientes/ui/campos"
import {
  criarLaudo,
  editarLaudo,
  uploadArquivoLaudo,
  getUrlAssinadaLaudo,
} from "@/services/pacienteLaudos.service"
import { ESP_CLINICO } from "@/lib/cronograma/constants"
import { SearchCombobox } from "@/components/cronograma/ui/SearchCombobox"
import { DatePicker } from "@/components/ui/date-picker"
import type { PacienteLaudo, LaudoForm, LaudoEspecialidadeForm, NivelSuporte } from "@/types/laudos"

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type Props = {
  pacienteId: number
  pacienteNome: string
  /** Quando presente, modo edição. */
  laudo?: PacienteLaudo
  onClose: () => void
  onSalvo: () => void
}

// ─── FORMULÁRIO PADRÃO ────────────────────────────────────────────────────────

function formPadrao(): LaudoForm {
  const hoje = new Date().toISOString().slice(0, 10)
  return {
    data_laudo: hoje,
    validade: "",
    autorizado_em: "",
    arquivo_path: null,
    observacoes: "",
    em_uso: false,
    especialidades: [],
  }
}

function formDeEdicao(laudo: PacienteLaudo): LaudoForm {
  return {
    data_laudo: laudo.data_laudo,
    validade: laudo.validade ?? "",
    autorizado_em: laudo.autorizado_em ?? "",
    arquivo_path: laudo.arquivo_path,
    observacoes: laudo.observacoes ?? "",
    em_uso: laudo.em_uso ?? false,
    especialidades: laudo.especialidades.map((e) => ({
      id: e.id,
      especialidade: e.especialidade,
      qt_laudo: e.qt_laudo !== null ? String(e.qt_laudo) : "",
      qt_autorizacao: e.qt_autorizacao !== null ? String(e.qt_autorizacao) : "",
    })),
  }
}

// ─── COMPONENTE ───────────────────────────────────────────────────────────────

export function LaudoFormModal({ pacienteId, pacienteNome, laudo, onClose, onSalvo }: Props) {
  const modoEdicao = !!laudo
  const [form, setForm] = useState<LaudoForm>(() =>
    laudo ? formDeEdicao(laudo) : formPadrao()
  )
  const [salvando, setSalvando] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [uploadando, setUploadando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Validade calculada para exibição
  const validadeCalculada = (() => {
    if (!form.data_laudo) return ""
    const d = new Date(form.data_laudo + "T12:00:00")
    d.setMonth(d.getMonth() + 6)
    return d.toLocaleDateString("pt-BR")
  })()

  // ─── CAMPOS SIMPLES ─────────────────────────────────────────────────────────

  function set<K extends keyof LaudoForm>(k: K, v: LaudoForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  // ─── ESPECIALIDADES ─────────────────────────────────────────────────────────

  function adicionarEspecialidade() {
    setForm((f) => ({
      ...f,
      especialidades: [
        ...f.especialidades,
        { especialidade: "", qt_laudo: "", qt_autorizacao: "" },
      ],
    }))
  }

  function atualizarEspecialidade(
    idx: number,
    campo: keyof LaudoEspecialidadeForm,
    valor: string
  ) {
    setForm((f) => {
      const esps = [...f.especialidades]
      esps[idx] = { ...esps[idx], [campo]: valor }
      return { ...f, especialidades: esps }
    })
  }

  function removerEspecialidade(idx: number) {
    setForm((f) => ({
      ...f,
      especialidades: f.especialidades.filter((_, i) => i !== idx),
    }))
  }

  // ─── UPLOAD E ARQUIVO ───────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setErroArquivo(null)
    setUploadando(true)
    const { path, error } = await uploadArquivoLaudo(pacienteId, file)
    setUploadando(false)

    if (error || !path) {
      setErroArquivo(error ?? "Erro ao fazer upload.")
      return
    }
    set("arquivo_path", path)
  }

  async function abrirArquivoAtual() {
    if (!form.arquivo_path) return
    const url = await getUrlAssinadaLaudo(form.arquivo_path)
    if (url) {
      window.open(url, "_blank")
    } else {
      toast.error("Não foi possível gerar o link seguro do arquivo.")
    }
  }

  // ─── SALVAR ─────────────────────────────────────────────────────────────────

  async function salvar() {
    if (!form.data_laudo) {
      toast.error("Informe a data do laudo.")
      return
    }
    if (!form.arquivo_path) {
      setErroArquivo("O arquivo do laudo é obrigatório.")
      return
    }

    setSalvando(true)
    let erroMsg: string | null = null

    if (modoEdicao && laudo) {
      const r = await editarLaudo(laudo, pacienteNome, form)
      erroMsg = r.error
    } else {
      const r = await criarLaudo(pacienteId, pacienteNome, form)
      erroMsg = r.error
    }

    setSalvando(false)

    if (erroMsg) {
      toast.error(`Não foi possível salvar: ${erroMsg}`)
      return
    }

    toast.success(modoEdicao ? "Laudo atualizado." : "Laudo criado.")
    onSalvo()
    onClose()
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  const titulo = modoEdicao ? "Editar laudo" : "Novo laudo"

  return (
    <ScheduleModal title={titulo} subtitle={pacienteNome} maxWidth={720} onClose={onClose}>
      <div className="space-y-5">
        {/* ── Datas ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={rotulo}>Data do laudo *</label>
            <DatePicker
              value={form.data_laudo}
              onChange={(v) => set("data_laudo", v)}
            />
          </div>
          <div>
            <label className={rotulo}>Data de validade</label>
            <DatePicker
              value={form.validade}
              onChange={(v) => set("validade", v)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {form.validade
                ? ""
                : `Se vazio, calculado como 6 meses após: ${validadeCalculada || "—"}`}
            </p>
          </div>

          <div>
            <label className={rotulo}>Autorizado em</label>
            <DatePicker
              value={form.autorizado_em}
              onChange={(v) => set("autorizado_em", v)}
              align="right"
            />
            <label className="mt-3 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                checked={form.em_uso}
                onChange={(e) => set("em_uso", e.target.checked)}
              />
              <span className="text-sm font-medium text-foreground">Em uso</span>
            </label>
          </div>
        </div>

        {/* ── Arquivo ── */}
        <div>
          <label className={rotulo}>Arquivo do laudo (PDF ou imagem) *</label>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadando}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {uploadando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {form.arquivo_path ? "Substituir arquivo" : "Selecionar arquivo"}
            </button>

            {form.arquivo_path && (
              <button
                type="button"
                onClick={() => void abrirArquivoAtual()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none"
              >
                <ExternalLink className="h-3 w-3" />
                Ver arquivo atual
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {erroArquivo && (
            <p className="mt-1 text-xs text-destructive">{erroArquivo}</p>
          )}
          {!form.arquivo_path && !erroArquivo && (
            <p className="mt-1 text-xs text-muted-foreground">
              Este campo é obrigatório. Anexe o arquivo do laudo (PDF ou imagem).
            </p>
          )}
        </div>

        {/* ── Observações ── */}
        <div>
          <label className={rotulo}>Observações</label>
          <textarea
            className={`mt-1 ${campo} resize-y`}
            rows={3}
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Observações sobre o laudo"
          />
        </div>


        {/* ── Especialidades ── */}
        <div>
          <div className="mb-2">
            <label className={rotulo}>Especialidades</label>
          </div>

          {form.especialidades.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-6">
              <p className="mb-3 text-xs text-muted-foreground">
                Nenhuma especialidade adicionada.
              </p>
              <button
                type="button"
                onClick={adicionarEspecialidade}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Cabeçalho */}
              <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2">
                <span />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Qt laudo
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Qt autor.
                </span>
                <span />
              </div>

              {form.especialidades.map((e, idx) => {
                const usadas = new Set(form.especialidades.filter((_, i) => i !== idx).map(x => x.especialidade))
                const opcoes = Object.keys(ESP_CLINICO).filter(x => !usadas.has(x))
                return (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px_32px] items-center gap-2">
                  <div>
                    <SearchCombobox
                      value={e.especialidade}
                      onChange={(v) => atualizarEspecialidade(idx, "especialidade", v)}
                      opcoes={opcoes}
                      placeholder="Selecione..."
                      ariaLabel="Especialidade"
                    />
                  </div>
                  <input
                    type="number"
                    className={campo}
                    value={e.qt_laudo}
                    onChange={(ev) =>
                      atualizarEspecialidade(idx, "qt_laudo", ev.target.value)
                    }
                    min={0}
                    placeholder="0"
                  />
                  <input
                    type="number"
                    className={campo}
                    value={e.qt_autorizacao}
                    onChange={(ev) =>
                      atualizarEspecialidade(idx, "qt_autorizacao", ev.target.value)
                    }
                    min={0}
                    placeholder="0"
                  />
                  <button
                    type="button"
                    onClick={() => removerEspecialidade(idx)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Remover especialidade"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                )
              })}
              
              <div className="pt-2">
                <button
                  type="button"
                  onClick={adicionarEspecialidade}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar especialidade
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Ações ── */}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando || uploadando}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {modoEdicao ? "Salvar alterações" : "Criar laudo"}
          </button>
        </div>
      </div>
    </ScheduleModal>
  )
}

// ─── CAMPO SIM/NÃO ────────────────────────────────────────────────────────────

function CampoSimNao({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
  disabled: boolean
}) {
  return (
    <CampoSelect<"sim" | "nao">
      label={label}
      value={value === null ? null : value ? "sim" : "nao"}
      onChange={(v) => onChange(v === "sim" ? true : v === "nao" ? false : null)}
      disabled={disabled}
      opcoes={[
        { valor: "sim", rotulo: "Sim" },
        { valor: "nao", rotulo: "Não" },
      ]}
    />
  )
}

