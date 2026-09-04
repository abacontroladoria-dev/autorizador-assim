"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { PdiPrazosShell } from "@/components/terapeutico/pdi/PdiPrazosShell"

export default function PdiPrazosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader(
      "Controle de Prazos do PDI",
      "Avaliação, relatório, implementação do PIC e fechamento do ciclo — por paciente",
    )
    return () => setHeader("", "")
  }, [setHeader])

  return <PdiPrazosShell />
}
