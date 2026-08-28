"use client"

import { useState } from "react"
import toast from "react-hot-toast"
import { Loader2, X, AlertTriangle } from "lucide-react"
import { definirAtivoPaciente } from "@/services/pacientes.service"
import { refetchPacientes } from "@/hooks/usePacientes"
import type { Paciente } from "@/types/paciente"
import { foco, rotulo, campo } from "./ui/campos"

// Inativar é uma AÇÃO, não um campo do formulário — foi o que o usuário pediu
// depois de o checkbox "Cadastro ativo" se mostrar confuso. Três ganhos sobre o
// checkbox: o efeito é explícito, exige confirmação deliberada, e permite
// registrar um motivo, que vai para a trilha de auditoria.
//
// Inativar NÃO apaga nada e não mexe em `falecido`: o paciente some dos filtros
// de cadastro ativo e continua inteiro no banco.

export function InativarPacienteModal({
  paciente,
  onFechar,
  onConcluido,
}: {
  paciente: Paciente
  onFechar: () => void
  onConcluido: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const inativando = paciente.ativo

  async function confirmar() {
    setSalvando(true)
    setErro(null)

    const res = await definirAtivoPaciente(paciente.id_paciente, !inativando, motivo)
    setSalvando(false)

    if (!res.ok) {
      setErro(res.error)
      return
    }

    await refetchPacientes()
    toast.success(inativando ? "Cadastro inativado." : "Cadastro reativado.")
    onConcluido()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={inativando ? "Inativar cadastro" : "Reativar cadastro"}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-lg">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            {inativando ? "Inativar cadastro" : "Reativar cadastro"}
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
                <strong>{paciente.nome}</strong> deixará de aparecer nas listas de
                cadastro ativo. Nenhum dado é apagado e a ação pode ser desfeita
                depois.
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{paciente.nome}</strong> volta a
              constar como cadastro ativo.
            </p>
          )}

          <div>
            <label className={rotulo}>Motivo {inativando ? "(recomendado)" : "(opcional)"}</label>
            <textarea
              className={`mt-1 ${campo} resize-y`}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={salvando}
              placeholder={inativando ? "Ex.: alta terapêutica, mudança de cidade" : ""}
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
