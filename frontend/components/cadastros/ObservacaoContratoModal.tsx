"use client"

import { useEffect, useId, useState } from "react"
import { StickyNote, X } from "lucide-react"

/**
 * Observação de UM contrato. Escreve direto no rascunho do bloco (via o
 * `onChange` que o pai liga em `update`), então NÃO tem "Aplicar" nem
 * "Cancelar":
 *
 * — "Aplicar" criaria dois níveis de commit para um valor (aplicar → rascunho,
 *   Salvar tudo → banco) e quem clicasse teria todo motivo para achar que
 *   salvou. Escrevendo direto, a nota se comporta igual ao campo do número que
 *   fica 40px à esquerda: digitar deixa o bloco âmbar e faz a barra de salvar
 *   aparecer atrás do modal. Um paradigma, não dois.
 * — "Cancelar" já tem dois outros sentidos nesta tela ("Cancelar contrato" =
 *   desativar o contrato; o do UnsavedChangesModal = continuar editando). Um
 *   terceiro sentido seria a sobrecarga que esta tela evita.
 *
 * A saída de emergência é `Desfazer`, que devolve o texto de quando o modal
 * abriu — escopo honesto, sem prometer persistência.
 *
 * Montado condicionalmente pelo pai (sem prop `open`), então o estado nasce
 * limpo a cada abertura sem efeito de reset — que a regra
 * `react-hooks/set-state-in-effect` do projeto trata como erro.
 */
export function ObservacaoContratoModal({
  numero,
  referencia,
  valor,
  onChange,
  onClose,
}: {
  /** Número do contrato, só como contexto. Vazio = contrato sem número ainda. */
  numero: string
  /** Ex.: "contrato 2 de Ana Silva" — para os rótulos acessíveis. */
  referencia: string
  valor: string
  onChange: (texto: string) => void
  onClose: () => void
}) {
  // Inicializador lazy, não efeito: o pai monta condicionalmente, então o valor
  // de abertura já está certo no primeiro render.
  const [aoAbrir] = useState(valor)
  const tituloId = useId()
  const ajudaId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <StickyNote size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 id={tituloId} className="text-md font-semibold text-foreground">
            Observação do contrato
          </h2>
          {/* O número é CONTEXTO, não um segundo campo: quem edita o número é o
              input da linha. Sem borda e sem foco justamente para não se passar
              por duplicata dele. */}
          {numero ? (
            <span className="min-w-0 flex-1 truncate text-sm tabular-nums text-muted-foreground">
              Nº {numero}
            </span>
          ) : (
            <span className="flex-1 text-sm italic text-muted-foreground">sem número</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* maxLength porque a coluna é `text` sem limite e alguém vai colar um
              contrato inteiro aqui. */}
          <textarea
            autoFocus
            rows={5}
            maxLength={2000}
            value={valor}
            onChange={e => onChange(e.target.value)}
            placeholder="Ex.: aguardando assinatura, número do contrato ainda não emitido."
            aria-label={`Observação do ${referencia}`}
            aria-describedby={ajudaId}
            className="w-full resize-y rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <p id={ajudaId} className="mr-auto text-xs text-muted-foreground">
            A nota já está no bloco. Grave com <strong className="font-semibold">Salvar tudo</strong>.
          </p>
          <button
            type="button"
            onClick={() => onChange(aoAbrir)}
            disabled={valor === aoAbrir}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Desfazer
          </button>
          {/* Neutro, não emerald: fechar não é salvar, e emerald nesta tela
              significa vigente/salvar. */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}
