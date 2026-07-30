"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { ContratosCadastro } from "@/components/cadastros/ContratosCadastro"

export default function ContratosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Contratos", "Contratos vigentes/antigos por profissional (PA por atendimento ou banco de horas)")
    return () => setHeader("", "")
  }, [setHeader])

  return <ContratosCadastro />
}
