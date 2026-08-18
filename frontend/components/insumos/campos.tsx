"use client"

import { useId, useState, type KeyboardEvent, type ReactNode } from "react"
import { X } from "lucide-react"

// Primitivas de campo do módulo de insumos.
//
// O AXIUM tinha TextField/Textarea/Select/ChipsInput em `components/ui/**`, com
// CSS Modules. No Pulsar `components/ui/` só tem button, dialog, dropdown-menu e
// tones — não há campo de formulário compartilhado, e os formulários existentes
// (ex.: cadastros/feriados) repetem a mesma cadeia de classes em cada <input>.
//
// Estas primitivas ficam sob components/insumos/ e não em components/ui/ de
// propósito: promovê-las a componente global do projeto é decisão de design que
// afeta todas as telas, e não cabe num porte. Se outra tela quiser, sobe depois.

const CLASSES_CONTROLE =
  "w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60"

function Campo({
  id,
  label,
  obrigatorio,
  ajuda,
  children,
}: {
  id: string
  label: string
  obrigatorio?: boolean
  ajuda?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {/* Marca o obrigatório no rótulo, não só via `required` no input: o
            asterisco é a única pista antes de tentar enviar. */}
        {obrigatorio && <span className="ml-0.5 text-rose-600 dark:text-rose-400">*</span>}
      </label>
      {children}
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  )
}

export function CampoTexto({
  label,
  valor,
  onChange,
  obrigatorio,
  ajuda,
  placeholder,
  tipo = "text",
  min,
  step,
}: {
  label: string
  valor: string | number
  onChange: (v: string) => void
  obrigatorio?: boolean
  ajuda?: ReactNode
  placeholder?: string
  tipo?: "text" | "number" | "url" | "date"
  min?: number | string
  step?: number | string
}) {
  const id = useId()
  return (
    <Campo id={id} label={label} obrigatorio={obrigatorio} ajuda={ajuda}>
      <input
        id={id}
        type={tipo}
        value={valor}
        min={min}
        step={step}
        required={obrigatorio}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSES_CONTROLE}
      />
    </Campo>
  )
}

export function CampoTextoLongo({
  label,
  valor,
  onChange,
  obrigatorio,
  ajuda,
  placeholder,
  linhas = 3,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  obrigatorio?: boolean
  ajuda?: ReactNode
  placeholder?: string
  linhas?: number
}) {
  const id = useId()
  return (
    <Campo id={id} label={label} obrigatorio={obrigatorio} ajuda={ajuda}>
      <textarea
        id={id}
        value={valor}
        rows={linhas}
        required={obrigatorio}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${CLASSES_CONTROLE} resize-y`}
      />
    </Campo>
  )
}

export function CampoSelecao({
  label,
  valor,
  onChange,
  obrigatorio,
  ajuda,
  children,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  obrigatorio?: boolean
  ajuda?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <Campo id={id} label={label} obrigatorio={obrigatorio} ajuda={ajuda}>
      <select
        id={id}
        value={valor}
        required={obrigatorio}
        onChange={(e) => onChange(e.target.value)}
        className={CLASSES_CONTROLE}
      >
        {children}
      </select>
    </Campo>
  )
}

/**
 * Entrada de múltiplos valores: um por vez, Enter confirma, Backspace no campo
 * vazio remove o último.
 *
 * Por que chip e não texto corrido: `descricao_detalhada` alimenta
 * `calcularScoreCompatibilidade` (lib/insumos/compatibilidade.ts), que compara
 * TERMOS. Um parágrafo corrido dilui o score com stopwords; "8GB RAM" e
 * "256GB SSD" separados casam melhor com o título do anúncio.
 *
 * Preserva o comportamento do AXIUM, incluindo `onBlur` confirmando o que estava
 * digitado — sem isso, quem digita e clica direto em Salvar perde o último termo
 * silenciosamente.
 */
export function CampoChips({
  label,
  valores,
  onChange,
  placeholder,
  ajuda,
  obrigatorio,
}: {
  label: string
  valores: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  ajuda?: ReactNode
  obrigatorio?: boolean
}) {
  const id = useId()
  const [atual, setAtual] = useState("")

  function adicionar() {
    const valor = atual.trim()
    if (valor === "") return
    onChange([...valores, valor])
    setAtual("")
  }

  function remover(indice: number) {
    onChange(valores.filter((_, i) => i !== indice))
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // Sem o preventDefault, o Enter submeteria o formulário em vez de
      // confirmar o chip — e o campo é o principal desta tela.
      e.preventDefault()
      adicionar()
    } else if (e.key === "Backspace" && atual === "" && valores.length > 0) {
      remover(valores.length - 1)
    }
  }

  return (
    <Campo id={id} label={label} obrigatorio={obrigatorio} ajuda={ajuda}>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        {valores.map((valor, indice) => (
          <span
            key={`${valor}-${indice}`}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {valor}
            <button
              type="button"
              onClick={() => remover(indice)}
              aria-label={`Remover ${valor}`}
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          onKeyDown={aoTeclar}
          onBlur={adicionar}
          placeholder={valores.length === 0 ? placeholder : ""}
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
    </Campo>
  )
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  )
}

export function Linha({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}
