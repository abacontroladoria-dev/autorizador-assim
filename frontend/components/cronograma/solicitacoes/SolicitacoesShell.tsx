"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { SimulacaoNovoPrestadorTab } from "./SimulacaoNovoPrestadorTab"
import { BancoDadosTab } from "./BancoDadosTab"
import type { CsvRow, LaudoRow, DispRow, CfgState } from "@/types/cronograma"

// "Saída de Profissional" e "Ocupação · Paciente" viraram rotas dedicadas
// (/cronograma/solicitacoes/saida e /cronograma/solicitacoes/ocupacao-paciente)
// para poderem ter permissões independentes — ver frontend/lib/permissions/routes.ts
//
// "Novo Cronograma" (novo-cron) foi retirado do ar por não estar pronto, e
// "Aumentar Ocupação (Profissional)" (ocup-prof) foi removida a pedido do
// usuário — ambos os componentes (NovoCronogramaTab, OcupProfMode) seguem no
// código, só não são mais roteáveis aqui.
const TABS = [
  { key: "simulacao",  label: "Simulação de Novo Prestador" },
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
  const activeTab: TabKey = raw && TABS.some(t => t.key === raw) ? (raw as TabKey) : "simulacao"

  const { setHeader } = useHeader()

  useEffect(() => {
    const tab = TABS.find(t => t.key === activeTab)
    const subtitles: Record<string, string> = {
      "simulacao":  "Simulação de novo prestador",
    }
    setHeader(tab?.label ?? "Cronograma", subtitles[activeTab] ?? "")
  }, [activeTab, setHeader])

  // Redireciona bookmarks/favoritos antigos das duas abas que viraram rotas próprias.
  useEffect(() => {
    if (raw === "saida") { router.replace("/cronograma/saida-profissional"); return }
    if (raw === "ocup-pac") { router.replace("/cronograma/ocupacao-paciente"); return }
    if (raw === "novo-cron") { router.replace("/cronograma/solicitacoes?tab=simulacao"); return }
    if (!raw) router.replace("/cronograma/solicitacoes?tab=simulacao")
  }, [raw, router])

  return (
    <TabContent
      tab={activeTab}
      cRows={cRows} lRows={lRows} dispRows={dispRows} cfg={cfg}
    />
  )
}

interface TabContentProps extends ShellProps {
  tab: TabKey
}

function TabContent({
  tab, cRows, lRows, dispRows, cfg,
}: TabContentProps) {
  const label = TABS.find(t => t.key === tab)?.label ?? tab

  if (tab === "simulacao") {
    return <SimulacaoNovoPrestadorTab cRows={cRows} lRows={lRows} />
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
