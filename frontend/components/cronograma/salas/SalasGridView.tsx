"use client"

// SalasGridView — visão grade: sala × dia da semana, com Manhã empilhada
// acima de Tarde (2 linhas por sala) em vez de lado a lado — colunas de dia
// ficam mais largas e a semana cabe melhor na tela. Cada slot mostra as
// alocações (planejamento — quem é o responsável recorrente daquele bloco),
// clicáveis para editar/mover; "Livre"/"+ Alocar" abre o modal de nova
// alocação. Reproduz o fluxo de edição do calculadora-remuneracao.

import { useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { AlocarSessaoModal } from "@/components/cronograma/salas/AlocarSessaoModal"
import { profissionalBateComBusca } from "@/components/cronograma/salas/SalasFiltros"
import { tCor } from "@/lib/cronograma/constants"
import type { SalaComOcupacao, SlotOcupacaoSala, Sala } from "@/lib/cronograma/salasTypes"
import type { AlocacaoAtual } from "@/hooks/useOcupacaoSalas"
import type { Tone } from "@/components/cronograma/ui/tones"

const DIAS = [
  { dow: 1, label: "Seg" },
  { dow: 2, label: "Ter" },
  { dow: 3, label: "Qua" },
  { dow: 4, label: "Qui" },
  { dow: 5, label: "Sex" },
] as const

const TURNOS = ["Manhã", "Tarde"] as const

/** Tinta neutra por turno (usa a própria paleta de cinza do sistema, funciona em light e dark) — só pra ficar claro onde a manhã termina e a tarde começa. */
const TURNO_ROW_BG: Record<(typeof TURNOS)[number], string> = {
  "Manhã": "",
  "Tarde": "bg-muted/40",
}

const STATUS_TONE: Record<SlotOcupacaoSala["status"], Tone> = {
  livre: "slate",
  ocupado: "green",
  parcial: "amber",
  bloqueado: "red",
  adm: "purple",
}

const STATUS_LABEL: Record<SlotOcupacaoSala["status"], string> = {
  livre: "Livre",
  ocupado: "Ocupado",
  parcial: "Parcial",
  bloqueado: "Bloqueado",
  adm: "ADM",
}

interface ModalState {
  sala: Sala
  dow: number
  turno: "Manhã" | "Tarde"
  diaLabel: string
  alocacaoId?: string
  profissionalInicial?: string
  terapiaInicial?: string | null
}

interface SalasGridViewProps {
  salas: SalaComOcupacao[]
  onEditarSala: (id: string) => void
  encontrarAlocacaoDoProfissional: (
    profissionalNome: string,
    dow: number,
    turno: "Manhã" | "Tarde",
    excetoAlocacaoId?: string,
  ) => AlocacaoAtual | null
  onRecarregar: () => void
  /** Texto do filtro de busca por profissional — usado só para destacar/esmaecer cards, nunca para escondê-los. */
  buscaProfissional?: string
}

export function SalasGridView({ salas, onEditarSala, encontrarAlocacaoDoProfissional, onRecarregar, buscaProfissional = "" }: SalasGridViewProps) {
  const [modal, setModal] = useState<ModalState | null>(null)

  if (!salas.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma sala cadastrada para os filtros selecionados.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Sala</th>
            <th className="w-10 border-l border-border bg-muted/40 px-1 py-2 text-center text-[10px] font-bold uppercase text-muted-foreground">Turno</th>
            {DIAS.map(d => (
              <th key={d.dow} className="border-l border-border px-2 py-2 text-center text-xs font-bold uppercase text-muted-foreground">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {salas.map(({ sala, slots }) => (
            TURNOS.map((turno, turnoIdx) => (
              <tr key={`${sala.id}-${turno}`} className={`${TURNO_ROW_BG[turno]} hover:brightness-95 dark:hover:brightness-125`}>
                {turnoIdx === 0 && (
                  <td
                    rowSpan={2}
                    className="sticky left-0 z-10 w-[150px] max-w-[150px] border-t border-border bg-card px-2.5 py-2 align-top"
                  >
                    <div className="flex items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditarSala(sala.id)}
                        aria-label={`Editar ${sala.nome_exibicao}`}
                        className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={14} />
                      </button>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-foreground">{sala.nome_exibicao}</div>
                        <div className="truncate text-[11px] text-muted-foreground" title={[sala.unidade_nome, sala.nucleo, sala.andar ? `${sala.andar}º andar` : null].filter(Boolean).join(" · ")}>
                          {sala.unidade_nome}
                          {sala.nucleo ? ` · ${sala.nucleo}` : ""}
                          {sala.andar ? ` · ${sala.andar}º andar` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                )}
                <td className={`w-10 border-l border-border px-1 py-1.5 text-center text-[10px] font-semibold text-muted-foreground ${turnoIdx === 0 ? "border-t" : ""}`}>
                  {turno === "Manhã" ? "M" : "T"}
                </td>
                {DIAS.map(d => (
                  <SlotCell
                    key={`${sala.id}-${d.dow}-${turno}`}
                    sala={sala}
                    diaLabel={d.label}
                    slot={slots.find(s => s.dow === d.dow && s.turno === turno)}
                    onAbrirModal={m => setModal(m)}
                    buscaProfissional={buscaProfissional}
                    bordaTopo={turnoIdx === 0}
                  />
                ))}
              </tr>
            ))
          ))}
        </tbody>
      </table>

      {modal && (
        <AlocarSessaoModal
          sala={modal.sala}
          dow={modal.dow}
          turno={modal.turno}
          diaLabel={modal.diaLabel}
          alocacaoId={modal.alocacaoId}
          profissionalInicial={modal.profissionalInicial}
          terapiaInicial={modal.terapiaInicial}
          encontrarAlocacaoDoProfissional={encontrarAlocacaoDoProfissional}
          onClose={() => setModal(null)}
          onSaved={onRecarregar}
        />
      )}
    </div>
  )
}

function SlotCell({
  sala, diaLabel, slot, onAbrirModal, buscaProfissional = "", bordaTopo,
}: {
  sala: Sala
  diaLabel: string
  slot: SlotOcupacaoSala | undefined
  onAbrirModal: (m: ModalState) => void
  buscaProfissional?: string
  bordaTopo: boolean
}) {
  const bordaCls = bordaTopo ? "border-t" : ""

  if (!slot) return <td className={`border-l border-border px-1 py-2 text-center text-muted-foreground ${bordaCls}`}>—</td>

  if (slot.status === "adm" || slot.status === "bloqueado") {
    return (
      <td className={`border-l border-border px-1 py-2 text-center ${bordaCls}`}>
        <StatusPill tone={STATUS_TONE[slot.status]} dense>{STATUS_LABEL[slot.status]}</StatusPill>
      </td>
    )
  }

  const podeAdicionar = slot.alocacoes.length < slot.capacidadeProjetada
  const buscaAtiva = buscaProfissional.trim().length > 0

  return (
    <td className={`group w-[190px] max-w-[190px] border-l border-border px-1 py-1.5 align-top ${bordaCls}`}>
      <div className="flex flex-col gap-1">
        {slot.alocacoes.map(card => {
          const ratioTexto = card.semCruzamentoCsv ? "—" : `${card.sessoesReais}/${card.sessoesCapacidadeTurno}`
          const ratioCor = card.semCruzamentoCsv
            ? "text-muted-foreground"
            : card.pctOcupacao !== null && card.pctOcupacao >= 0.8
              ? "text-emerald-600 dark:text-emerald-400"
              : card.pctOcupacao && card.pctOcupacao > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          const bate = buscaAtiva && profissionalBateComBusca(card.profissionalNome, buscaProfissional)
          return (
            <button
              key={card.alocacaoId}
              type="button"
              onClick={() => onAbrirModal({
                sala, dow: slot.dow, turno: slot.turno, diaLabel,
                alocacaoId: card.alocacaoId,
                profissionalInicial: card.profissionalNome,
                terapiaInicial: card.terapiaNome,
              })}
              title={`${card.profissionalNome}${card.terapiaNome ? " · " + card.terapiaNome : ""} · ${card.semCruzamentoCsv ? "sem cruzamento no CSV" : `${card.sessoesReais}/${card.sessoesCapacidadeTurno} com paciente`}${slot.inconsistente ? " · capacidade excedida" : ""}`}
              className={`flex w-full flex-col gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 ${bate ? "bg-amber-100 ring-1 ring-amber-400 dark:bg-amber-950/40 dark:ring-amber-500" : ""} ${buscaAtiva && !bate ? "opacity-35" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                  style={{ background: tCor(card.terapiaNome ?? "", true) }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-foreground">
                  {slot.inconsistente ? "⚠ " : ""}{card.profissionalNome}
                </span>
              </span>
              <span className="flex items-center justify-between gap-1 pl-3.5">
                <span className="truncate text-[10px] leading-tight text-muted-foreground">{card.terapiaNome || "—"}</span>
                <span className={`shrink-0 text-[10px] font-semibold leading-tight ${ratioCor}`}>{ratioTexto}</span>
              </span>
            </button>
          )
        })}

        {slot.alocacoes.length === 0 && (
          <button
            type="button"
            onClick={() => onAbrirModal({ sala, dow: slot.dow, turno: slot.turno, diaLabel })}
            className="inline-flex w-full justify-center py-0.5 opacity-70 transition-opacity hover:opacity-100"
          >
            <StatusPill tone="slate" dense>Livre</StatusPill>
          </button>
        )}

        {slot.alocacoes.length > 0 && podeAdicionar && (
          <button
            type="button"
            onClick={() => onAbrirModal({ sala, dow: slot.dow, turno: slot.turno, diaLabel })}
            title="Alocar mais um profissional neste bloco"
            aria-label="Alocar mais um profissional neste bloco"
            className="inline-flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Plus size={10} /> Alocar
          </button>
        )}
      </div>
    </td>
  )
}
