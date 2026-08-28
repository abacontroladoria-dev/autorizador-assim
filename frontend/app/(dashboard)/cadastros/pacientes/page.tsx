"use client"

import { useEffect } from "react"
import { useHeader } from "@/contexts/HeaderContext"
import { PacientesCadastro } from "@/components/cadastros/PacientesCadastro"

export default function PacientesPage() {
  const { setHeader } = useHeader()
  useEffect(() => {
    setHeader("Cadastro de Pacientes")
    return () => setHeader("", "")
  }, [setHeader])

  return <PacientesCadastro />
}
