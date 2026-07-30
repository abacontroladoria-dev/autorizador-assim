"use client"

// SalasGridView — visão grade: sala × dia da semana, com Manhã empilhada
// acima de Tarde (2 linhas por sala) em vez de lado a lado — colunas de dia
// ficam mais largas e a semana cabe melhor na tela. Cada slot mostra as
// alocações (planejamento — quem é o responsável recorrente daquele bloco),
// clicáveis para editar/mover; uma linha "Livre+" por vaga ainda disponível
// (repete conforme a capacidade — duplo/múltiplo mostram mais de uma) abre o
// modal de nova alocação. Reproduz o fluxo de edição do calculadora-remuneracao.

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Eye, EyeOff, Pencil } from "lucide-react"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { AlocarSessaoModal } from "@/components/cronograma/salas/AlocarSessaoModal"
import { profissionalBateComBusca } from "@/components/cronograma/salas/SalasFiltros"
import { tCor } from "@/lib/cronograma/constants"
import { CAPACIDADE_LABEL_CURTO } from "@/lib/cronograma/salasTypes"
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
  "Tarde": "bg-slate-200/70 dark:bg-white/[0.06]",
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
  /** Alterna o modo solo: mostra só esta sala na visão atual. Clicar de novo (ou no botão "voltar para todas" acima da tabela) restaura as demais. */
  onIsolarSala: (id: string, nome: string) => void
  /** Id da sala em modo solo, se houver — usado só para trocar o ícone do botão para indicar o estado ativo. */
  salaIsoladaId: string | null
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

export function SalasGridView({ salas, onEditarSala, onIsolarSala, salaIsoladaId, encontrarAlocacaoDoProfissional, onRecarregar, buscaProfissional = "" }: SalasGridViewProps) {
  const [modal, setModal] = useState<ModalState | null>(null)

  const salaRowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  /** Sala isolada mais recente — guardado à parte porque `salaIsoladaId` já
      vira null no MESMO clique que dispara o efeito abaixo (precisamos saber
      pra qual sala rolar de volta). */
  const lastIsoladaIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (salaIsoladaId) {
      lastIsoladaIdRef.current = salaIsoladaId
      return
    }
    // `salaIsoladaId` acabou de virar null (voltou a mostrar todas) — rola de
    // volta pra onde a sala isolada estava, em vez de deixar o scroll "preso"
    // no topo da lista completa (onde a página ficava enquanto só 1 sala
    // estava visível).
    const alvo = lastIsoladaIdRef.current
    if (!alvo) return
    salaRowRefs.current.get(alvo)?.scrollIntoView({ block: "center" })
    lastIsoladaIdRef.current = null
  }, [salaIsoladaId])

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
              <tr
                key={`${sala.id}-${turno}`}
                ref={turnoIdx === 0 ? (el => {
                  if (el) salaRowRefs.current.set(sala.id, el)
                  else salaRowRefs.current.delete(sala.id)
                }) : undefined}
                className={`${TURNO_ROW_BG[turno]} hover:brightness-95 dark:hover:brightness-125`}
              >
                {turnoIdx === 0 && (
                  <td
                    rowSpan={2}
                    className="sticky left-0 z-10 w-[200px] max-w-[200px] border-t border-border bg-card px-2.5 py-2 align-top"
                  >
                    <div className="flex items-start gap-1.5">
                      <div className="mt-0.5 flex shrink-0 flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => onEditarSala(sala.id)}
                          aria-label={`Editar ${sala.nome_exibicao}`}
                          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onIsolarSala(sala.id, sala.nome_exibicao)}
                          aria-label={salaIsoladaId === sala.id ? `Voltar a mostrar todas as salas` : `Mostrar só ${sala.nome_exibicao}`}
                          title={salaIsoladaId === sala.id ? "Voltar a mostrar todas as salas" : "Mostrar só esta sala"}
                          className={`rounded-md p-1 hover:bg-muted hover:text-foreground ${salaIsoladaId === sala.id ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}
                        >
                          {salaIsoladaId === sala.id ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-foreground" title={sala.nome_exibicao}>{sala.nome_exibicao}</div>
                        <div className="truncate text-[11px] text-muted-foreground" title={sala.unidade_nome}>{sala.unidade_nome}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                            {CAPACIDADE_LABEL_CURTO[sala.capacidade]}
                          </span>
                          {sala.nucleo && (
                            <span className="truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title={sala.nucleo}>
                              {sala.nucleo}
                            </span>
                          )}
                          {sala.andar && (
                            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {sala.andar}º andar
                            </span>
                          )}
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

  const buscaAtiva = buscaProfissional.trim().length > 0

  return (
    <td className={`group w-[190px] max-w-[190px] border-l border-border px-1 py-1.5 align-top ${bordaCls} ${slot.inconsistente ? "bg-red-100 ring-2 ring-inset ring-red-500 dark:bg-red-950/40 dark:ring-red-500" : ""}`}>
      <div className="flex flex-col gap-1">
        {slot.inconsistente && (
          <div className="flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight text-white shadow-sm dark:bg-red-500">
            <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            Excede capacidade
          </div>
        )}
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
              className={`flex min-h-[38px] w-full flex-col justify-center gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 ${bate ? "bg-amber-100 ring-1 ring-amber-400 dark:bg-amber-950/40 dark:ring-amber-500" : ""} ${buscaAtiva && !bate ? "opacity-35" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                  style={{ background: tCor(card.terapiaNome ?? "", true) }}
                />
                <span className={`min-w-0 flex-1 truncate text-[11px] font-medium leading-tight ${slot.inconsistente ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>
                  {card.profissionalNome}
                </span>
              </span>
              <span className="flex items-center justify-between gap-1 pl-3.5">
                <span className="truncate text-[10px] leading-tight text-muted-foreground">{card.terapiaNome || "—"}</span>
                <span className={`shrink-0 text-[10px] font-semibold leading-tight ${ratioCor}`}>{ratioTexto}</span>
              </span>
            </button>
          )
        })}

        {/* Uma linha "Livre+" por vaga realmente disponível (capacidade - já
            alocados) — repete quando a capacidade é dupla/múltipla, em vez de
            um "Livre" isolado quando vazio e um "+Alocar" separado quando já
            tem alguém. Mesma min-h dos cards de alocação (acima) — sem isso,
            um card (2 linhas de texto) é mais alto que o pill "Livre+", e a
            posição de cada "vaga" (1ª, 2ª, 3ª...) desalinha entre colunas
            vizinhas que têm quantidades diferentes de alocação × livre. */}
        {Array.from({ length: Math.max(0, slot.capacidadeProjetada - slot.alocacoes.length) }).map((_, i) => (
          <button
            key={`livre-${i}`}
            type="button"
            onClick={() => onAbrirModal({ sala, dow: slot.dow, turno: slot.turno, diaLabel })}
            title="Alocar profissional neste bloco"
            className="flex min-h-[38px] w-full items-center justify-center opacity-70 transition-opacity hover:opacity-100"
          >
            <StatusPill tone="slate" dense>Livre+</StatusPill>
          </button>
        ))}
      </div>
    </td>
  )
}
