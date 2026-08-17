"use client"

// VagaHorarioSelector — quando um horário (dia+hora) tem mais de um
// profissional/candidato disponível na visão por Categoria, esse seletor
// aparece antes de abrir o modal de detalhe: lista os profissionais
// disponíveis pra Oportunidade Direta (leva ao cronograma hipotético do
// paciente) numa seção, e os candidatos de Oportunidade via Remanejamento
// (leva ao "ver antes/depois") numa seção separada abaixo — mesmo espírito
// do dropdown "N profs." de OcupPacMode.tsx, adaptado pra uma grade densa
// (célula pequena) em vez de expandir a própria célula da tabela.

import { CalendarPlus, CheckCircle2, CircleDashed, Repeat2 } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { fmtName } from "@/lib/cronograma/helpers"
import type { VagaCategoria } from "@/lib/cronograma/ocupacaoCategoria"

interface Props {
  dia: string
  hora: string
  /** Todas as vagas desse dia+hora — inclusive as "livre" (só informativas, sem ação). */
  vagas: VagaCategoria[]
  onEscolherDireto: (v: VagaCategoria) => void
  onEscolherRemanejamento: (v: VagaCategoria) => void
  onEscolherNovoDia: (v: VagaCategoria) => void
  onClose: () => void
}

export function VagaHorarioSelector({ dia, hora, vagas, onEscolherDireto, onEscolherRemanejamento, onEscolherNovoDia, onClose }: Props) {
  const diretas = vagas.filter(v => v.status === "direto")
  const remanejamentos = vagas.filter(v => v.status === "remanejamento")
  const novoDias = vagas.filter(v => v.status === "novo-dia")
  const livres = vagas.filter(v => v.status === "livre")

  return (
    <ScheduleModal title={`${dia} · ${hora}`} subtitle="Mais de um profissional disponível nesse horário — veja quem é cada um." maxWidth={480} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        {diretas.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={13} /> Oportunidade direta
            </div>
            <div className="flex flex-col gap-1.5">
              {diretas.map((v, i) => (
                <button
                  key={`direto-${i}`}
                  type="button"
                  onClick={() => onEscolherDireto(v)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-left hover:brightness-95"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold text-foreground">{fmtName(v.profissional)}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{fmtName(v.paciente?.pac ?? "")} · {v.terapia}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">Ver agenda</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {remanejamentos.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-sky-700 dark:text-sky-400">
              <Repeat2 size={13} /> Oportunidade via remanejamento
            </div>
            <div className="flex flex-col gap-1.5">
              {remanejamentos.map((v, i) => (
                <button
                  key={`remanejamento-${i}`}
                  type="button"
                  onClick={() => onEscolherRemanejamento(v)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-left hover:brightness-95"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold text-foreground">{fmtName(v.profissional)}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{fmtName(v.paciente?.pac ?? "")} · {v.terapia}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] font-bold text-sky-700 dark:text-sky-400">Ver antes/depois</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {novoDias.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <CalendarPlus size={13} /> Oportunidade via novo dia
            </div>
            <div className="flex flex-col gap-1.5">
              {novoDias.map((v, i) => (
                <button
                  key={`novo-dia-${i}`}
                  type="button"
                  onClick={() => onEscolherNovoDia(v)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-left hover:brightness-95"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold text-foreground">{fmtName(v.profissional)}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{fmtName(v.paciente?.pac ?? "")} · {v.terapia}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] font-bold text-amber-700 dark:text-amber-400">Ver novo dia</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {livres.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-rose-700 dark:text-rose-400">
              <CircleDashed size={13} /> Livre, sem oportunidade
            </div>
            <div className="flex flex-col gap-1.5">
              {livres.map((v, i) => (
                <div
                  key={`livre-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/20 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-bold text-foreground">{fmtName(v.profissional)}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{v.terapia}</span>
                  </span>
                  <span className="shrink-0 text-[10.5px] font-bold text-rose-700 dark:text-rose-400">Sem candidato agora</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScheduleModal>
  )
}
