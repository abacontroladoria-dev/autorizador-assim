"use client"

import type { ReactNode } from "react"
import * as Select from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

// Classes de formulário do projeto. Mesmas constantes de
// components/cadastros/NovoProfissionalModal.tsx — tokens semânticos, sem cor
// literal, para o tema claro/escuro continuar valendo.
//
// Aqui elas ganham a variante `disabled`, que o modal não precisa: esta tela
// nasce SOMENTE-LEITURA e só libera os campos depois do botão EDITAR.

export const campo =
  "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground " +
  "placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring " +
  "disabled:cursor-default disabled:bg-muted/40 disabled:text-muted-foreground"
export const rotulo =
  "block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
export const foco = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** Bloco de uma sub-seção: título, subtítulo e grade de dois campos por linha. */
export function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          {descricao && (
            <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
          )}
        </div>
        {acao}
      </header>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

type CampoBaseProps = {
  label: string
  /** Ocupa a linha inteira em vez de meia. */
  largo?: boolean
  dica?: string
}

export function Campo({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  placeholder,
  largo,
  dica,
  maxLength,
  inputMode,
}: CampoBaseProps & {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  type?: string
  placeholder?: string
  maxLength?: number
  inputMode?: "text" | "numeric" | "tel" | "email"
}) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <label className={rotulo}>{label}</label>
      <input
        type={type}
        className={`mt-1 ${campo}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
      />
      {dica && <p className="mt-1 text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

/** Campo de leitura pura — valor gerado pelo sistema, que nem EDITAR libera. */
export function CampoSomenteLeitura({
  label,
  value,
  largo,
  dica,
}: CampoBaseProps & { value: string }) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <label className={rotulo}>{label}</label>
      <p className="mt-1 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1.5 text-sm text-muted-foreground">
        {value || "—"}
      </p>
      {dica && <p className="mt-1 text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}


export function CampoTextarea({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  linhas = 3,
  dica,
}: CampoBaseProps & {
  value: string
  onChange: (v: string) => void
  disabled: boolean
  placeholder?: string
  linhas?: number
}) {
  return (
    <div className="sm:col-span-2">
      <label className={rotulo}>{label}</label>
      <textarea
        className={`mt-1 ${campo} resize-y`}
        rows={linhas}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
      {dica && <p className="mt-1 text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

export function CampoCheckbox({
  label,
  checked,
  onChange,
  disabled,
  dica,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  dica?: string
}) {
  return (
    <div className="sm:col-span-2">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className={`h-4 w-4 rounded border-border accent-primary disabled:cursor-default ${foco}`}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        {label}
      </label>
      {dica && <p className="mt-1 pl-6 text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

export function CampoSelect<T extends string>({
  label,
  value,
  onChange,
  disabled,
  opcoes,
  vazio = "Não informado",
  largo,
  dica,
}: CampoBaseProps & {
  value: T | null
  onChange: (v: T | null) => void
  disabled: boolean
  opcoes: { valor: T; rotulo: string }[]
  vazio?: string
}) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <label className={rotulo}>{label}</label>
      <Select.Root
        value={value ?? "__none__"}
        onValueChange={(val) => onChange(val === "__none__" ? null : (val as T))}
        disabled={disabled}
      >
        <Select.Trigger
          className={`mt-1 flex w-full items-center justify-between rounded-md border border-border bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-default disabled:bg-muted/40 disabled:text-muted-foreground [&>span]:line-clamp-1 ${!value ? "text-muted-foreground/60" : ""}`}
        >
          <Select.Value placeholder={vazio}>
            {value ? opcoes.find(o => o.valor === value)?.rotulo : vazio}
          </Select.Value>
          <Select.Icon asChild>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="relative z-[100] max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          >
            <Select.Viewport className="h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] p-1 bg-card">
              <Select.Item
                value="__none__"
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <Select.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </Select.ItemIndicator>
                </span>
                <Select.ItemText>{vazio}</Select.ItemText>
              </Select.Item>
              
              {opcoes.map((o) => (
                <Select.Item
                  key={o.valor}
                  value={o.valor}
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Select.ItemIndicator>
                      <Check className="h-4 w-4" />
                    </Select.ItemIndicator>
                  </span>
                  <Select.ItemText>{o.rotulo}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {dica && <p className="mt-1 text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}

/** Botão segmentado Sim/Não — para campos booleanos que merecem mais destaque que um checkbox. */
export function CampoToggleSimNao({
  label,
  value,
  onChange,
  disabled,
  dica,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  dica?: string
}) {
  return (
    <div>
      <label className={rotulo}>{label}</label>
      <div className="mt-1 inline-flex rounded-md border border-border p-0.5">
        <button
          type="button"
          onClick={() => onChange(false)}
          disabled={disabled}
          aria-pressed={!value}
          className={`rounded px-3 py-1 text-sm font-medium disabled:cursor-default disabled:opacity-60 ${foco} ${
            !value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          Não
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          disabled={disabled}
          aria-pressed={value}
          className={`rounded px-3 py-1 text-sm font-medium disabled:cursor-default disabled:opacity-60 ${foco} ${
            value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"
          }`}
        >
          Sim
        </button>
      </div>
      {dica && <p className="mt-1 text-xs text-muted-foreground">{dica}</p>}
    </div>
  )
}
