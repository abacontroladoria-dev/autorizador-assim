"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { TaxasEParametrosCadastro } from "@/components/cadastros/TaxasEParametrosCadastro"

export default function TaxasEParametrosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Variáveis & Taxas", "Taxas de PA e diária por especialidade, e parâmetros globais de remuneração")
    return () => setHeader("", "")
  }, [setHeader])

  return <TaxasEParametrosCadastro />
}
