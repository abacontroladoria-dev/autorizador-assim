"use client"

// PacienteAgendaHipotetica — semana completa do paciente com 1 sessão
// hipotética destacada (verde) num dia/hora específico. Extraído do
// DetalheModal de SimulacaoNovoPrestadorTab.tsx (que só cobria o caso "novo
// profissional") pra ser reaproveitado também em DisponibilidadeInternaView
// (cobertura "direta" — profissional já contratado, sem remanejamento).

import { useMemo } from "react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { UnitHeaderBadges, CronoGlobalUnitBadge } from "@/components/cronograma/ui/UnitBadges"
import { Button } from "@/components/ui/button"
import { DIAS_UTIL, ESP_CLINICO, EXCLUIR_OCUP } from "@/lib/cronograma/constants"
import { buildCronoUnitMeta, diaCurto, fmtName, shouldShowSessionUnit, turnoNome, unidadeBadgeText } from "@/lib/cronograma/helpers"
import type { Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import type { CsvRow } from "@/types/cronograma"

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }

interface SlotHipotetico { dia: string; turno: Turno; hora: string; unidade: string }

interface Props {
  paciente: string
  slot: SlotHipotetico
  especialidade: string
  /** Quem passa a atender essa sessão hipotética — "Novo profissional" (contratação) por padrão, ou o nome de um profissional já existente (disponibilidade interna). */
  profissionalHipotetico?: string
  cRows: CsvRow[]
  onClose: () => void
}

export function PacienteAgendaHipoteticaModal({
  paciente, slot, especialidade, profissionalHipotetico = "Novo profissional", cRows, onClose,
}: Props) {
  const terapiaProposta = (ESP_CLINICO[especialidade] || [especialidade]).filter(t => !EXCLUIR_OCUP.has(t))[0] || especialidade

  const sessoesPaciente = useMemo(() => {
    const vistos = new Set<string>()
    const res: { dia: string; hora: string; terapia: string; prof: string; unidade: string }[] = []
    for (const r of cRows) {
      if (r["Nome Favorecido"] !== paciente || r["Status do Agendamento"] !== "Agendado") continue
      const k = `${r["Dia da Semana"]}|||${hiStr(r)}|||${r.Terapia}|||${r.Profissional}`
      if (vistos.has(k)) continue
      vistos.add(k)
      res.push({ dia: r["Dia da Semana"], hora: hiStr(r), terapia: r.Terapia, prof: r.Profissional, unidade: String(r.Unidade || "Desconhecida") })
    }
    return res
  }, [paciente, cRows])

  type CelulaInfo = { terapia: string; prof: string; proposta: boolean; unidade: string }
  const mapaCelulas: Record<string, CelulaInfo[]> = {}
  for (const s of sessoesPaciente) {
    const k = `${s.dia}|||${s.hora}`
    ;(mapaCelulas[k] ??= []).push({ terapia: s.terapia, prof: s.prof, proposta: false, unidade: s.unidade })
  }
  const kProposta = `${slot.dia}|||${slot.hora}`
  ;(mapaCelulas[kProposta] ??= []).push({ terapia: terapiaProposta, prof: profissionalHipotetico, proposta: true, unidade: slot.unidade })

  const diasComSessao = [...new Set([slot.dia, ...sessoesPaciente.map(s => s.dia)])]
    .sort((a, b) => DIAS_UTIL.indexOf(a as typeof DIAS_UTIL[number]) - DIAS_UTIL.indexOf(b as typeof DIAS_UTIL[number]))
  const horasGrid = [...new Set(Object.keys(mapaCelulas).map(k => k.split("|||")[1]))].sort()
  const unitMeta = buildCronoUnitMeta(
    diasComSessao,
    Object.fromEntries(Object.entries(mapaCelulas).map(([k, cs]) => [k, cs.map(c => ({ tP: c.terapia, unidade: c.unidade }))])),
  )

  return (
    <ScheduleModal
      title={paciente}
      maxWidth={860}
      onClose={onClose}
      subtitle={
        <div className="flex flex-wrap gap-1.5">
          <CronoGlobalUnitBadge unit={unitMeta.globalUnit} />
          <StatusPill tone="green" variant="solid" dense>
            Hipótese: {terapiaProposta} ({fmtName(profissionalHipotetico)}) · {diaCurto(slot.dia)} {turnoNome[slot.turno]} {slot.hora} · {slot.unidade}
          </StatusPill>
        </div>
      }
      footer={<Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>}
    >
      <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Sessão hipotética</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-border bg-muted" /> Sessão existente</span>
      </div>
      {!horasGrid.length ? (
        <div className="py-8 text-center text-muted-foreground">Nenhuma sessão encontrada.</div>
      ) : (
        <table className="w-full min-w-[380px] border-collapse">
          <thead><tr>
            <th className="w-[52px] pb-2 pr-2.5 text-right text-xs font-normal text-muted-foreground">Hora</th>
            {diasComSessao.map(d => (
              <th key={d} className={`min-w-[130px] pb-2 text-center text-[13px] font-extrabold ${d === slot.dia ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>
                <div>{diaCurto(d)} {d === slot.dia && <span className="ml-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 px-1 py-px text-[10px] text-emerald-700 dark:text-emerald-400">hipótese</span>}</div>
                <UnitHeaderBadges dayMeta={unitMeta.byDay[d]} globalUnit={unitMeta.globalUnit} />
              </th>
            ))}
          </tr></thead>
          <tbody>
            {horasGrid.map(hora => (
              <tr key={hora} className="border-t border-border">
                <td className={`pr-2.5 pt-2 text-right align-top font-mono text-[13px] font-extrabold tabular-nums ${hora === slot.hora ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>{hora}</td>
                {diasComSessao.map(d => {
                  const celulas = mapaCelulas[`${d}|||${hora}`] || []
                  return (
                    <td key={d} className="p-0.5 align-top">
                      {celulas.map((c, ci) => (
                        <div key={ci} className={`mb-0.5 flex min-h-[58px] flex-col gap-0.5 rounded-lg border px-2 py-1.5 ${c.proposta ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-muted"}`}>
                          <div className="text-xs font-bold leading-tight text-foreground">{c.terapia}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtName(c.prof)}</div>
                          {shouldShowSessionUnit(unitMeta, d, hora) && c.unidade && c.unidade !== "Desconhecida" && (
                            <div className="w-fit rounded-full bg-sky-50 dark:bg-sky-950/30 px-1.5 py-px text-[10px] font-extrabold text-sky-700 dark:text-sky-400">
                              {unidadeBadgeText(c.unidade)}
                            </div>
                          )}
                          {c.proposta && <div className="mt-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Sessão hipotética</div>}
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ScheduleModal>
  )
}
