"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { SaidaProfMode } from "./SaidaProfMode"
import { OcupProfMode } from "./OcupProfMode"
import { PreencherProfTab } from "@/components/cronograma/shared/PreencherProfTab"
import { OcupPacMode } from "./OcupPacMode"
import { NovoCronogramaTab } from "@/components/cronograma/shared/NovoCronogramaTab"
import { BancoDadosTab } from "./BancoDadosTab"
import type { CsvRow, LaudoRow, DispRow, StatusMap, CfgState } from "@/types/cronograma"

const TABS = [
  { key: "simulacao",  label: "Simulação de Novo Prestador" },
  { key: "saida",      label: "Saída de Profissional" },
  { key: "ocup-prof",  label: "Aumentar Ocupação (Profissional)" },
  { key: "ocup-pac",   label: "Aumentar Ocupação (Paciente)" },
  { key: "novo-cron",  label: "Novo Cronograma" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export interface ShellProps {
  cRows: CsvRow[]
  lRows: LaudoRow[]
  dispRows: DispRow[]
  cfg: CfgState
}

export function SolicitacoesShell({ cRows, lRows, dispRows, cfg }: ShellProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const raw = searchParams.get("tab")
  const activeTab: TabKey = raw && TABS.some(t => t.key === raw) ? (raw as TabKey) : "saida"

  // StatusMap da Saída de Profissional — compartilhado entre a equipe via backend (saida_aceites)
  const { statusMap, persistStatus } = useCronogramaData()
  const { setHeader } = useHeader()

  useEffect(() => {
    setHeader("Saída de Profissional", "Análise de impacto e redistribuição de sessões")
  }, [setHeader])

  useEffect(() => {
    if (!raw) router.replace("/cronograma/solicitacoes?tab=saida")
  }, [raw, router])

  return (
    <TabContent tab={activeTab} cRows={cRows} lRows={lRows} dispRows={dispRows} cfg={cfg} statusMap={statusMap} persistStatus={persistStatus} />
  )
}

function TabContent({
  tab, cRows, lRows, dispRows, cfg, statusMap, persistStatus,
}: { tab: TabKey; statusMap: StatusMap; persistStatus: (m: StatusMap) => void } & ShellProps) {
  const label = TABS.find(t => t.key === tab)?.label ?? tab

  if (tab === "saida") {
    return (
      <>
        {cRows.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Carregue o CSV da grade para usar esta ferramenta.
          </div>
        )}
        <SaidaProfMode cRows={cRows} lRows={lRows} cfg={cfg} statusMap={statusMap} persistStatus={persistStatus} />
      </>
    )
  }

  if (tab === "simulacao") {
    return <PreencherProfTab cRows={cRows} lRows={lRows} initialMode="sim" fixedMode />
  }

  if (tab === "ocup-prof") {
    return <OcupProfMode cRows={cRows} lRows={lRows} cfg={cfg} />
  }

  if (tab === "ocup-pac") {
    return <OcupPacMode cRows={cRows} lRows={lRows} cfg={cfg} />
  }

  if (tab === "novo-cron") {
    return <NovoCronogramaTab cRows={cRows} lRows={lRows} dispRows={dispRows} />
  }

  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p>Em construção.</p>
      {cRows.length > 0 && (
        <p className="mt-3 text-xs text-green-600 dark:text-green-400">
          ✓ Grade carregada · {cRows.length} linhas
          {lRows.length > 0 && ` · ${lRows.length} laudos`}
          {dispRows.length > 0 && ` · ${dispRows.length} disponibilidades`}
        </p>
      )}
    </div>
  )
}
