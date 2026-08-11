"use client"

// Agenda do PROFISSIONAL (não do paciente) antes/depois de um remanejamento —
// mesma ideia visual de RemanejamentoDetalheModal, só que o eixo é o
// profissional: cada célula mostra qual PACIENTE ele atende naquele horário,
// não qual profissional atende o paciente. Existe porque, na tela "Ocupar
// Profissionais Disponíveis", o gestor pensa em termos da agenda do
// profissional já contratado ("o que muda na semana dele"), não da agenda do
// paciente que ele vai passar a atender.

import { useMemo } from "react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { Button } from "@/components/ui/button"
import { DIAS_UTIL } from "@/lib/cronograma/constants"
import { diaCurto, fmtName } from "@/lib/cronograma/helpers"
import type { CsvRow } from "@/types/cronograma"
import type { RemanejamentoDetalhe } from "@/lib/cronograma/sugestaoContratacaoTypes"

interface Props {
  profissional: string
  /** Paciente que passaria a ser atendido no horário liberado (r.de). */
  pacienteHipotetico: string
  terapiaHipotetica: string
  remanejamento: RemanejamentoDetalhe
  cRows: CsvRow[]
  onClose: () => void
}

type Tag = "existente" | "sai" | "movida" | "hipotetica"

interface Celula { terapia: string; paciente: string; tag: Tag }

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }

const ESTILO_CELULA: Record<Tag, string> = {
  existente: "border-border bg-muted",
  sai: "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30",
  movida: "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30",
  hipotetica: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30",
}

const ROTULO_CELULA: Record<Tag, string> = {
  existente: "", sai: "Sai daqui", movida: "Entra aqui (mesmo paciente, novo horário)", hipotetica: "Novo paciente aqui",
}

function Grade({ mapa, titulo, dias, horas }: { mapa: Record<string, Celula>; titulo: string; dias: string[]; horas: string[] }) {
  return (
    <div>
      <div className="mb-2 text-sm font-extrabold text-foreground">{titulo}</div>
      <table className="border-collapse text-[11px]" style={{ width: `${56 + dias.length * 128}px` }}>
        <thead>
          <tr>
            <th className="w-14" />
            {dias.map(d => (
              <th key={d} className="pb-1.5 text-center text-[11px] font-bold text-foreground">{diaCurto(d)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horas.map(hora => (
            <tr key={hora} className="border-t border-border">
              <td className="py-1 pr-2 text-right font-mono text-[10px] font-semibold text-muted-foreground">{hora}</td>
              {dias.map(dia => {
                const c = mapa[`${dia}|||${hora}`]
                if (!c) return <td key={dia} className="p-0.5" />
                return (
                  <td key={dia} className="p-0.5">
                    <div className={`rounded-lg border px-2 py-1.5 ${ESTILO_CELULA[c.tag]}`}>
                      <div className="text-[11px] font-bold leading-tight text-foreground">{c.terapia}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtName(c.paciente)}</div>
                      {!!ROTULO_CELULA[c.tag] && (
                        <div className="mt-0.5 text-[10px] font-bold text-foreground">{ROTULO_CELULA[c.tag]}</div>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProfissionalAgendaRemanejamentoModal({
  profissional, pacienteHipotetico, terapiaHipotetica, remanejamento: r, cRows, onClose,
}: Props) {
  // Semana COMPLETA do profissional, não só os dias envolvidos no
  // remanejamento — mesmo padrão de RemanejamentoDetalheModal, pra dar
  // contexto total da agenda dele antes e depois.
  const sessoesAtuais = useMemo(() => {
    const vistos = new Set<string>()
    const res: { dia: string; hora: string; terapia: string; paciente: string }[] = []
    for (const row of cRows) {
      if (row["Profissional"] !== profissional || row["Status do Agendamento"] !== "Agendado") continue
      const k = `${row["Dia da Semana"]}|||${hiStr(row)}`
      if (vistos.has(k)) continue
      vistos.add(k)
      res.push({ dia: row["Dia da Semana"], hora: hiStr(row), terapia: row.Terapia, paciente: row["Nome Favorecido"] })
    }
    return res
  }, [cRows, profissional])

  const dias = useMemo(() => {
    const vistos = new Set([...sessoesAtuais.map(s => s.dia), r.de.dia, r.para.dia])
    return DIAS_UTIL.filter(d => vistos.has(d))
  }, [sessoesAtuais, r])

  function montarMapa(fase: "antes" | "depois"): Record<string, Celula> {
    const mapa: Record<string, Celula> = {}
    for (const s of sessoesAtuais) {
      const ehConflito = s.dia === r.de.dia && s.hora === r.de.hora
      if (ehConflito) {
        if (fase === "antes") mapa[`${s.dia}|||${s.hora}`] = { terapia: s.terapia, paciente: s.paciente, tag: "sai" }
        continue // no "depois" essa posição vira o novo paciente hipotético, tratada abaixo
      }
      mapa[`${s.dia}|||${s.hora}`] = { terapia: s.terapia, paciente: s.paciente, tag: "existente" }
    }
    if (fase === "depois") {
      mapa[`${r.para.dia}|||${r.para.hora}`] = { terapia: r.terapiaRemanejada, paciente: r.pacienteRemanejado, tag: "movida" }
      mapa[`${r.de.dia}|||${r.de.hora}`] = { terapia: terapiaHipotetica, paciente: pacienteHipotetico, tag: "hipotetica" }
    }
    return mapa
  }

  const mapaAntes = montarMapa("antes")
  const mapaDepois = montarMapa("depois")
  const horas = [...new Set([...Object.keys(mapaAntes), ...Object.keys(mapaDepois)].map(k => k.split("|||")[1]))].sort()

  return (
    <ScheduleModal
      title={fmtName(profissional)}
      maxWidth={820}
      onClose={onClose}
      subtitle={
        <StatusPill tone="blue" variant="solid" dense>
          Remanejar {r.terapiaRemanejada} ({fmtName(r.pacienteRemanejado)}) de {diaCurto(r.de.dia)} {r.de.hora} para{" "}
          {diaCurto(r.para.dia)} {r.para.hora}, liberando pra {fmtName(pacienteHipotetico)}
        </StatusPill>
      }
      footer={<Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>}
    >
      <div className="mb-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30" /> Sai do lugar</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30" /> Entra no novo horário</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Paciente novo</span>
      </div>
      <div className="flex flex-col gap-6">
        <div className="overflow-x-auto"><Grade mapa={mapaAntes} titulo="Antes" dias={dias} horas={horas} /></div>
        <div className="overflow-x-auto"><Grade mapa={mapaDepois} titulo="Depois" dias={dias} horas={horas} /></div>
      </div>
    </ScheduleModal>
  )
}
