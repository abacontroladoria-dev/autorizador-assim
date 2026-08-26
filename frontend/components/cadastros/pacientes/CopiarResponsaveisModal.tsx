"use client"

import { useMemo, useState } from "react"
import { X, Search, AlertCircle, Loader2 } from "lucide-react"
import { maskCpfCnpj, onlyDigits } from "@/lib/remuneracao/formatacao"
import { useModalDialog } from "@/hooks/useModalDialog"
import { usePacientes } from "@/hooks/usePacientes"
import { getVinculosDoPaciente } from "@/services/responsaveis.service"
import { TIPOS_VINCULO } from "@/types/responsavel"
import type { VinculoResponsavel, VinculoResponsavelEdit } from "@/types/responsavel"
import type { Paciente } from "@/types/paciente"
import { formatarMatricula } from "@/types/paciente"
import { campo, foco } from "./ui/campos"

// "Copiar de outro paciente": o atalho para cadastrar o segundo irmão sem
// redigitar nada — busca um paciente já cadastrado e traz os vínculos dele
// de uma vez. Ver "lógica de irmãos" no plano de Responsáveis.

function norm(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

export function CopiarResponsaveisModal({
  idPacienteAtual,
  vinculosAtuais,
  onFechar,
  onCopiar,
}: {
  /** Exclui o próprio paciente da busca — copiar dele mesmo não faz sentido. */
  idPacienteAtual: number | undefined
  /** Para avisar quais campos serão substituídos, sem bloquear a cópia. */
  vinculosAtuais: VinculoResponsavelEdit[]
  onFechar: () => void
  onCopiar: (vinculos: VinculoResponsavelEdit[]) => void
}) {
  const { pacientes, loading } = usePacientes()
  const [busca, setBusca] = useState("")
  const [selecionado, setSelecionado] = useState<Paciente | null>(null)
  const [vinculosOrigem, setVinculosOrigem] = useState<VinculoResponsavel[] | null>(null)
  const [carregandoVinculos, setCarregandoVinculos] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { refDialogo, propsDialogo } = useModalDialog(true, onFechar, "titulo-copiar-responsaveis")

  const resultados = useMemo(() => {
    const termo = norm(busca)
    if (!termo) return []
    const digitos = onlyDigits(busca)
    return pacientes
      .filter((p) => p.id_paciente !== idPacienteAtual && !p.ficticio)
      .filter((p) => {
        if (norm(p.nome).includes(termo)) return true
        if (digitos && p.cpf && onlyDigits(p.cpf).includes(digitos)) return true
        return false
      })
      .slice(0, 20)
  }, [pacientes, busca, idPacienteAtual])

  async function selecionar(p: Paciente) {
    setSelecionado(p)
    setErro(null)
    setCarregandoVinculos(true)
    const { data, error } = await getVinculosDoPaciente(p.id_paciente)
    setCarregandoVinculos(false)
    if (error) {
      setErro(error)
      return
    }
    setVinculosOrigem(data)
  }

  const substituira = (vinculosOrigem ?? [])
    .filter((vo) => vinculosAtuais.some((va) => va.tipo === vo.tipo && va.responsavel_id !== vo.responsavel_id))
    .map((vo) => TIPOS_VINCULO.find((t) => t.tipo === vo.tipo)?.rotulo ?? vo.tipo)

  function confirmar() {
    if (!vinculosOrigem) return
    onCopiar(
      vinculosOrigem.map((v) => ({
        tipo: v.tipo,
        responsavel_id: v.responsavel_id,
        parentesco: v.parentesco,
      }))
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="titulo-copiar-responsaveis" className="text-base font-semibold text-foreground">
            Copiar responsáveis de outro paciente
          </h2>
          <button
            type="button"
            onClick={onFechar}
            className={`rounded-md p-1 text-muted-foreground hover:bg-muted ${foco}`}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-4">
          {!selecionado ? (
            <>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  className={`${campo} pl-9`}
                  placeholder="Buscar paciente por nome ou CPF"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  autoFocus
                  aria-label="Buscar paciente"
                />
              </div>

              {loading ? (
                <p className="mt-3 text-sm text-muted-foreground">Carregando pacientes…</p>
              ) : busca && resultados.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
              ) : (
                <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                  {resultados.map((p) => (
                    <li key={p.id_paciente}>
                      <button
                        type="button"
                        onClick={() => void selecionar(p)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted ${foco}`}
                      >
                        <span className="truncate font-medium text-foreground">{p.nome}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {p.cpf ? maskCpfCnpj(p.cpf) : `ID ${formatarMatricula(p.matricula)}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-foreground">
                  Vínculos de <strong>{selecionado.nome}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelecionado(null)
                    setVinculosOrigem(null)
                    setErro(null)
                  }}
                  className={`text-xs text-primary underline ${foco}`}
                >
                  Trocar paciente
                </button>
              </div>

              {erro && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Não foi possível carregar os vínculos. {erro}</span>
                </div>
              )}

              {carregandoVinculos ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Carregando…
                </div>
              ) : vinculosOrigem && vinculosOrigem.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  {selecionado.nome} não tem nenhum responsável cadastrado ainda.
                </p>
              ) : vinculosOrigem ? (
                <ul className="space-y-1.5 text-sm">
                  {vinculosOrigem.map((v) => (
                    <li key={v.tipo} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                      <span className="text-muted-foreground">
                        {TIPOS_VINCULO.find((t) => t.tipo === v.tipo)?.rotulo ?? v.tipo}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {v.responsavel.nome}
                        {v.parentesco ? ` (${v.parentesco})` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {substituira.length > 0 && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Isso vai substituir quem hoje está em: {substituira.join(", ")}.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onFechar}
            className={`rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted ${foco}`}
          >
            Cancelar
          </button>
          {selecionado && (
            <button
              type="button"
              onClick={confirmar}
              disabled={!vinculosOrigem || vinculosOrigem.length === 0}
              className={`inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 ${foco}`}
            >
              Copiar {vinculosOrigem?.length ?? 0} vínculo{vinculosOrigem?.length === 1 ? "" : "s"}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
