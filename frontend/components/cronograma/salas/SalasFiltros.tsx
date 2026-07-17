"use client"

// SalasFiltros — barra de filtros de unidade/núcleo/andar/capacidade/turno/status
// para a grade e o mapa de calor de Ocupação de Salas.

import { normTxt } from "@/lib/cronograma/constants"
import { CAPACIDADE_LABEL_CURTO } from "@/lib/cronograma/salasTypes"
import type { SalaCapacidade, SalaStatus, SalaComOcupacao } from "@/lib/cronograma/salasTypes"

export interface SalasFiltrosState {
  unidade: string
  nucleo: string
  andar: string
  capacidade: SalaCapacidade | ""
  turno: "Manhã" | "Tarde" | ""
  status: SalaStatus | ""
  /** Busca livre por nome de profissional alocado (ignora acentos/maiúsculas) */
  profissional: string
}

export const SALAS_FILTROS_VAZIO: SalasFiltrosState = {
  unidade: "", nucleo: "", andar: "", capacidade: "", turno: "", status: "", profissional: "",
}

interface SelectFiltroProps {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  /** Rótulo legível por opção (ex.: "unico" -> "Único") — opcional, usa o valor cru quando ausente. */
  labelFor?: (opcao: string) => string
}

function SelectFiltro({ label, value, options, onChange, labelFor }: SelectFiltroProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"
      >
        <option value="">Todos</option>
        {options.map(o => <option key={o} value={o}>{labelFor ? labelFor(o) : o}</option>)}
      </select>
    </label>
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
const STATUS_OPCOES: SalaStatus[] = ["ativa", "bloqueada", "adm"]
const TURNO_OPCOES = ["Manhã", "Tarde"] as const

export function SalasFiltros({ value, onChange, unidades, nucleos, andares }: SalasFiltrosProps) {
  function set<K extends keyof SalasFiltrosState>(key: K, v: SalasFiltrosState[K]) {
    onChange({ ...value, [key]: v })
  }

  const temFiltroAtivo = value.unidade || value.nucleo || value.andar || value.capacidade || value.turno || value.status || value.profissional

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card/60 p-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold text-muted-foreground uppercase tracking-wide">Profissional</span>
        <input
          type="text"
          value={value.profissional}
          onChange={e => set("profissional", e.target.value)}
          placeholder="Nome do profissional..."
          className="min-w-[180px] rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground"
        />
      </label>
      <SelectFiltro label="Unidade" value={value.unidade} options={unidades} onChange={v => set("unidade", v)} />
      <SelectFiltro label="Núcleo" value={value.nucleo} options={nucleos} onChange={v => set("nucleo", v)} />
      <SelectFiltro label="Andar" value={value.andar} options={andares} onChange={v => set("andar", v)} />
      <SelectFiltro
        label="Capacidade"
        value={value.capacidade}
        options={CAPACIDADE_OPCOES}
        onChange={v => set("capacidade", v as SalaCapacidade | "")}
        labelFor={o => CAPACIDADE_LABEL_CURTO[o as SalaCapacidade]}
      />
      <SelectFiltro
        label="Turno"
        value={value.turno}
        options={[...TURNO_OPCOES]}
        onChange={v => set("turno", v as "Manhã" | "Tarde" | "")}
      />
      <SelectFiltro
        label="Status"
        value={value.status}
        options={STATUS_OPCOES}
        onChange={v => set("status", v as SalaStatus | "")}
      />
      {temFiltroAtivo && (
        <button
          type="button"
          onClick={() => onChange(SALAS_FILTROS_VAZIO)}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/50"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}

export function aplicarFiltrosSala(
  filtro: SalasFiltrosState,
  sala: { unidade_nome: string; nucleo: string | null; andar: string | null; capacidade: SalaCapacidade; status: SalaStatus },
): boolean {
  if (filtro.unidade && sala.unidade_nome !== filtro.unidade) return false
  if (filtro.nucleo && (sala.nucleo ?? "") !== filtro.nucleo) return false
  if (filtro.andar && (sala.andar ?? "") !== filtro.andar) return false
  if (filtro.capacidade && sala.capacidade !== filtro.capacidade) return false
  if (filtro.status && sala.status !== filtro.status) return false
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