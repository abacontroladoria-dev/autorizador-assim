"use client"

// GerenciarCategoriasModal — CRUD de Núcleo (livre) e edição de rótulo de
// Status (os 3 códigos são fixos, só o texto exibido é editável — ver
// comentário em salas.service.ts/listarStatusLabels sobre por quê). Andar e
// Unidade ficam de fora de propósito: são fixos no código (ver
// SalaEditModal.tsx), não fazem parte deste gerenciamento.

import { useEffect, useState } from "react"
import { Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { ConfirmDialog } from "@/components/cronograma/ui/ConfirmDialog"
import { SegmentedTabs } from "@/components/cronograma/ui/SegmentedTabs"
import {
  listarNucleos, criarNucleo, renomearNucleo, excluirNucleo,
  listarStatusLabels, atualizarStatusLabel,
  type NucleoCadastrado, type StatusLabel, type StatusTone,
} from "@/services/salas.service"
import { TONE_ACCENT, type Tone } from "@/components/cronograma/ui/tones"
import type { SalaStatus } from "@/lib/cronograma/salasTypes"

const TONE_OPCOES: Tone[] = ["green", "amber", "blue", "purple", "red", "slate"]
const TONE_NOME: Record<Tone, string> = { green: "Verde", amber: "Âmbar", blue: "Azul", purple: "Roxo", red: "Vermelho", slate: "Cinza" }

interface Props {
  onClose: () => void
  /** Chamado sempre que algo muda (núcleo criado/renomeado/excluído, ou rótulo de status editado) — quem abriu o modal deve recarregar suas próprias listas dependentes. */
  onChanged: () => void
}

const INPUT_CLS = "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"

export function GerenciarCategoriasModal({ onClose, onChanged }: Props) {
  const [tab, setTab] = useState<"nucleos" | "status">("nucleos")

  return (
    <ScheduleModal title="Gerenciar categorias" subtitle="Núcleo e Status das salas. Andar e Unidade não são editáveis aqui." maxWidth={480} onClose={onClose}>
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        ariaLabel="Categoria a gerenciar"
        tabs={[
          { value: "nucleos", label: "Núcleos" },
          { value: "status", label: "Status" },
        ]}
      />
      <div className="mt-4">
        {tab === "nucleos" ? <NucleosTab onChanged={onChanged} /> : <StatusTab onChanged={onChanged} />}
      </div>
    </ScheduleModal>
  )
}

function NucleosTab({ onChanged }: { onChanged: () => void }) {
  const [nucleos, setNucleos] = useState<NucleoCadastrado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState("")
  const [excluindo, setExcluindo] = useState<NucleoCadastrado | null>(null)

  function carregar() {
    setLoading(true)
    listarNucleos().then(setNucleos).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(carregar, [])

  async function handleAdicionar() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true)
    setError(null)
    try {
      await criarNucleo(nome)
      setNovoNome("")
      carregar()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar núcleo.")
    } finally {
      setSalvando(false)
    }
  }

  async function handleRenomear(id: string) {
    const nome = nomeEdicao.trim()
    if (!nome) return
    setSalvando(true)
    setError(null)
    try {
      await renomearNucleo(id, nome)
      setEditandoId(null)
      carregar()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao renomear núcleo.")
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir() {
    if (!excluindo) return
    setSalvando(true)
    setError(null)
    try {
      await excluirNucleo(excluindo.id)
      setExcluindo(null)
      carregar()
      onChanged()
    } catch {
      setError(`Não foi possível excluir "${excluindo.nome}" — ainda há sala(s) cadastrada(s) com esse núcleo. Reatribua-as antes de excluir.`)
      setExcluindo(null)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          className={INPUT_CLS}
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdicionar() }}
          placeholder="Nome do novo núcleo"
        />
        <button
          type="button"
          onClick={handleAdicionar}
          disabled={salvando || !novoNome.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando...
        </div>
      )}

      {!loading && nucleos.length === 0 && (
        <div className="text-sm text-muted-foreground">Nenhum núcleo cadastrado ainda.</div>
      )}

      <div className="flex flex-col gap-1.5">
        {nucleos.map(n => (
          <div key={n.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
            {editandoId === n.id ? (
              <>
                <input
                  className={INPUT_CLS}
                  value={nomeEdicao}
                  onChange={e => setNomeEdicao(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRenomear(n.id) }}
                  autoFocus
                />
                <button type="button" onClick={() => handleRenomear(n.id)} disabled={salvando} className="shrink-0 rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400">
                  <Save size={14} />
                </button>
                <button type="button" onClick={() => setEditandoId(null)} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-sm text-foreground">{n.nome}</span>
                <button type="button" onClick={() => { setEditandoId(n.id); setNomeEdicao(n.nome) }} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => setExcluindo(n)} className="shrink-0 rounded-md p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {error && <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}

      {excluindo && (
        <ConfirmDialog
          title="Excluir núcleo?"
          description={`Excluir "${excluindo.nome}"? Só é possível se nenhuma sala estiver usando esse núcleo.`}
          confirmLabel="Excluir"
          confirmColor="#dc2626"
          onConfirm={handleExcluir}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}

const STATUS_ORDEM: SalaStatus[] = ["operacional", "bloqueada", "adm", "nti"]

function StatusTab({ onChanged }: { onChanged: () => void }) {
  const [labels, setLabels] = useState<Record<SalaStatus, StatusLabel> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editandoCodigo, setEditandoCodigo] = useState<SalaStatus | null>(null)
  const [form, setForm] = useState<{ label: string; label_curto: string; tone: StatusTone }>({ label: "", label_curto: "", tone: "slate" })
  const [salvando, setSalvando] = useState(false)

  function carregar() {
    listarStatusLabels()
      .then(rows => {
        const map = {} as Record<SalaStatus, StatusLabel>
        rows.forEach(r => { map[r.codigo] = r })
        setLabels(map)
      })
      .catch(e => setError(e.message))
  }

  useEffect(carregar, [])

  async function handleSalvar(codigo: SalaStatus) {
    if (!form.label.trim() || !form.label_curto.trim()) return
    setSalvando(true)
    setError(null)
    try {
      await atualizarStatusLabel(codigo, form)
      setEditandoCodigo(null)
      carregar()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar rótulo.")
    } finally {
      setSalvando(false)
    }
  }

  if (!labels) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">
        Os 4 status são fixos (o cálculo de ocupação depende deles) — só o texto exibido e a cor podem ser editados.
      </div>
      <div className="flex flex-col gap-1.5">
        {STATUS_ORDEM.map(codigo => {
          const l = labels[codigo]
          const editando = editandoCodigo === codigo
          return (
            <div key={codigo} className="flex flex-col gap-2 rounded-lg border border-border px-2.5 py-2">
              {editando ? (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Rótulo (formulário)</span>
                    <input className={INPUT_CLS} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Rótulo curto (filtros/badges)</span>
                    <input className={INPUT_CLS} value={form.label_curto} onChange={e => setForm(f => ({ ...f, label_curto: e.target.value }))} />
                  </label>
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="font-semibold text-muted-foreground">Cor</span>
                    <div className="flex flex-wrap gap-1.5">
                      {TONE_OPCOES.map(tone => (
                        <button
                          key={tone}
                          type="button"
                          title={TONE_NOME[tone]}
                          onClick={() => setForm(f => ({ ...f, tone }))}
                          className={`h-7 w-7 rounded-full border-2 transition-transform ${form.tone === tone ? "scale-110 border-foreground" : "border-transparent"}`}
                          style={{ background: TONE_ACCENT[tone] }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => setEditandoCodigo(null)} className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/50">Cancelar</button>
                    <button
                      type="button"
                      onClick={() => handleSalvar(codigo)}
                      disabled={salvando || !form.label.trim() || !form.label_curto.trim()}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      <Save size={12} /> Salvar
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: TONE_ACCENT[l?.tone ?? "slate"] }} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-foreground">{l?.label ?? codigo}</div>
                    <div className="text-[11px] text-muted-foreground">código: {codigo} · rótulo curto: {l?.label_curto ?? codigo}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditandoCodigo(codigo); setForm({ label: l?.label ?? "", label_curto: l?.label_curto ?? "", tone: l?.tone ?? "slate" }) }}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/60"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {error && <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</div>}
    </div>
  )
}
