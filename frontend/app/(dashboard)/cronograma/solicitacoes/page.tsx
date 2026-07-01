"use client"

import { Suspense } from "react"
import { SolicitacoesShell } from "@/components/cronograma/solicitacoes/SolicitacoesShell"
import { useCronogramaData } from "@/contexts/CronogramaDataContext"

export default function SolicitacoesPage() {
  const { cRows, lRows, dispRows, cfg } = useCronogramaData()

  return (
    <Suspense fallback={null}>
      <SolicitacoesShell cRows={cRows} lRows={lRows} dispRows={dispRows} cfg={cfg} />
    </Suspense>
  )
}
