"use client"

import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Loader2, X, AlertTriangle } from "lucide-react"
import {
  definirAtivoResponsavel,
  getVinculosDeResponsaveis,
  type ContextoPacienteAuditoria,
} from "@/services/responsaveis.service"
import { refetchResponsaveis } from "@/hooks/useResponsaveis"
import type { Responsavel } from "@/types/responsavel"
import { foco, rotulo, campo } from "./ui/campos"

// Clone estrutural de InativarPacienteModal — mesma decisão do usuário: ação
// explícita com motivo, nunca excluir. A FK
// pacientes_responsaveis.responsavel_id é ON DELETE RESTRICT — excluir
// travaria com erro cru do Postgres e quebraria a trilha de auditoria.

export function InativarResponsavelModal({
  responsavel,
  contextoPaciente,
  onFechar,
  onConcluido,
}: {
  responsavel: Responsavel
  contextoPaciente?: ContextoPacienteAuditoria
  onFechar: () => void
  onConcluido: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pacientes, setPacientes] = useState<{ id_paciente: number; nome: string; tipo: string }[]>([])

  const inativando = responsavel.ativo

  // Mostrar quem ainda depende deste responsável evita o usuário achar que
  // inativar desfaz vínculos existentes — não desfaz, só tira da lista de
  // opções para vínculos NOVOS.
  useEffect(() => {
    let ativo = true
    getVinculosDeResponsaveis([responsavel.id]).then(({ data }) => {
      if (ativo) setPacientes(data.get(responsavel.id) ?? [])
    })
    return () => {
      ativo = false
    }
  }, [responsavel.id])

  async function confirmar() {
    setSalvando(true)
    setErro(null)

    const res = await definirAtivoResponsavel(responsavel.id, !inativando, motivo, contextoPaciente)
    setSalvando(false)

    if (!res.ok) {
      setErro(res.error)
      return
    }

    await refetchResponsaveis()
    toast.success(inativando ? "Responsável inativado." : "Responsável reativado.")
    onConcluido()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={inativando ? "Inativar responsável" : "Reativar responsável"}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            {inativando ? "Inativar responsável" : "Reativar responsável"}
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

        <div className="space-y-3 px-4 py-4">
          {inativando ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{responsavel.nome}</strong> deixa de aparecer como opção para vínculos
                NOVOS. Nenhum vínculo existente é apagado — quem já responde por um paciente
                continua respondendo, e o nome segue visível lá.
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{responsavel.nome}</strong> volta a poder ser
              selecionado em vínculos novos.
            </p>
          )}

          {pacientes.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold uppercase tracking-wide">Ainda vinculado a</p>
              <ul className="space-y-0.5">
                {pacientes.map((p) => (
                  <li key={`${p.id_paciente}-${p.tipo}`}>{p.nome}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className={rotulo}>Motivo {inativando ? "(recomendado)" : "(opcional)"}</label>
            <textarea
              className={`mt-1 ${campo} resize-y`}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={salvando}
              placeholder={inativando ? "Ex.: CPF duplicado, cadastro incorreto" : ""}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              O motivo fica registrado no histórico de alterações.
            </p>
          </div>

          {erro && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {erro}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className={`rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted ${foco}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={salvando}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-60 ${foco} ${
              inativando
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {inativando ? "Inativar" : "Reativar"}
          </button>
        </footer>
      </div>
    </div>
  )
}
