"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { FeriadosCadastro } from "@/components/cadastros/FeriadosCadastro"

export default function FeriadosPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Feriados", "Feriados regionais que descontam dias úteis no Relacionamento Prestador e na Previsão de Receitas")
    return () => setHeader("", "")
  }, [setHeader])

  return <FeriadosCadastro />
}
