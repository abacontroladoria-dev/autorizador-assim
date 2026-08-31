"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, CalendarDays, Edit2, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react"
import toast from "react-hot-toast"
import { getLaudosDoPaciente, excluirLaudo, getUrlAssinadaLaudo } from "@/services/pacienteLaudos.service"
import { LaudoFormModal } from "./LaudoFormModal"
import type { PacienteLaudo } from "@/types/laudos"

type Props = {
  pacienteId: number
  pacienteNome: string
}

const SIT_CLASSE: Record<string, string> = {
  Vigente: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  Vencido: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400",
}

function dataBR(iso: string | null): string {
  if (!iso) return "—"
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

export function AbaLaudo({ pacienteId, pacienteNome }: Props) {
  const [laudos, setLaudos] = useState<PacienteLaudo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [laudoEditar, setLaudoEditar] = useState<PacienteLaudo | undefined>()
  const [excluindo, setExcluindo] = useState<number | null>(null)
  const [abrindoLink, setAbrindoLink] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await getLaudosDoPaciente(pacienteId)
    setLaudos(data)
    setErro(error)
    setCarregando(false)
  }, [pacienteId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function abrirArquivo(laudo: PacienteLaudo) {
    if (!laudo.arquivo_path) return
    setAbrindoLink(laudo.id_laudo)
    const url = await getUrlAssinadaLaudo(laudo.arquivo_path)
    setAbrindoLink(null)
    
    if (url) {
      window.open(url, "_blank")
    } else {
      toast.error("Não foi possível gerar o link seguro do arquivo.")
    }
  }

  async function confirmarExclusao(laudo: PacienteLaudo) {
    if (
      !window.confirm(
        `Excluir o laudo de ${dataBR(laudo.data_laudo)}? Esta ação ficará registrada no histórico.`
      )
    )
      return

    setExcluindo(laudo.id_laudo)
    const { error } = await excluirLaudo(laudo, pacienteNome)
    setExcluindo(null)

    if (error) {
      toast.error(`Não foi possível excluir: ${error}`)
      return
    }
    toast.success("Laudo excluído. O registro ficou no histórico.")
    void carregar()
  }

  function abrirNovo() {
    setLaudoEditar(undefined)
    setModalAberto(true)
  }

  function abrirEdicao(laudo: PacienteLaudo) {
    setLaudoEditar(laudo)
    setModalAberto(true)
  }

  return (
    <div className="min-w-0 flex-1">
      {/* ── Cabeçalho ── */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Laudos</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Histórico de laudos médicos do paciente
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" />
          Novo laudo
        </button>
      </div>

      {/* ── Estado ── */}
      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando laudos…
        </div>
      ) : erro ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Não foi possível carregar os laudos. {erro}</span>
        </div>
      ) : laudos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum laudo cadastrado.</p>
          <button
            type="button"
            onClick={abrirNovo}
            className="mt-2 text-sm text-primary hover:underline focus-visible:outline-none"
          >
            Adicionar o primeiro laudo
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {laudos.map((laudo) => (
            <li
              key={laudo.id_laudo}
              className={`flex h-full flex-col rounded-lg border border-border bg-card px-4 py-4 ${
                laudo.ativo ? "" : "opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                {/* ── Info principal ── */}
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        Laudo de {dataBR(laudo.data_laudo)}
                      </p>
                      <div className="flex gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${SIT_CLASSE[laudo.situacao] ?? ""}`}
                        >
                          {laudo.situacao}
                        </span>
                        {laudo.em_uso && (
                          <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                            Em uso
                          </span>
                        )}
                        {!laudo.ativo && (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                            Excluído
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Validade:{" "}
                      {laudo.validade
                        ? dataBR(laudo.validade)
                        : dataBR(
                            (() => {
                              const d = new Date(laudo.data_laudo + "T12:00:00")
                              d.setMonth(d.getMonth() + 6)
                              return d.toISOString().slice(0, 10)
                            })()
                          )}
                      {laudo.autorizado_em &&
                        ` · Autorizado em ${dataBR(laudo.autorizado_em)}`}
                    </p>
                  </div>
                </div>

                {/* ── Ações ── */}
                <div className="flex items-center gap-1.5">
                  {laudo.arquivo_path && (
                    <button
                      type="button"
                      onClick={() => void abrirArquivo(laudo)}
                      disabled={abrindoLink === laudo.id_laudo}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      title="Ver arquivo do laudo"
                    >
                      {abrindoLink === laudo.id_laudo ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  {/* Editar/excluir só fazem sentido em laudo ativo — um
                      excluído já está no estado final. */}
                  {laudo.ativo && (
                    <>
                      <button
                        type="button"
                        onClick={() => abrirEdicao(laudo)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Editar laudo"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void confirmarExclusao(laudo)}
                        disabled={excluindo === laudo.id_laudo}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Excluir laudo"
                      >
                        {excluindo === laudo.id_laudo ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Especialidades ── */}
              {laudo.especialidades.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-1 pr-4 font-semibold">Especialidade</th>
                        <th className="pb-1 pr-4 font-semibold">Qt Laudo</th>
                        <th className="pb-1 font-semibold">Qt Autor.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laudo.especialidades.map((e) => (
                        <tr key={e.id_laudo_especialidade} className="border-b border-border/50 last:border-0">
                          <td className="py-1 pr-4 text-foreground">{e.especialidade}</td>
                          <td className="py-1 pr-4 text-foreground">
                            {e.qt_laudo ?? "—"}
                          </td>
                          <td className="py-1 text-foreground">
                            {e.qt_autorizacao ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Observações ── */}
              {laudo.observacoes && (
                <p className="mt-2 text-xs text-muted-foreground">{laudo.observacoes}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Modal ── */}
      {modalAberto && (
        <LaudoFormModal
          pacienteId={pacienteId}
          pacienteNome={pacienteNome}
          laudo={laudoEditar}
          onClose={() => setModalAberto(false)}
          onSalvo={() => void carregar()}
        />
      )}
    </div>
  )
}
