"use client"

// MultiSearchCombobox — lista suspensa com "digitar pra buscar" + checkbox,
// pra seleção múltipla dentro de listas longas (ex.: terapias que uma sala
// comporta). Fecha ao clicar fora (mesmo padrão de data-*-dropdown +
// document "mousedown" já usado em OcupPacMode.tsx, aqui via ref.contains).
// Diferente de SearchCombobox (seleção única, fecha ao escolher), este
// permanece aberto entre marcações — só fecha por clique fora ou Escape.

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

export interface OpcaoMulti {
  id: number
  nome: string
}

interface Props {
  opcoes: OpcaoMulti[]
  selecionados: Set<number>
  onToggle: (id: number) => void
  placeholder?: string
  ariaLabel: string
  /** Plural usado no resumo com 3+ selecionados (ex.: "3 {nomePlural} selecionadas"). */
  nomePlural?: string
}

export function MultiSearchCombobox({ opcoes, selecionados, onToggle, placeholder = "Nenhuma opção selecionada", ariaLabel, nomePlural = "opções" }: Props) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return
      setAberto(false)
    }
    document.addEventListener("mousedown", fechar)
    return () => document.removeEventListener("mousedown", fechar)
  }, [aberto])

  useEffect(() => {
    if (aberto) inputRef.current?.focus()
    else setTexto("")
  }, [aberto])

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    if (!q) return opcoes
    return opcoes.filter(o => o.nome.toLowerCase().includes(q))
  }, [texto, opcoes])

  const nomesSelecionados = useMemo(() => opcoes.filter(o => selecionados.has(o.id)).map(o => o.nome), [opcoes, selecionados])
  const resumo = nomesSelecionados.length === 0
    ? placeholder
    : nomesSelecionados.length <= 2
      ? nomesSelecionados.join(", ")
      : `${nomesSelecionados.length} ${nomePlural} selecionadas`

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={ariaLabel}
        onClick={() => setAberto(v => !v)}
        onKeyDown={e => { if (e.key === "Escape") setAberto(false) }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left text-[13px] focus:outline-none focus:ring-2 focus:ring-ring ${nomesSelecionados.length ? "text-foreground" : "text-muted-foreground"}`}
      >
        <span className="truncate">{resumo}</span>
        <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-[calc(100%+2px)] z-[100] flex max-h-72 flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            aria-label={`Buscar em ${ariaLabel}`}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") setAberto(false) }}
            placeholder="Digite para buscar..."
            className="shrink-0 border-b border-border bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="overflow-y-auto p-1">
            {!filtradas.length ? (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">Nenhuma opção encontrada.</div>
            ) : filtradas.map(o => {
              const marcada = selecionados.has(o.id)
              return (
                <label
                  key={o.id}
                  role="option"
                  aria-selected={marcada}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-foreground hover:bg-muted/60"
                >
                  <input type="checkbox" checked={marcada} onChange={() => onToggle(o.id)} className="shrink-0" />
                  <span className="truncate">{o.nome}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
