"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { PainelAnalistaShell } from "@/components/terapeutico/pdi/PainelAnalistaShell"

export default function PdiPainelAnalistaPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader(
      "PDI - Painel por Analista",
      "Dashboard por Coordenador de Caso — PDIs atrasados, próximos do prazo e em andamento",
    )
    return () => setHeader("", "")
  }, [setHeader])

  return <PainelAnalistaShell />
}
