"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { SK_SAIDA } from "@/lib/cronograma/constants"
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

  // StatusMap para Saída de Profissional e Banco de Dados (compartilhado entre tabs)
  const [statusMap, setStatusMap] = useState<StatusMap>(() => {
    try { return JSON.parse(localStorage.getItem(SK_SAIDA) || "{}") } catch { return {} }
  })

  const persistStatus = (map: StatusMap) => {
    setStatusMap(map)
    try { localStorage.setItem(SK_SAIDA, JSON.stringify(map)) } catch {}
  }

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
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400">
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
