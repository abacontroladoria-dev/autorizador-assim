"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, ExternalLink, FileText, Loader2, Plus, Save, Trash2, CalendarDays } from "lucide-react"
import toast from "react-hot-toast"
import {
  getAltaIndividualidade,
  salvarAltaIndividualidade,
  getAltasDoPaciente,
  criarAlta,
  excluirAlta,
  uploadArquivoAlta,
  getUrlAssinadaAlta,
} from "@/services/pacienteAltaIndividualidade.service"
import { campo, rotulo, CampoSelect } from "@/components/cadastros/pacientes/ui/campos"
import { ESP_CLINICO } from "@/lib/cronograma/constants"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { SearchCombobox } from "@/components/cronograma/ui/SearchCombobox"
import { DatePicker } from "@/components/ui/date-picker"
import type { AltaIndividualidade, AltaIndividualidadeForm, NivelSuporte, PacienteAlta, PacienteAltaForm } from "@/types/laudos"

type Props = {
  pacienteId: number
  pacienteNome: string
}

function dataBR(isoStr: string) {
  if (!isoStr) return ""
  const [y, m, d] = isoStr.split("-")
  if (!y || !m || !d) return isoStr
  return `${d}/${m}/${y}`
}

function formVazio(): AltaIndividualidadeForm {
  return {
    comp_agressivo: null,
    paciente_verbal: null,
    ambiente_natural: null,
    nivel_suporte: null,
  }
}

function formDeDados(dados: AltaIndividualidade): AltaIndividualidadeForm {
  return {
    comp_agressivo: dados.comp_agressivo,
    paciente_verbal: dados.paciente_verbal,
    ambiente_natural: dados.ambiente_natural,
    nivel_suporte: dados.nivel_suporte,
  }
}

export function AbaAltasIndividualidades({ pacienteId, pacienteNome }: Props) {
  const [dados, setDados] = useState<AltaIndividualidade | null>(null)
  const [altas, setAltas] = useState<PacienteAlta[]>([])
  const [form, setForm] = useState<AltaIndividualidadeForm>(formVazio)
  
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<number | null>(null)
  
  const [modalAberto, setModalAberto] = useState(false)
  const [abrindoLink, setAbrindoLink] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [resIndiv, resAltas] = await Promise.all([
      getAltaIndividualidade(pacienteId),
      getAltasDoPaciente(pacienteId)
    ])
    
    setDados(resIndiv.data)
    setForm(resIndiv.data ? formDeDados(resIndiv.data) : formVazio())
    setAltas(resAltas.data)
    setErro(resIndiv.error || resAltas.error)
    setCarregando(false)
  }, [pacienteId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function set<K extends keyof AltaIndividualidadeForm>(
    k: K,
    v: AltaIndividualidadeForm[K]
  ) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function salvarIndiv() {
    setSalvando(true)
    const { error } = await salvarAltaIndividualidade(
      pacienteId,
      pacienteNome,
      form,
      dados
    )
    setSalvando(false)

    if (error) {
      toast.error(`Não foi possível salvar: ${error}`)
      return
    }
    toast.success("Informações adicionais salvas.")
    void carregar()
  }

  async function confirmarExclusao(alta: PacienteAlta) {
    if (!window.confirm("Excluir esta alta? Ela sai da lista, mas o registro é preservado e a ação fica no histórico.")) {
      return
    }
    setExcluindo(alta.id_alta)
    const { error } = await excluirAlta(pacienteId, pacienteNome, alta)
    setExcluindo(null)
    if (error) {
      toast.error(`Erro ao excluir: ${error}`)
      return
    }
    toast.success("Alta excluída. O registro ficou no histórico.")
    void carregar()
  }

  async function abrirArquivo(alta: PacienteAlta) {
    if (!alta.arquivo_alta_path) return
    setAbrindoLink(alta.id_alta)
    const url = await getUrlAssinadaAlta(alta.arquivo_alta_path)
    setAbrindoLink(null)
    if (url) {
      window.open(url, "_blank")
    } else {
      toast.error("Não foi possível acessar o arquivo.")
    }
  }

  if (carregando) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-w-0 flex-1">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Não foi possível carregar os dados. {erro}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 space-y-6">
      {/* ── Informações adicionais ── */}
      <section className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">
          Informações adicionais
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSimNao
            label="Comportamento agressivo?"
            value={form.comp_agressivo}
            onChange={(v) => set("comp_agressivo", v)}
            disabled={salvando}
          />
          <CampoSimNao
            label="Paciente verbal?"
            value={form.paciente_verbal}
            onChange={(v) => set("paciente_verbal", v)}
            disabled={salvando}
          />
          <CampoSimNao
            label="Autorização de ambiente natural?"
            value={form.ambiente_natural}
            onChange={(v) => set("ambiente_natural", v)}
            disabled={salvando}
          />
          <CampoSelect<NivelSuporte>
            label="Nível de suporte clínico"
            value={form.nivel_suporte}
            onChange={(v) => set("nivel_suporte", v)}
            disabled={salvando}
            opcoes={[
              { valor: "1", rotulo: "1" },
              { valor: "2", rotulo: "2" },
              { valor: "3", rotulo: "3" },
              { valor: "NA", rotulo: "NA" },
            ]}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void salvarIndiv()}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </section>

      {/* ── Lista de Altas ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Altas Registradas</h2>
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
            Adicionar alta
          </button>
        </div>

        {altas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma alta registrada.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {altas.map((alta) => (
              <li
                key={alta.id_alta}
                className={`flex h-full flex-col rounded-lg border border-border bg-card px-4 py-4 shadow-sm ${
                  alta.ativo ? "" : "opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          Alta em {alta.especialidade_alta}
                        </p>
                        {!alta.ativo && (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                            Excluída
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Data da alta: {dataBR(alta.data_alta)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                  {alta.arquivo_alta_path && (
                    <button
                      type="button"
                      onClick={() => void abrirArquivo(alta)}
                      disabled={abrindoLink === alta.id_alta}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      title="Ver arquivo da alta"
                    >
                      {abrindoLink === alta.id_alta ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {/* Excluir só faz sentido em alta ativa — uma já excluída
                      está no estado final. */}
                  {alta.ativo && (
                    <button
                      type="button"
                      onClick={() => void confirmarExclusao(alta)}
                      disabled={excluindo === alta.id_alta}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Excluir alta"
                    >
                      {excluindo === alta.id_alta ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalAberto && (
        <AltaFormModal 
          pacienteId={pacienteId}
          pacienteNome={pacienteNome}
          // Só a especialidade de alta ATIVA bloqueia repetição — uma alta
          // excluída não deve impedir registrar outra na mesma especialidade.
          altasUsadas={altas.filter(a => a.ativo).map(a => a.especialidade_alta)}
          onClose={() => setModalAberto(false)}
          onSalvo={() => {
            setModalAberto(false)
            void carregar()
          }}
        />
      )}
    </div>
  )
}

// ─── MODAL NOVA ALTA ─────────────────────────────────────────────────────────

function AltaFormModal({
  pacienteId,
  pacienteNome,
  altasUsadas,
  onClose,
  onSalvo
}: {
  pacienteId: number
  pacienteNome: string
  altasUsadas: string[]
  onClose: () => void
  onSalvo: () => void
}) {
  const [form, setForm] = useState<PacienteAltaForm>({
    data_alta: new Date().toISOString().slice(0, 10),
    especialidade_alta: "",
    arquivo_alta_path: null
  })
  const [salvando, setSalvando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function set<K extends keyof PacienteAltaForm>(k: K, v: PacienteAltaForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErroArquivo(null)
    setUploadando(true)
    const { path, error } = await uploadArquivoAlta(pacienteId, file)
    setUploadando(false)
    if (error || !path) {
      setErroArquivo(error ?? "Erro ao fazer upload.")
      return
    }
    set("arquivo_alta_path", path)
  }

  async function salvar() {
    if (!form.data_alta || !form.especialidade_alta) {
      toast.error("Preencha a data e a especialidade.")
      return
    }
    setSalvando(true)
    const { error } = await criarAlta(pacienteId, pacienteNome, form)
    setSalvando(false)

    if (error) {
      toast.error(`Não foi possível salvar: ${error}`)
      return
    }
    toast.success("Alta cadastrada com sucesso!")
    onSalvo()
  }

  return (
    <ScheduleModal onClose={onClose} title="Nova Alta">
      <div className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={rotulo}>Data da alta *</label>
            <DatePicker
              value={form.data_alta}
              onChange={(v) => set("data_alta", v)}
            />
          </div>
          <div>
            <label className={rotulo}>Especialidade da alta *</label>
            <div className="mt-1">
              <SearchCombobox
                value={form.especialidade_alta}
                onChange={(v) => set("especialidade_alta", v)}
                opcoes={Object.keys(ESP_CLINICO).filter(x => !altasUsadas.includes(x))}
                placeholder="Selecione..."
                ariaLabel="Especialidade da alta"
              />
            </div>
          </div>
        </div>

        <div>
          <label className={rotulo}>Anexo da alta (PDF ou imagem)</label>
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
              {form.arquivo_alta_path ? "Substituir arquivo selecionado" : "Selecionar arquivo"}
            </button>
            {form.arquivo_alta_path && (
              <span className="text-xs font-medium text-emerald-600">Arquivo anexado</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {erroArquivo && <p className="mt-1 text-xs text-destructive">{erroArquivo}</p>}
        </div>

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
            Salvar alta
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
  disabled?: boolean
}) {
  return (
    <CampoSelect<"sim" | "nao">
      label={label}
      value={value === null ? null : value ? "sim" : "nao"}
      onChange={(v) => onChange(v === "sim" ? true : v === "nao" ? false : null)}
      opcoes={[
        { valor: "sim", rotulo: "Sim" },
        { valor: "nao", rotulo: "Não" },
      ]}
      disabled={!!disabled}
    />
  )
}
