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
          <div
            className="animate-in fade-in slide-in-from-top-2 duration-300 flex items-center gap-3"
            style={{
              padding: "11px 16px",
              borderRadius: "10px",
              border: "1.5px dashed #fbbf24",
              background: "#fffbeb",
            }}
          >
            {/* Ícone upload — pulsa 3× para chamar atenção, depois para */}
            <div
              className="shrink-0"
              style={{ color: "#d97706", animation: "pulse 2s ease-in-out 3" }}
              aria-hidden="true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p style={{ fontSize: "12px", color: "#78350f", margin: 0, lineHeight: 1.5 }}>
              Selecione o <strong style={{ fontWeight: 700 }}>arquivo de Laudos</strong> no cabeçalho para habilitar a análise de impacto.
            </p>
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
