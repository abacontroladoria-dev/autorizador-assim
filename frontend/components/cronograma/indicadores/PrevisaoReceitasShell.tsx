"use client"

// PrevisaoReceitasShell — cruza as sessões reais (csv_grades_profissionais, via
// useOcupacaoSalas) com os valores cadastrados em Valores de Convênio
// (useConvenioValores) pra projetar receita semanal/mensal por convênio. Ver
// resolverValorSessao/calcularPrevisaoReceita em lib/cronograma/faturamentoProjecao.ts
// pra entender a regra de prioridade (paciente > terapia > geral) e o fallback
// valor_hora × 40/60 quando não há valor_sessao cadastrado.

import { Loader2, Wallet, AlertTriangle, CalendarDays } from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { useOcupacaoSalas } from "@/hooks/useOcupacaoSalas"
import { useConvenioValores } from "@/hooks/useConvenioValores"
import { calcularPrevisaoReceita } from "@/lib/cronograma/faturamentoProjecao"

function fmtReal(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function PrevisaoReceitasShell() {
  const { linhas, loading: loadingSalas, error: errorSalas } = useOcupacaoSalas()
  const { regrasGerais, excecoesPaciente, loading: loadingValores, error: errorValores } = useConvenioValores()

  const loading = loadingSalas || loadingValores
  const error = errorSalas || errorValores

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando sessões e valores cadastrados...
      </div>
    )
  }
  if (error) return <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>

  const previsao = calcularPrevisaoReceita(linhas, regrasGerais, excecoesPaciente)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard tone="green" icon={<Wallet size={15} />} label="Receita mensal projetada">
          <div className="text-2xl font-black text-foreground">{fmtReal(previsao.receitaMensalProjetadaTotal)}</div>
        </StatCard>
        <StatCard tone="blue" icon={<Wallet size={15} />} label="Receita semanal projetada">
          <div className="text-2xl font-black text-foreground">{fmtReal(previsao.receitaSemanalTotal)}</div>
        </StatCard>
        <StatCard tone="slate" icon={<CalendarDays size={15} />} label="Sessões/semana">
          <div className="text-2xl font-black text-foreground">{previsao.sessoesTotal}</div>
        </StatCard>
        <StatCard tone="amber" icon={<AlertTriangle size={15} />} label="Sessões sem valor cadastrado">
          <div className="text-2xl font-black text-foreground">{previsao.sessoesSemValor}</div>
        </StatCard>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-bold text-foreground">Por convênio</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-semibold">Convênio</th>
                <th className="py-1.5 px-2 text-right font-semibold">Sessões/semana</th>
                <th className="py-1.5 px-2 text-right font-semibold">Sem valor</th>
                <th className="py-1.5 px-2 text-right font-semibold">Receita semanal</th>
                <th className="py-1.5 pl-2 text-right font-semibold">Receita mensal projetada</th>
              </tr>
            </thead>
            <tbody>
              {previsao.porConvenio.length === 0 && (
                <tr><td colSpan={5} className="py-3 text-center text-muted-foreground">Sem sessões no período.</td></tr>
              )}
              {previsao.porConvenio.map(c => (
                <tr key={c.convenio} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-foreground">{c.convenio}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{c.sessoesTotal}</td>
                  <td className={`py-1.5 px-2 text-right tabular-nums ${c.sessoesSemValor > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>
                    {c.sessoesSemValor > 0 ? c.sessoesSemValor : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{fmtReal(c.receitaSemanal)}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums font-semibold">{fmtReal(c.receitaMensalProjetada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {previsao.sessoesSemValor > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            "Sem valor" = sessões de convênios sem regra cadastrada em <strong>Valores de Convênio</strong>, ou sessões de Processo Diagnóstico sem Valor Hora cadastrado. Não entram na receita projetada acima.
          </p>
        )}
      </div>
    </div>
  )
}
