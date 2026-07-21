"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useHeader } from "@/contexts/HeaderContext"
import { OcupacaoProfShell } from "@/components/cronograma/indicadores/OcupacaoProfShell"
import { UnidadeDashboardShell } from "@/components/cronograma/indicadores/UnidadeDashboardShell"
import { PacientesDashboardShell } from "@/components/cronograma/indicadores/PacientesDashboardShell"
import { PrevisaoReceitasShell } from "@/components/cronograma/indicadores/PrevisaoReceitasShell"

const TABS = ["profissionais", "unidades", "pacientes", "previsao-receitas"] as const
type TabKey = (typeof TABS)[number]

const TAB_LABELS: Record<TabKey, string> = {
  profissionais: "Ocupação de Profissionais",
  unidades: "Dashboard por Unidade",
  pacientes: "Dashboard de Pacientes",
  "previsao-receitas": "Previsão de Receitas",
}

const TAB_SUBTITLES: Record<TabKey, string> = {
  profissionais: "",
  unidades: "Ocupação agregada de salas por unidade",
  pacientes: "Métricas de pacientes ativos: CH, convênio, unidade",
  "previsao-receitas": "Receita mensal projetada, cruzando sessões com valores cadastrados por convênio",
}

function IndicadoresContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setHeader } = useHeader()
  const rawTab = searchParams.get("tab")
  const activeTab: TabKey = TABS.includes(rawTab as TabKey) ? (rawTab as TabKey) : "profissionais"

  useEffect(() => {
    if (!rawTab) router.replace("/cronograma/indicadores?tab=profissionais")
  }, [rawTab, router])

  // OcupacaoProfShell define seu próprio header (título + período) — as demais
  // abas usam este efeito genérico.
  useEffect(() => {
    if (activeTab === "profissionais") return
    setHeader(TAB_LABELS[activeTab], TAB_SUBTITLES[activeTab])
    return () => setHeader("", "")
  }, [activeTab, setHeader])

  return (
    <div className="flex flex-col gap-4">
      {activeTab === "profissionais" && <OcupacaoProfShell />}
      {activeTab === "unidades" && <UnidadeDashboardShell />}
      {activeTab === "pacientes" && <PacientesDashboardShell />}
      {activeTab === "previsao-receitas" && <PrevisaoReceitasShell />}
    </div>
  )
}

export default function OcupacaoProfPage() {
  return (
    <Suspense fallback={null}>
      <IndicadoresContent />
    </Suspense>
  )
}
