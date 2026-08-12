"use client"

// SearchCombobox — combobox de seleção única com "digitar pra buscar",
// mesmo padrão ARIA já duplicado em ProfissionalCombobox
// (DisponibilidadeInternaView.tsx) e EspecialidadeCombobox
// (SimulacaoNovoPrestadorTab.tsx), generalizado aqui pra não duplicar de
// novo em cada tela nova que precisar de um <select> pesquisável. Só permite
// escolher 1 opção da lista — texto livre nunca vira valor selecionado.

import { useId, useMemo, useRef, useState } from "react"

interface Props {
  value: string
  onChange: (v: string) => void
  opcoes: string[]
  placeholder?: string
  ariaLabel: string
}

export function SearchCombobox({ value, onChange, opcoes, placeholder = "Digite para buscar...", ariaLabel }: Props) {
  const id = useId()
  const [texto, setTexto] = useState(value)
  const [aberto, setAberto] = useState(false)
  const [ativoIdx, setAtivoIdx] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  const [ultimoValor, setUltimoValor] = useState(value)
  if (value !== ultimoValor) {
    setUltimoValor(value)
    setTexto(value)
  }

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return opcoes
    return opcoes.filter(o => o.toLowerCase().includes(q))
  }, [texto, opcoes])

  const selecionar = (opcao: string) => { onChange(opcao); setTexto(opcao); setUltimoValor(opcao); setAberto(false); setAtivoIdx(-1) }
  const valida = opcoes.includes(value)

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={aberto}
        aria-controls={aberto ? `${id}-listbox` : undefined}
        value={texto}
        onChange={e => { setTexto(e.target.value); setUltimoValor(""); onChange(""); setAberto(true); setAtivoIdx(-1) }}
        onFocus={() => setAberto(true)}
        onBlur={() => { setTimeout(() => setAberto(false), 150); if (value) setTexto(value) }}
        onKeyDown={e => {
          if (!aberto || !filtradas.length) return
          if (e.key === "ArrowDown") {
            e.preventDefault()
            const next = Math.min(ativoIdx + 1, filtradas.length - 1)
            setAtivoIdx(next); listRef.current?.children[next]?.scrollIntoView({ block: "nearest" })
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            const prev = Math.max(ativoIdx - 1, 0)
            setAtivoIdx(prev); listRef.current?.children[prev]?.scrollIntoView({ block: "nearest" })
          } else if (e.key === "Enter") {
            e.preventDefault()
            const idx = ativoIdx >= 0 ? ativoIdx : (filtradas.length === 1 ? 0 : -1)
            if (idx >= 0) selecionar(filtradas[idx])
          } else if (e.key === "Escape") {
            setAberto(false); setAtivoIdx(-1)
            if (value) setTexto(value)
          }
        }}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${valida ? "border-border bg-card" : "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"}`}
      />
      {aberto && filtradas.length > 0 && (
        <div
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-[100] max-h-52 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {filtradas.map((opcao, i) => {
            const selecionada = opcao === value
            const ativa = i === ativoIdx
            return (
              <button
                key={opcao}
                type="button"
                role="option"
                aria-selected={selecionada}
                onMouseDown={() => selecionar(opcao)}
                className={`block w-full px-3 py-1.5 text-left text-[13px] transition-colors ${ativa ? "bg-sky-600 text-white" : selecionada ? "bg-muted font-semibold text-foreground" : "text-foreground hover:bg-muted/60"}`}
              >
                {opcao}
              </button>
            )
          })}
        </div>
      )}
      {!valida && !aberto && texto && (
        <div className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">Selecione uma opção válida da lista.</div>
      )}
    </div>
  )
}
