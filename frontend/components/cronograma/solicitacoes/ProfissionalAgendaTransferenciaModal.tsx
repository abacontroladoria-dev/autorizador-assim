"use client"

// Agenda do profissional de ORIGEM (quem está sendo liberado) antes/depois
// de uma transferência — o paciente que ele atendia naquele horário passa
// pra outro profissional equivalente, e um paciente novo (com necessidade
// pendente) entra no lugar.

import { useMemo } from "react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { StatusPill } from "@/components/cronograma/ui/StatusPill"
import { Button } from "@/components/ui/button"
import { DIAS_UTIL } from "@/lib/cronograma/constants"
import { diaCurto, fmtName } from "@/lib/cronograma/helpers"
import type { CsvRow } from "@/types/cronograma"
import type { TransferenciaProfissional } from "@/lib/cronograma/remanejamento"

interface Props {
  transferencia: TransferenciaProfissional
  pacienteNovo: string
  terapiaNova: string
  cRows: CsvRow[]
  onClose: () => void
}

type Tag = "existente" | "sai" | "hipotetica"

interface Celula { terapia: string; paciente: string; tag: Tag }

function hiStr(r: CsvRow): string { return String(r.HI_str || "") }

const ESTILO_CELULA: Record<Tag, string> = {
  existente: "border-border bg-muted",
  sai: "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30",
  hipotetica: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30",
}

const ROTULO_CELULA: Record<Tag, string> = {
  existente: "", sai: "Transferido pra outro profissional", hipotetica: "Paciente novo aqui",
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

export function ProfissionalAgendaTransferenciaModal({ transferencia: t, pacienteNovo, terapiaNova, cRows, onClose }: Props) {
  const sessoesAtuais = useMemo(() => {
    const vistos = new Set<string>()
    const res: { dia: string; hora: string; terapia: string; paciente: string }[] = []
    for (const row of cRows) {
      if (row["Profissional"] !== t.profissionalOrigem || row["Status do Agendamento"] !== "Agendado") continue
      const k = `${row["Dia da Semana"]}|||${hiStr(row)}`
      if (vistos.has(k)) continue
      vistos.add(k)
      res.push({ dia: row["Dia da Semana"], hora: hiStr(row), terapia: row.Terapia, paciente: row["Nome Favorecido"] })
    }
    return res
  }, [cRows, t.profissionalOrigem])

  const dias = useMemo(() => DIAS_UTIL.filter(d => sessoesAtuais.some(s => s.dia === d)), [sessoesAtuais])

  function montarMapa(fase: "antes" | "depois"): Record<string, Celula> {
    const mapa: Record<string, Celula> = {}
    for (const s of sessoesAtuais) {
      const ehConflito = s.dia === t.dia && s.hora === t.hora
      if (ehConflito) {
        mapa[`${s.dia}|||${s.hora}`] = fase === "antes"
          ? { terapia: s.terapia, paciente: s.paciente, tag: "sai" }
          : { terapia: terapiaNova, paciente: pacienteNovo, tag: "hipotetica" }
        continue
      }
      mapa[`${s.dia}|||${s.hora}`] = { terapia: s.terapia, paciente: s.paciente, tag: "existente" }
    }
    return mapa
  }

  const mapaAntes = montarMapa("antes")
  const mapaDepois = montarMapa("depois")
  const horas = [...new Set([...Object.keys(mapaAntes), ...Object.keys(mapaDepois)].map(k => k.split("|||")[1]))].sort()

  return (
    <ScheduleModal
      title={fmtName(t.profissionalOrigem)}
      maxWidth={820}
      onClose={onClose}
      subtitle={
        <StatusPill tone="blue" variant="solid" dense>
          Libera {diaCurto(t.dia)} {t.hora} · {t.unidade} transferindo {fmtName(t.paciente)} para {fmtName(t.profissionalDestino)}
        </StatusPill>
      }
      footer={<Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>}
    >
      <div className="mb-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30" /> Sai (vai pra outro profissional)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" /> Paciente novo</span>
      </div>
      <div className="flex flex-col gap-6">
        <div className="overflow-x-auto"><Grade mapa={mapaAntes} titulo="Antes" dias={dias} horas={horas} /></div>
        <div className="overflow-x-auto"><Grade mapa={mapaDepois} titulo="Depois" dias={dias} horas={horas} /></div>
      </div>
    </ScheduleModal>
  )
}
