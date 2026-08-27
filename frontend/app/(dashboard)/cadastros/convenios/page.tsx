"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { ConveniosCadastro } from "@/components/cadastros/ConveniosCadastro"

export default function ConveniosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Convênios", "Convênios e planos de saúde disponíveis para vínculo com pacientes")
    return () => setHeader("", "")
  }, [setHeader])

  return <ConveniosCadastro />
}
