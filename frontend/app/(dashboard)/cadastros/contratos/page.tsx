"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { ContratosCadastro } from "@/components/cadastros/ContratosCadastro"

export default function ContratosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Contratos", "A calculadora paga pelos contratos marcados como vigentes")
    return () => setHeader("", "")
  }, [setHeader])

  return <ContratosCadastro />
}
