"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { useHeader } from "@/contexts/HeaderContext"
import { PacienteDetalhe } from "@/components/cadastros/pacientes/PacienteDetalhe"

export default function PacienteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const { setHeader, setRightContent } = useHeader()

  useEffect(() => {
    setHeader("Detalhes do paciente", "Cadastro e ficha médica")
    return () => setHeader("", "")
  }, [setHeader])

  useEffect(() => {
    setRightContent(
      <Link
        href="/cadastros/pacientes"
        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Voltar
      </Link>
    )
    return () => setRightContent(null)
  }, [setRightContent])

  const idPaciente = Number(id)
  if (!Number.isFinite(idPaciente)) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Endereço inválido para um paciente.
        </div>
      </div>
    )
  }

  return <PacienteDetalhe idPaciente={idPaciente} />
}
