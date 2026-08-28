"use client"

import { useEffect } from "react"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"
import { useHeader } from "@/contexts/HeaderContext"
import { SaidaProfMode } from "@/components/cronograma/solicitacoes/SaidaProfMode"

export default function SaidaProfissionalPage() {
  const { cRows, lRows, cfg, statusMap, persistStatus } = useCronogramaData()
  const { setHeader } = useHeader()

  useEffect(() => {
    setHeader("Saída de Profissional", "Análise de impacto e redistribuição de sessões")
  }, [setHeader])

  return (
    <SaidaProfMode cRows={cRows} lRows={lRows} cfg={cfg} statusMap={statusMap} persistStatus={persistStatus} />
  )
}
