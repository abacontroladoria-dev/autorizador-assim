"use client"

// HistoricoReceitasShell — índice mensal da Previsão de Receitas (Etapa 4,
// complemento). Diferente da aba "Previsão de Receitas" (drilldown detalhado
// de UM mês por vez, Convênio → Paciente → Sessão), esta tela é uma visão
// rápida de TODOS os meses de uma vez, só com o número final de cada um.
//
// Status por mês:
//   - futuro: mês ainda não chegou (sem snapshot nenhum ainda).
//   - em_desenvolvimento: é o mês corrente — mostra o que já foi construído
//     até agora pelo snapshot diário, com uma tag deixando claro que ainda
//     não é o número final (segue mudando até o mês fechar).
//   - aguardando_fechamento: mês já passou, mas o job de fechamento (dia 5 do
//     mês seguinte) ainda não rodou — mostra o último parcial disponível,
//     com uma tag indicando que ainda não é definitivo.
//   - fechado: número final, gravado pelo job de fechamento.
//   - sem_historico: mês passado sem NENHUM snapshot (ex.: antes da
//     implantação do histórico, ou sem dados sincronizados suficientes).

import { useEffect, useMemo, useState } from "react"
import { CalendarClock, CalendarX2, Clock, Loader2, TrendingUp, Wallet, AlertTriangle, Users } from "lucide-react"
import { StatCard } from "@/components/cronograma/ui/StatCard"
import { buscarResumoHistoricoReceitas, type PrevisaoReceitasResumoMes } from "@/services/previsaoReceitasHistoricoResumo.service"
import { labelMesAno } from "@/lib/cronograma/helpers"

/** Primeiro mês considerado pelo índice — antes disso não há (nem haverá) dado sincronizado suficiente pra calcular nada (ver project_sync_grade_csv_deploy_drift_fix na memória do projeto: csv_grades_profissionais só passou a ter cobertura completa a partir daqui). */
const MES_INICIO_HISTORICO = { ano: 2026, mes: 6 }

function fmtReal(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

type StatusMes = "futuro" | "em_desenvolvimento" | "aguardando_fechamento" | "fechado" | "sem_historico"

interface LinhaHistorico {
  ano: number
  mes: number
  label: string
  status: StatusMes
  resumo: PrevisaoReceitasResumoMes | null
}

function listaChavesMes(inicio: { ano: number; mes: number }, fim: { ano: number; mes: number }): { ano: number; mes: number }[] {
  const lista: { ano: number; mes: number }[] = []
  let ano = inicio.ano, mes = inicio.mes
  while (ano * 12 + mes <= fim.ano * 12 + fim.mes) {
    lista.push({ ano, mes })
    mes += 1
    if (mes > 12) { mes = 1; ano += 1 }
  }
  return lista
}

function ExplicacaoStatus({ status }: { status: StatusMes }) {
  if (status === "sem_historico") {
    return (
      <p className="text-[11px] text-muted-foreground">
        Sem histórico disponível — mês anterior à implantação do histórico de receitas (sem dados sincronizados suficientes pra calcular).
      </p>
    )
  }
  if (status === "futuro") {
    return <p className="text-[11px] text-muted-foreground">Mês futuro — sem histórico ainda.</p>
  }
  return null
}

const ICONE_CLASSE_POR_STATUS: Record<StatusMes, string> = {
  fechado: "text-emerald-600 dark:text-emerald-400",
  aguardando_fechamento: "text-amber-600 dark:text-amber-400",
  em_desenvolvimento: "text-blue-600 dark:text-blue-400",
  futuro: "text-muted-foreground",
  sem_historico: "text-muted-foreground",
}

/** Tag ao lado do mês pros status que NÃO são o número final — deixa claro que o que está sendo mostrado ainda pode mudar. */
const TAG_POR_STATUS: Partial<Record<StatusMes, { texto: string; classe: string }>> = {
  em_desenvolvimento: {
    texto: "Mês em desenvolvimento — histórico ainda não fechado",
    classe: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  aguardando_fechamento: {
    texto: "Aguardando fechamento (dia 5)",
    classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
}

function LinhaMesCard({ linha }: { linha: LinhaHistorico }) {
  const Icone = linha.status === "fechado" ? TrendingUp
    : linha.status === "aguardando_fechamento" ? Clock
    : linha.status === "futuro" ? CalendarX2
    : CalendarClock

  const tag = TAG_POR_STATUS[linha.status]

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Icone size={16} className={ICONE_CLASSE_POR_STATUS[linha.status]} />
        <div className="text-sm font-bold text-foreground">{linha.label}</div>
        {tag && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${tag.classe}`}>
            {tag.texto}
          </span>
        )}
      </div>

      {linha.resumo ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard tone="amber" icon={<Wallet size={14} />} label="Projetado Sem Deduções" tinted={false}>
            <div className="text-lg font-black text-foreground">{fmtReal(linha.resumo.receitaSemDeducao)}</div>
          </StatCard>
          <StatCard tone="red" icon={<AlertTriangle size={14} />} label="Deduções por Falta" tinted={false}>
            <div className="text-lg font-black text-foreground">{fmtReal(linha.resumo.deducaoFalta)}</div>
          </StatCard>
          <StatCard tone="green" icon={<Wallet size={14} />} label="Efetivado Com Deduções" tinted={false}>
            <div className="text-lg font-black text-foreground">{fmtReal(linha.resumo.receitaComDeducao)}</div>
          </StatCard>
          <StatCard tone="slate" icon={<TrendingUp size={14} />} label="Sessões no mês" tinted={false}>
            <div className="text-lg font-black text-foreground">{linha.resumo.sessoesMes}</div>
          </StatCard>
          <StatCard tone="slate" icon={<Users size={14} />} label="Faltas / Pacientes" tinted={false}>
            <div className="text-lg font-black text-foreground">{linha.resumo.faltasMes} / {linha.resumo.pacientesUnicos}</div>
          </StatCard>
        </div>
      ) : (
        <ExplicacaoStatus status={linha.status} />
      )}
    </div>
  )
}

export function HistoricoReceitasShell() {
  const [resumos, setResumos] = useState<PrevisaoReceitasResumoMes[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    buscarResumoHistoricoReceitas()
      .then(r => { if (!cancelled) { setResumos(r); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(String(err?.message ?? err)); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const linhas = useMemo<LinhaHistorico[]>(() => {
    const hoje = new Date()
    const mesAtual = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }
    const mesFuturo = { ano: mesAtual.mes === 12 ? mesAtual.ano + 1 : mesAtual.ano, mes: mesAtual.mes === 12 ? 1 : mesAtual.mes + 1 }
    const chaveAtual = mesAtual.ano * 12 + mesAtual.mes

    const resumoPorCompetencia = new Map((resumos ?? []).map(r => [r.competencia, r]))

    return listaChavesMes(MES_INICIO_HISTORICO, mesFuturo).map(({ ano, mes }) => {
      const chave = ano * 12 + mes
      const competencia = `${ano}-${String(mes).padStart(2, "0")}`
      const resumo = resumoPorCompetencia.get(competencia) ?? null

      let status: StatusMes
      if (chave > chaveAtual) status = "futuro"
      else if (chave === chaveAtual) status = "em_desenvolvimento"
      else if (resumo?.status === "fechado") status = "fechado"
      else if (resumo?.status === "parcial") status = "aguardando_fechamento"
      else status = "sem_historico"

      return { ano, mes, label: labelMesAno(ano, mes), status, resumo }
    }).reverse() // mais recente primeiro
  }, [resumos])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Carregando histórico...
      </div>
    )
  }
  if (error) return <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</div>

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted-foreground">
        Índice mensal — pra ver o detalhamento por convênio/paciente/sessão de um mês específico, use o seletor de mês na aba "Previsão de Receitas".
      </p>
      {linhas.map(linha => <LinhaMesCard key={`${linha.ano}-${linha.mes}`} linha={linha} />)}
    </div>
  )
}
