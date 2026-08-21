'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { normalizar } from './datas'

/**
 * Combobox de paciente do painel semanal.
 *
 * Não reusa `cronograma/ui/SearchCombobox`: aquele veste os tokens da superfície
 * do cronograma (`bg-card`, `text-foreground`) e, mais grave, pinta a borda de
 * rose sempre que o valor não está na lista — inclusive vazio. Abriria a tela
 * com um campo em estado de erro antes de a pessoa digitar qualquer coisa.
 *
 * A lista oferece só quem tem sessão ASSIM na semana, com a contagem ao lado:
 * é o universo em que a cota faz sentido, e a contagem já adianta o tamanho do
 * cronograma que vai abrir.
 */
export default function SeletorPaciente({
  pacientes,
  valor,
  onEscolher,
}: {
  pacientes: { nome: string; sessoesNaSemana: number }[]
  valor: string | null
  onEscolher: (nome: string | null) => void
}) {
  const idListbox = useId()
  const [texto, setTexto] = useState(valor ?? '')
  const [aberto, setAberto] = useState(false)
  const [ativoIdx, setAtivoIdx] = useState(-1)
  const listaRef = useRef<HTMLDivElement>(null)

  // Quando a fila reposiciona o paciente (clique numa guia órfã), o campo
  // acompanha.
  const [ultimoValor, setUltimoValor] = useState(valor)
  if (valor !== ultimoValor) {
    setUltimoValor(valor)
    setTexto(valor ?? '')
  }

  const filtrados = useMemo(() => {
    const termo = normalizar(texto.trim())
    if (!termo) return pacientes
    return pacientes.filter((p) => normalizar(p.nome).includes(termo))
  }, [pacientes, texto])

  function escolher(nome: string) {
    onEscolher(nome)
    setTexto(nome)
    setUltimoValor(nome)
    setAberto(false)
    setAtivoIdx(-1)
  }

  return (
    <div className="relative w-full sm:w-80">
      <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500" />
      <input
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idListbox}
        aria-autocomplete="list"
        aria-label="Paciente da semana"
        autoComplete="off"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberto(true)
          setAtivoIdx(-1)
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          // Escape fecha só a lista, e aqui isso de fato funciona: fora do modal
          // não há `useModalDialog` escutando `keydown` em captura no
          // `document`, que era o que antes vencia qualquer handler do React.
          if (e.key === 'Escape' && aberto) {
            e.stopPropagation()
            setAberto(false)
            setAtivoIdx(-1)
            return
          }
          if (!aberto || filtrados.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            const proximo = Math.min(ativoIdx + 1, filtrados.length - 1)
            setAtivoIdx(proximo)
            listaRef.current?.children[proximo]?.scrollIntoView({ block: 'nearest' })
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const anterior = Math.max(ativoIdx - 1, 0)
            setAtivoIdx(anterior)
            listaRef.current?.children[anterior]?.scrollIntoView({ block: 'nearest' })
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const idx = ativoIdx >= 0 ? ativoIdx : filtrados.length === 1 ? 0 : -1
            if (idx >= 0) escolher(filtrados[idx].nome)
          }
        }}
        placeholder="Paciente da semana"
        className="h-11 w-full rounded-lg border border-slate-200 bg-white pr-11 pl-9 text-sm text-slate-700 placeholder:text-slate-500 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
      />
      {texto && (
        <button
          type="button"
          onClick={() => {
            setTexto('')
            onEscolher(null)
            setAtivoIdx(-1)
          }}
          aria-label="Limpar paciente"
          className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <X size={13} />
        </button>
      )}
      {aberto && filtrados.length > 0 && (
        <div
          ref={listaRef}
          id={idListbox}
          role="listbox"
          aria-label="Pacientes com sessão ASSIM nesta semana"
          className="absolute top-[calc(100%+4px)] left-0 z-20 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {filtrados.map((p, i) => (
            <button
              key={p.nome}
              type="button"
              role="option"
              aria-selected={p.nome === valor}
              onMouseDown={(e) => {
                e.preventDefault()
                escolher(p.nome)
              }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                i === ativoIdx
                  ? 'bg-brand-hover text-brand-fg'
                  : p.nome === valor
                    ? 'bg-slate-100 font-semibold text-slate-800'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="truncate">{p.nome}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{p.sessoesNaSemana} sess.</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
