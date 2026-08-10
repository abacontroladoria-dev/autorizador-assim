"use client"

// Detalhamento da "Projeção financeira" — existe pra provar a conta: lista
// sessão a sessão, com DATA REAL do calendário (não só "toda segunda"),
// excluindo feriados, exatamente como getCalendario/Previsão de Receitas
// fazem. Dois cenários: fila prioritária aceita (o que já aparece no resumo)
// e "pelo menos um aceita" (faixa considerando o 2º candidato de cada vaga,
// quando existir).

import { useMemo } from "react"
import { Wallet } from "lucide-react"
import { ScheduleModal } from "@/components/cronograma/ui/ScheduleModal"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { Button } from "@/components/ui/button"
import { dowDeDiaSemana } from "@/lib/cronograma/salas"
import { terapiaDaEspecialidade, primeiroConvenioDoPaciente } from "@/lib/cronograma/sugestaoContratacao"
import { diaCurto, fmtReal, turnoNome } from "@/lib/cronograma/helpers"
import { fmtData } from "@/lib/cronograma/formatters"
import type { FeriadoInfo } from "@/types/feriados"
import type { CsvRow } from "@/types/cronograma"
import type { Turno } from "@/lib/cronograma/simulacaoNovoPrestador"
import type { CandidatoNaSugestao, SugestaoContratacao } from "@/lib/cronograma/sugestaoContratacaoTypes"

interface Props {
  periodosEnriquecidos: SugestaoContratacao[]
  mesReferencia: { ano: number; mes: number } | null
  labelMesReferencia: string
  feriados: Record<string, FeriadoInfo>
  cRows: CsvRow[]
  onClose: () => void
}

interface Ocorrencia {
  data: string
  dataLabel: string
  diaSemana: string
  hora: string
  turno: Turno
  paciente: string
  terapia: string
  sala: string
  unidade: string
  convenio: string
  valor: number | null
}

/** Datas reais (ISO) de cada dia da semana (1-5) dentro do mês, excluindo
 *  feriados — mesma regra de exclusão de getCalendario, só que devolvendo as
 *  datas em vez de só a contagem, pra poder listar sessão por sessão. */
function diasDoMesPorDow(ano: number, mes: number, feriados: Record<string, FeriadoInfo>): Record<1 | 2 | 3 | 4 | 5, string[]> {
  const resultado: Record<1 | 2 | 3 | 4 | 5, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  const dim = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(ano, mes - 1, d)
    const dow = dt.getDay()
    if (dow < 1 || dow > 5) continue
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (feriados[iso]) continue
    resultado[dow as 1 | 2 | 3 | 4 | 5].push(iso)
  }
  return resultado
}

function candidatosPorVaga(candidatos: CandidatoNaSugestao[]): Map<string, CandidatoNaSugestao[]> {
  const mapa = new Map<string, CandidatoNaSugestao[]>()
  for (const c of candidatos) {
    const chave = `${c.turno}|||${c.hora}`
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave)!.push(c)
  }
  return mapa
}

export function ProjecaoFinanceiraDetalheModal({
  periodosEnriquecidos, mesReferencia, labelMesReferencia, feriados, cRows, onClose,
}: Props) {
  const porDow = useMemo(
    () => mesReferencia ? diasDoMesPorDow(mesReferencia.ano, mesReferencia.mes, feriados) : null,
    [mesReferencia, feriados],
  )

  const ocorrencias = useMemo((): Ocorrencia[] => {
    if (!porDow) return []
    const linhas: Ocorrencia[] = []
    for (const s of periodosEnriquecidos) {
      const dow = dowDeDiaSemana(s.dia)
      if (dow === null) continue
      const datas = porDow[dow as 1 | 2 | 3 | 4 | 5]
      const terapia = terapiaDaEspecialidade(s.especialidade)
      for (const candidatos of candidatosPorVaga(s.candidatos).values()) {
        const melhor = candidatos.find(c => c.ordemNaVaga === 1)
        if (!melhor) continue
        const convenio = primeiroConvenioDoPaciente(melhor.paciente, cRows)
        for (const data of datas) {
          linhas.push({
            data, dataLabel: fmtData(data), diaSemana: s.dia, hora: melhor.hora, turno: melhor.turno,
            paciente: melhor.paciente, terapia,
            sala: s.salaVinculada?.numeroSala ?? "—", unidade: s.unidade,
            convenio, valor: melhor.valorSessaoProjetado,
          })
        }
      }
    }
    return linhas.sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora))
  }, [periodosEnriquecidos, porDow, cRows])

  const resumoPorDia = useMemo(() => {
    const mapa = new Map<string, { data: string; dataLabel: string; diaSemana: string; qtd: number; receita: number }>()
    for (const o of ocorrencias) {
      const atual = mapa.get(o.data) ?? { data: o.data, dataLabel: o.dataLabel, diaSemana: o.diaSemana, qtd: 0, receita: 0 }
      atual.qtd += 1
      atual.receita += o.valor ?? 0
      mapa.set(o.data, atual)
    }
    return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data))
  }, [ocorrencias])

  const totalCenario1 = useMemo(() => ocorrencias.reduce((s, o) => s + (o.valor ?? 0), 0), [ocorrencias])

  const totalCenario2 = useMemo(() => {
    if (!porDow) return 0
    let total = 0
    for (const s of periodosEnriquecidos) {
      const dow = dowDeDiaSemana(s.dia)
      if (dow === null) continue
      const ocorrenciasMes = porDow[dow as 1 | 2 | 3 | 4 | 5].length
      for (const candidatos of candidatosPorVaga(s.candidatos).values()) {
        const segundo = candidatos.find(c => c.ordemNaVaga === 2) ?? candidatos.find(c => c.ordemNaVaga === 1)
        total += (segundo?.valorSessaoProjetado ?? 0) * ocorrenciasMes
      }
    }
    return total
  }, [periodosEnriquecidos, porDow])

  const faixaMin = Math.min(totalCenario1, totalCenario2)
  const faixaMax = Math.max(totalCenario1, totalCenario2)

  return (
    <ScheduleModal
      title="Detalhamento da projeção financeira"
      subtitle={labelMesReferencia}
      maxWidth={980}
      onClose={onClose}
      footer={<Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard tone="green" icon={<Wallet size={15} />} label="Cenário 1 — fila prioritária aceita">
          <div className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-400">{fmtReal(totalCenario1)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Soma do melhor candidato de cada vaga, em todas as ocorrências reais do mês.</div>
        </StatCard>
        <StatCard tone="blue" icon={<Wallet size={15} />} label="Cenário 2 — faixa se pelo menos um aceitar">
          <div className="text-lg font-black tabular-nums text-sky-700 dark:text-sky-400">{fmtReal(faixaMin)} – {fmtReal(faixaMax)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Pior caso: o 2º candidato de cada vaga aceita no lugar do 1º (vagas com um só candidato mantêm o mesmo valor).
          </div>
        </StatCard>
      </div>

      <div className="mb-2 text-sm font-extrabold text-foreground">Receita por dia do mês</div>
      <div className="mb-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Data</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dia da semana</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sessões</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Receita do dia</th>
            </tr>
          </thead>
          <tbody>
            {resumoPorDia.map(row => (
              <tr key={row.data} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5 font-mono tabular-nums text-foreground">{row.dataLabel}</td>
                <td className="px-3 py-1.5 text-foreground">{diaCurto(row.diaSemana)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{row.qtd}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{fmtReal(row.receita)}</td>
              </tr>
            ))}
            {!resumoPorDia.length && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Sem ocorrências no mês de referência.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-2 text-sm font-extrabold text-foreground">Sessão a sessão (cenário 1)</div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Data</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Hora</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Paciente</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Terapia</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sala</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Unidade</th>
              <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Convênio</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Valor</th>
            </tr>
          </thead>
          <tbody>
            {ocorrencias.map((o, i) => (
              <tr key={`${o.data}-${o.hora}-${o.paciente}-${i}`} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5 font-mono tabular-nums text-foreground">{o.dataLabel}</td>
                <td className="px-3 py-1.5">
                  <span className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-400">{turnoNome[o.turno]}</span>{" "}
                  <span className="font-mono tabular-nums text-foreground">{o.hora}</span>
                </td>
                <td className="px-3 py-1.5 text-foreground">{o.paciente}</td>
                <td className="px-3 py-1.5 text-foreground">{o.terapia}</td>
                <td className="px-3 py-1.5 text-foreground">{o.sala}</td>
                <td className="px-3 py-1.5 text-foreground">{o.unidade}</td>
                <td className="px-3 py-1.5 text-foreground">{o.convenio}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{o.valor !== null ? fmtReal(o.valor) : "Sem valor"}</td>
              </tr>
            ))}
            {!ocorrencias.length && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Sem ocorrências no mês de referência.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ScheduleModal>
  )
}
