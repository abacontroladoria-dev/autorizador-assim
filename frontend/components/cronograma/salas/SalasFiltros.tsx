"use client"

// SalasFiltros — barra de filtros de unidade/núcleo/andar/capacidade/turno/status
// para a grade e o mapa de calor de Ocupação de Salas. Cada filtro (exceto
// profissional, que é busca livre) aceita múltipla seleção — um dropdown com
// checkboxes em vez de um <select> nativo, que só permite uma opção por vez.

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Filter, Search, X } from "lucide-react"
import { normTxt } from "@/lib/cronograma/constants"
import { CAPACIDADE_LABEL_CURTO } from "@/lib/cronograma/salasTypes"
import { useStatusLabels } from "@/hooks/useStatusLabels"
import type { SalaCapacidade, SalaStatus, SalaComOcupacao } from "@/lib/cronograma/salasTypes"

export interface SalasFiltrosState {
  unidade: string[]
  nucleo: string[]
  andar: string[]
  capacidade: SalaCapacidade[]
  turno: ("Manhã" | "Tarde")[]
  status: SalaStatus[]
  /** Busca livre por nome de profissional alocado (ignora acentos/maiúsculas) */
  profissional: string
  /** Só mostra slots com pelo menos uma alocação sem cruzamento real (card com "—" em vez de "X/Y") */
  semSessao: boolean
  /** Só mostra salas com pelo menos uma regra cadastrada em "Exclusividade de salas com terapias" */
  comExclusividade: boolean
}

export const SALAS_FILTROS_VAZIO: SalasFiltrosState = {
  unidade: [], nucleo: [], andar: [], capacidade: [], turno: [], status: [], profissional: "", semSessao: false, comExclusividade: false,
}

interface MultiSelectFiltroProps {
  label: string
  values: string[]
  options: string[]
  onChange: (v: string[]) => void
  /** Rótulo legível por opção (ex.: "unico" -> "Único") — opcional, usa o valor cru quando ausente. */
  labelFor?: (opcao: string) => string
}

function MultiSelectFiltro({ label, values, options, onChange, labelFor }: MultiSelectFiltroProps) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", aoClicarFora)
    return () => document.removeEventListener("mousedown", aoClicarFora)
  }, [aberto])

  function alternar(opcao: string) {
    onChange(values.includes(opcao) ? values.filter(v => v !== opcao) : [...values, opcao])
  }

  const resumo = values.length === 0
    ? "Todos"
    : values.length === 1
      ? (labelFor ? labelFor(values[0]) : values[0])
      : `${values.length} selecionados`

  return (
    <div ref={ref} className="relative">
      {/* Só o rótulo, nunca o valor escolhido — mostrar "Núcleo:
          Desenvolvimento e..." dentro do botão fazia a largura variar por
          filtro e quebrar a barra em duas linhas. O ícone de funil cinza/verde
          diz "tem filtro aqui ou não" à distância; o valor em si aparece no
          título (hover) e, claro, dentro do dropdown ao abrir. */}
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        title={resumo}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 text-sm text-foreground"
      >
        <Filter
          size={15}
          className={values.length ? "shrink-0 fill-emerald-500 text-emerald-500" : "shrink-0 text-muted-foreground"}
          strokeWidth={2.25}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </button>
      {aberto && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 min-w-[200px] overflow-auto rounded-lg border border-border bg-card p-1.5 shadow-lg">
          {options.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Nenhuma opção</div>}
          {options.map(o => (
            <label key={o} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60">
              <input
                type="checkbox"
                checked={values.includes(o)}
                onChange={() => alternar(o)}
                className="rounded border-border"
              />
              <span className="truncate">{labelFor ? labelFor(o) : o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

interface SalasFiltrosProps {
  value: SalasFiltrosState
  onChange: (next: SalasFiltrosState) => void
  unidades: string[]
  nucleos: string[]
  andares: string[]
}

const CAPACIDADE_OPCOES: SalaCapacidade[] = ["unico", "duplo", "multiplo"]
const TURNO_OPCOES = ["Manhã", "Tarde"] as const

export function SalasFiltros({ value, onChange, unidades, nucleos, andares }: SalasFiltrosProps) {
  const { labels: statusLabels } = useStatusLabels()
  const statusOpcoes = Object.keys(statusLabels)

  function set<K extends keyof SalasFiltrosState>(key: K, v: SalasFiltrosState[K]) {
    onChange({ ...value, [key]: v })
  }

  const temFiltroAtivo = value.unidade.length > 0 || value.nucleo.length > 0 || value.andar.length > 0
    || value.capacidade.length > 0 || value.turno.length > 0 || value.status.length > 0 || value.profissional
    || value.semSessao || value.comExclusividade

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-2">
      <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5">
        <Search size={13} className="shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value.profissional}
          onChange={e => set("profissional", e.target.value)}
          placeholder="Profissional..."
          className="w-[150px] bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <MultiSelectFiltro label="Unidade" values={value.unidade} options={unidades} onChange={v => set("unidade", v)} />
      <MultiSelectFiltro label="Núcleo" values={value.nucleo} options={nucleos} onChange={v => set("nucleo", v)} />
      <MultiSelectFiltro label="Andar" values={value.andar} options={andares} onChange={v => set("andar", v)} />
      <MultiSelectFiltro
        label="Capacidade"
        values={value.capacidade}
        options={CAPACIDADE_OPCOES}
        onChange={v => set("capacidade", v as SalaCapacidade[])}
        labelFor={o => CAPACIDADE_LABEL_CURTO[o as SalaCapacidade]}
      />
      <MultiSelectFiltro
        label="Turno"
        values={value.turno}
        options={[...TURNO_OPCOES]}
        onChange={v => set("turno", v as ("Manhã" | "Tarde")[])}
      />
      <MultiSelectFiltro
        label="Status"
        values={value.status}
        options={statusOpcoes}
        onChange={v => set("status", v as SalaStatus[])}
        labelFor={o => statusLabels[o]?.label_curto ?? o}
      />
      <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
      <button
        type="button"
        onClick={() => set("semSessao", !value.semSessao)}
        aria-pressed={value.semSessao}
        className={`flex h-9 items-center whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold transition-colors ${
          value.semSessao
            ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-300"
            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
        }`}
      >
        Alocação sem sessão
      </button>
      <button
        type="button"
        onClick={() => set("comExclusividade", !value.comExclusividade)}
        aria-pressed={value.comExclusividade}
        className={`flex h-9 items-center whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold transition-colors ${
          value.comExclusividade
            ? "border-blue-400 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
            : "border-border bg-card text-muted-foreground hover:bg-muted/50"
        }`}
      >
        Sala com exclusividade
      </button>
      {temFiltroAtivo && (
        <button
          type="button"
          onClick={() => onChange(SALAS_FILTROS_VAZIO)}
          className="flex h-9 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50"
        >
          <X size={12} /> Limpar filtros
        </button>
      )}
    </div>
  )
}

export function aplicarFiltrosSala(
  filtro: SalasFiltrosState,
  sala: { unidade_nome: string; nucleo: string | null; andar: string | null; capacidade: SalaCapacidade; status: SalaStatus },
): boolean {
  if (filtro.unidade.length && !filtro.unidade.includes(sala.unidade_nome)) return false
  if (filtro.nucleo.length && !filtro.nucleo.includes(sala.nucleo ?? "")) return false
  if (filtro.andar.length && !filtro.andar.includes(sala.andar ?? "")) return false
  if (filtro.capacidade.length && !filtro.capacidade.includes(sala.capacidade)) return false
  if (filtro.status.length && !filtro.status.includes(sala.status)) return false
  return true
}

/**
 * Busca livre por profissional alocado em qualquer slot da sala. Usa
 * `normTxt` (remove acentos + minúsculas) para achar "Rachel Silva" tanto
 * com quanto sem acento, em qualquer ordem de capitalização.
 */
export function salaTemProfissional(item: SalaComOcupacao, query: string): boolean {
  const q = normTxt(query)
  if (!q) return true
  return item.slots.some(slot =>
    slot.alocacoes.some(a => normTxt(a.profissionalNome).includes(q)),
  )
}

/**
 * Indica se um profissional bate com a busca ativa — usado para DESTACAR o
 * card dele na grade, sem esconder os outros profissionais do mesmo slot
 * (esconder faria um horário ocupado por outra pessoa aparecer como "Livre",
 * o que é enganoso).
 */
export function profissionalBateComBusca(nome: string, query: string): boolean {
  const q = normTxt(query)
  if (!q) return false
  return normTxt(nome).includes(q)
}
