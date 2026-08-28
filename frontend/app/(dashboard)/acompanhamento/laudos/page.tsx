"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { AcompanhamentoLaudosShell } from "@/components/acompanhamento/laudos/AcompanhamentoLaudosShell"

export default function AcompanhamentoLaudosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader(
      "Acompanhamento de Laudos",
      "Laudos do Órbita e o registro do aviso ao responsável",
    )
    return () => setHeader("", "")
  }, [setHeader])

  return <AcompanhamentoLaudosShell />
}
