"use client"

// Disponibilidade Interna (Tarefa 4) — antes de abrir vaga de contratação,
// mostra se um profissional já contratado consegue cobrir a necessidade.
// Duas modalidades, na mesma lógica das 7 possibilidades de saida.ts:
//   1) Direto (E1) — o profissional já tem horário "Livre" exato na grade.
//   2) Via remanejamento (E2/E6/E7) — o profissional está ocupado ali com
//      OUTRO paciente, mas essa sessão pode ser movida pra ponta adjacente do
//      cronograma desse outro paciente (mesmo profissional, mesma regra de
//      remanejamento.ts já usada no painel de sugestões automáticas),
//      liberando o horário. Só é oferecida quando não há cobertura direta
//      no mesmo dia/hora/unidade/especialidade — sem duplicar a mesma vaga.

import { useEffect, useMemo, useState } from "react"
import { ArrowRightLeft, Users } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useGradeAgendamentos } from "@/hooks/useGradeAgendamentos"
import { avaliarPeriodo, calcularGaps, gapsParaMapa, type GapItem, type Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import { listarSlotsLivres } from "@/lib/cronograma/disponibilidadeInterna"
import { tentarRemanejamento } from "@/lib/cronograma/remanejamento"
import { TERAPIA_TO_ESP } from "@/lib/cronograma/constants"
import { turnoFromHora, turnoNome, fmtName } from "@/lib/cronograma/helpers"
import { SortableTh, ordenarPor, type SortDir } from "@/components/cronograma/ui/SortableTh"
import { Button } from "@/components/ui/button"
import { RemanejamentoDetalheModal } from "./RemanejamentoDetalheModal"
import type { RemanejamentoDetalhe } from "@/lib/cronograma/sugestaoContratacaoTypes"
import type { CsvRow } from "@/types/cronograma"

interface LinhaDisponibilidade {
  profissional: string
  dia: string
  turno: Turno
  hora: string
  unidade: string
  terapia: string
  especialidade: string
  modalidade: "direto" | "remanejamento"
  remanejamento?: RemanejamentoDetalhe
  pacientes: { pac: string; gap: number }[]
}

type SortKey = "profissional" | "dia" | "hora" | "unidade" | "especialidade" | "modalidade" | "qtdPacientes"

function linhasDiretas(rows: CsvRow[], gapMap: Record<string, GapItem>): LinhaDisponibilidade[] {
  const slotsLivres = listarSlotsLivres(rows).filter(s => s.especialidade)
  const cachePeriodo = new Map<string, ReturnType<typeof avaliarPeriodo>>()
  const out: LinhaDisponibilidade[] = []

  for (const slot of slotsLivres) {
    const especialidade = slot.especialidade as string
    const turno = turnoFromHora(slot.hora)
    const chave = `${slot.dia}|||${turno}|||${slot.unidade}|||${especialidade}`
    let periodo = cachePeriodo.get(chave)
    if (!periodo) {
      periodo = avaliarPeriodo(slot.dia, turno, slot.unidade, especialidade, rows, gapMap)
      cachePeriodo.set(chave, periodo)
    }
    const slotAvaliado = periodo.slots.find(s => s.hora === slot.hora)
    if (!slotAvaliado?.candidatos.length) continue

    out.push({
      profissional: slot.profissional, dia: slot.dia, turno, hora: slot.hora, unidade: slot.unidade,
      terapia: slot.terapia, especialidade, modalidade: "direto",
      pacientes: slotAvaliado.candidatos.map(c => ({ pac: c.pac, gap: c.gap })),
    })
  }
  return out
}

function linhasViaRemanejamento(
  rows: CsvRow[], gapMap: Record<string, GapItem>, jaCobertos: Set<string>,
): LinhaDisponibilidade[] {
  const cachePeriodo = new Map<string, ReturnType<typeof avaliarPeriodo>>()
  const vistos = new Set<string>()
  const out: LinhaDisponibilidade[] = []

  for (const row of rows) {
    if (row["Status do Agendamento"] !== "Agendado") continue
    const prof = row["Profissional"]
    const dia = row["Dia da Semana"]
    const hora = String(row.HI_str || "")
    const unidade = String(row.Unidade || "Desconhecida")
    const pacienteOcupante = row["Nome Favorecido"]
    if (!prof || !dia || !hora || !pacienteOcupante) continue

    const especialidade = TERAPIA_TO_ESP[row.Terapia]
    if (!especialidade) continue

    const chaveVista = `${dia}|||${hora}|||${unidade}|||${prof}`
    if (vistos.has(chaveVista)) continue
    vistos.add(chaveVista)

    const chaveCoberta = `${dia}|||${hora}|||${unidade}|||${especialidade}`
    if (jaCobertos.has(chaveCoberta)) continue // já tem cobertura direta ali — remanejamento seria redundante

    const turno = turnoFromHora(hora)
    const chavePeriodo = `${dia}|||${turno}|||${unidade}|||${especialidade}`
    let periodo = cachePeriodo.get(chavePeriodo)
    if (!periodo) {
      periodo = avaliarPeriodo(dia, turno, unidade, especialidade, rows, gapMap)
      cachePeriodo.set(chavePeriodo, periodo)
    }
    const slotAvaliado = periodo.slots.find(s => s.hora === hora)
    if (!slotAvaliado?.candidatos.length) continue

    const detalhe = tentarRemanejamento(pacienteOcupante, dia, hora, unidade, rows)
    if (!detalhe) continue

    out.push({
      profissional: prof, dia, turno, hora, unidade, terapia: row.Terapia, especialidade,
      modalidade: "remanejamento", remanejamento: detalhe,
      pacientes: slotAvaliado.candidatos.map(c => ({ pac: c.pac, gap: c.gap })),
    })
  }
  return out
}

function useLinhasDisponibilidade(): { linhas: LinhaDisponibilidade[]; loading: boolean; error: string | null; refWeekLabel: string; cRows: CsvRow[] } {
  const { cRows: rows, loading, error, refWeek } = useGradeAgendamentos()
  const { lRows } = useCronogramaData()

  const linhas = useMemo((): LinhaDisponibilidade[] => {
    if (!rows.length) return []
    const gapMap = gapsParaMapa(calcularGaps(lRows, rows))
    const diretas = linhasDiretas(rows, gapMap)
    const cobertas = new Set(diretas.map(l => `${l.dia}|||${l.hora}|||${l.unidade}|||${l.especialidade}`))
    const remanejadas = linhasViaRemanejamento(rows, gapMap, cobertas)
    return [...diretas, ...remanejadas]
  }, [rows, lRows])

  return { linhas, loading, error, refWeekLabel: refWeek.label, cRows: rows }
}

export function DisponibilidadeInternaView() {
  const { linhas, loading, error, refWeekLabel, cRows } = useLinhasDisponibilidade()
  const { setHeader } = useHeader()
  const [detalhe, setDetalhe] = useState<LinhaDisponibilidade | null>(null)

  useEffect(() => {
    setHeader("Ocupar Profissionais Disponíveis", `Profissionais já contratados que cobririam sessões pendentes (direto ou via remanejamento) — semana de referência: ${refWeekLabel}`)
    return () => setHeader("", "")
  }, [refWeekLabel, setHeader])

  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "qtdPacientes", dir: "desc" })

  const linhasCalc = useMemo(() =>
    linhas.map(l => ({ ...l, qtdPacientes: l.pacientes.length })),
  [linhas])

  const linhasOrdenadas = useMemo(
    () => ordenarPor(linhasCalc, sort.key, sort.dir),
    [linhasCalc, sort.key, sort.dir],
  )

  const qtdDireto = linhas.filter(l => l.modalidade === "direto").length
  const qtdRemanejamento = linhas.length - qtdDireto

  function onSortClick(key: string) {
    setSort(prev => ({ key: key as SortKey, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      Carregando disponibilidade interna...
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center py-24 text-sm text-destructive">
      Erro ao carregar dados: {error}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-4 py-3 text-xs text-sky-900 dark:text-sky-200">
        <strong>{linhasOrdenadas.length}</strong> oportunidade(s) de cobertura interna antes de abrir vaga de contratação —{" "}
        <strong>{qtdDireto}</strong> com horário já livre, <strong>{qtdRemanejamento}</strong> possíveis via remanejamento de uma sessão já existente.
      </div>

      {!linhasOrdenadas.length ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum profissional interno (direto ou via remanejamento) cobre pacientes com sessões pendentes na semana de referência.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <SortableTh label="Profissional" sortKey="profissional" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Dia" sortKey="dia" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Horário" sortKey="hora" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Unidade" sortKey="unidade" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Especialidade" sortKey="especialidade" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Modalidade" sortKey="modalidade" activeKey={sort.key} dir={sort.dir} onClick={onSortClick} />
                <SortableTh label="Pacientes cobertos" sortKey="qtdPacientes" activeKey={sort.key} dir={sort.dir} align="right" onClick={onSortClick} />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {linhasOrdenadas.map((l, i) => {
                const direto = l.modalidade === "direto"
                return (
                  <tr key={`${l.profissional}|${l.dia}|${l.hora}|${l.terapia}|${i}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-bold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={12} className="text-muted-foreground" />
                        {fmtName(l.profissional)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground">{l.dia.replace("-feira", "")}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-foreground">{turnoNome[l.turno]}</span>{" "}
                      <span className="font-mono tabular-nums text-foreground">{l.hora}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground">{l.unidade}</td>
                    <td className="px-3 py-2 text-foreground">{l.especialidade}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        direto
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                          : "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400"
                      }`}>
                        {!direto && <ArrowRightLeft size={10} />}
                        {direto ? "Direto" : "Via remanejamento"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400">{l.pacientes.length}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.pacientes.map(p => `${p.pac} (−${p.gap})`).join(", ")}
                      {!direto && (
                        <Button variant="outline" size="xs" className="ml-2" onClick={() => setDetalhe(l)}>
                          Ver antes/depois
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalhe?.remanejamento && detalhe.pacientes[0] && (
        <RemanejamentoDetalheModal
          paciente={detalhe.remanejamento.pacienteRemanejado}
          terapiaHipotetica={detalhe.terapia}
          profissionalHipotetico={detalhe.profissional}
          remanejamento={detalhe.remanejamento}
          cRows={cRows}
          onClose={() => setDetalhe(null)}
        />
      )}
    </div>
  )
}
