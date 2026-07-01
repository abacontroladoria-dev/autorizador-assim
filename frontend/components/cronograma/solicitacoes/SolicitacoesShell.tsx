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
  { key: "ocup-pac",   label: "Ocupação · Paciente" },
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
    const tab = TABS.find(t => t.key === activeTab)
    const subtitles: Record<string, string> = {
      "saida":      "Análise de impacto e redistribuição de sessões",
      "ocup-prof":  "Aumente a ocupação de sessões por profissional",
      "ocup-pac":   "Aumente a ocupação de sessões por paciente",
      "simulacao":  "Simulação de novo prestador",
      "novo-cron":  "Criação de novo cronograma",
    }
    setHeader(tab?.label ?? "Cronograma", subtitles[activeTab] ?? "")
  }, [activeTab, setHeader])

  useEffect(() => {
    if (!raw) router.replace("/cronograma/solicitacoes?tab=saida")
  }, [raw, router])

  return (
    <TabContent
      tab={activeTab}
      cRows={cRows} lRows={lRows} dispRows={dispRows} cfg={cfg}
      statusMap={statusMap} persistStatus={persistStatus}
    />
  )
}

interface TabContentProps extends ShellProps {
  tab: TabKey
  statusMap: StatusMap
  persistStatus: (m: StatusMap) => void
}

function TabContent({
  tab, cRows, lRows, dispRows, cfg, statusMap, persistStatus,
}: TabContentProps) {
  const { rec, inv, sRec, sInv } = useCronogramaData()
  const label = TABS.find(t => t.key === tab)?.label ?? tab

  if (tab === "saida") {
    return <SaidaProfMode cRows={cRows} lRows={lRows} cfg={cfg} statusMap={statusMap} persistStatus={persistStatus} />
  }

  if (tab === "simulacao") {
    return <PreencherProfTab cRows={cRows} lRows={lRows} initialMode="sim" fixedMode />
  }

  if (tab === "ocup-prof") {
    return <OcupProfMode cRows={cRows} lRows={lRows} cfg={cfg} />
  }

  if (tab === "ocup-pac") {
    return <OcupPacMode cRows={cRows} lRows={lRows} cfg={cfg} rec={rec} inv={inv} sRec={sRec} sInv={sInv} />
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
