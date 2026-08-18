"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { SolicitacoesLista } from "@/components/insumos/SolicitacoesLista"

export default function InsumosPage() {
  const { setHeader } = useHeader()

  useEffect(() => {
    setHeader("Insumos", "Solicitações de compra, cotações e entrega")
    return () => setHeader("", "")
  }, [setHeader])

  return <SolicitacoesLista />
}
