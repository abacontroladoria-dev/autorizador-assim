"use client"

// PacientesDashboardShell — dashboard de pacientes ativos (CH, convênio,
// unidade), adaptado de calcularDashboardPacientes, consumindo dados reais de
// csv_grades_profissionais via useOcupacaoSalas().

import { Loader2, Users, Clock, CalendarDays } from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { fmtHDec } from "@/lib/cronograma/helpers"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import type { ResumoPacientesGrupo } from "@/lib/cronograma/salasTypes"

function TabelaGrupo({ titulo, linhas }: { titulo: string; linhas: ResumoPacientesGrupo[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-bold text-foreground">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 pr-2 font-semibold">Nome</th>
              <th className="py-1.5 px-2 text-right font-semibold">Pacientes</th>
              <th className="py-1.5 px-2 text-right font-semibold">Sessões</th>
              <th className="py-1.5 px-2 text-right font-semibold">CH semanal</th>
              <th className="py-1.5 pl-2 text-right font-semibold">Sessões/pac.</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">Sem dados no período.</td></tr>
            )}
            {linhas.map(l => (
              <tr key={l.chave} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-2 font-medium text-foreground">{l.chave}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{l.pacientesUnicos}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{l.sessoesTotal}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{fmtHDec(l.chSemanalTotal)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{l.mediaSessoesPorPaciente.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const d = dashboardPacientes

  return (
    <div className="flex flex-col gap-4">
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
        <TabelaGrupo titulo="Por convênio" linhas={d.porConvenio} />
        <TabelaGrupo titulo="Por unidade" linhas={d.porUnidade} />
      </div>
    </div>
  )
}
