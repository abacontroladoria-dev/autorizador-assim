"use client"

// PacientesDashboardShell — dois dashboards de pacientes ativos (CH, convênio,
// unidade), adaptados de calcularDashboardPacientes, consumindo dados reais de
// csv_grades_profissionais via useOcupacaoSalas(). A separação é POR SESSÃO:
//   - "Tratamento Multidisciplinar" (antes "Por convênio"): toda sessão que NÃO
//     é Avaliação Neuropsicológica nem Psiquiatra/Neurologista.
//   - "Processo Diagnóstico": só sessões de Avaliação Neuropsicológica e
//     Psiquiatra/Neurologista (ver PROCESSO_DIAGNOSTICO_NAMES em
//     lib/cronograma/constants.ts).
// Uma sessão dessas duas terapias NUNCA soma nos números do Tratamento
// Multidisciplinar, mesmo quando o paciente também faz outras terapias — só
// conta lá pelas sessões que não são diagnósticas. Um paciente cuja agenda é
// feita só dessas duas terapias não sobra nenhuma sessão no dashboard geral,
// então some dele por completo (aparece só no Processo Diagnóstico).

import { Loader2, Users, Clock, CalendarDays } from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { fmtHDec } from "@/lib/cronograma/helpers"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import type { ResumoPacientesGrupo, ResumoPacientesSalas } from "@/lib/cronograma/salasTypes"

function fmtPct(valor: number, total: number): string {
  if (total <= 0) return "—"
  return `${((valor / total) * 100).toFixed(1)}%`
}

function TabelaGrupo({
  titulo, linhas, totalPacientes, totalChSemanal,
}: {
  titulo: string
  linhas: ResumoPacientesGrupo[]
  /** Totais do bloco inteiro (ex.: d.pacientesUnicos/d.chSemanalTotal) — base das colunas de %, não a soma das linhas (que pode ter sobreposição de pacientes entre grupos). */
  totalPacientes: number
  totalChSemanal: number
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-bold text-foreground">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-semibold">Nome</th>
              <th className="py-1.5 px-2 text-right font-semibold">Pacientes</th>
              <th className="py-1.5 px-2 text-right font-semibold">% Pacientes</th>
              <th className="py-1.5 px-2 text-right font-semibold">Sessões</th>
              <th className="py-1.5 px-2 text-right font-semibold">CH semanal</th>
              <th className="py-1.5 px-2 text-right font-semibold">% CH semanal</th>
              <th className="py-1.5 pl-2 text-right font-semibold">Sessões/pac.</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={7} className="py-3 text-center text-muted-foreground">Sem dados no período.</td></tr>
            )}
            {linhas.map(l => (
              <tr key={l.chave} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-2 font-medium text-foreground">{l.chave}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{l.pacientesUnicos}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{fmtPct(l.pacientesUnicos, totalPacientes)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{l.sessoesTotal}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{fmtHDec(l.chSemanalTotal)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{fmtPct(l.chSemanalTotal, totalChSemanal)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{l.mediaSessoesPorPaciente.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// `tituloConvenio` é o nome do dashboard (ex.: "Tratamento Multidisciplinar",
// "Processo Diagnóstico") — vai DIRETO no título da tabela por convênio, sem
// header separado por cima. "Por unidade" continua com o mesmo nome nos dois.
function DashboardBloco({
  tituloConvenio,
  d,
}: {
  tituloConvenio: string
  d: ResumoPacientesSalas
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="slate" icon={<Users size={15} />} label="Pacientes ativos">
          <div className="text-2xl font-black text-foreground">{d.pacientesUnicos}</div>
        </StatCard>
        <StatCard tone="blue" icon={<CalendarDays size={15} />} label="Sessões/semana">
          <div className="text-2xl font-black text-foreground">{d.sessoesTotal}</div>
        </StatCard>
        <StatCard tone="purple" icon={<Clock size={15} />} label="CH semanal total">
          <div className="text-2xl font-black text-foreground">{fmtHDec(d.chSemanalTotal)}</div>
        </StatCard>
        <StatCard tone="green" icon={<Clock size={15} />} label="CH média mensal">
          <div className="text-2xl font-black text-foreground">{fmtHDec(d.chMediaMensalTotal)}</div>
        </StatCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TabelaGrupo titulo={tituloConvenio} linhas={d.porConvenio} totalPacientes={d.pacientesUnicos} totalChSemanal={d.chSemanalTotal} />
        <TabelaGrupo titulo="Por unidade" linhas={d.porUnidade} totalPacientes={d.pacientesUnicos} totalChSemanal={d.chSemanalTotal} />
      </div>
    </div>
  )
}

export function PacientesDashboardShell() {
  const { dashboardPacientes, loading, error } = useOcupacaoSalas()

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando dados de pacientes...
      </div>
    )
  }
  if (error) return <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>

  const { multidisciplinar, processoDiagnostico } = dashboardPacientes

  return (
    <div className="flex flex-col gap-8">
      <DashboardBloco tituloConvenio="Tratamento Multidisciplinar" d={multidisciplinar} />
      <div className="border-t border-border" />
      <DashboardBloco tituloConvenio="Processo Diagnóstico" d={processoDiagnostico} />
    </div>
  )
}
