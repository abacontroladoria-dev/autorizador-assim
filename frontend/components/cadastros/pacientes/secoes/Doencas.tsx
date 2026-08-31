"use client"

import type { PacienteFichaMedica } from "@/types/paciente"
import { CampoTextarea, Secao } from "../ui/campos"

export function Doencas({
  ficha,
  setFicha,
  disabled,
}: {
  ficha: Omit<PacienteFichaMedica, "paciente_id">
  setFicha: (patch: Partial<Omit<PacienteFichaMedica, "paciente_id">>) => void
  disabled: boolean
}) {
  return (
    <Secao titulo="Doenças" descricao="Observações sobre doenças e condição física">
      <CampoTextarea
        label="Doenças"
        value={ficha.doencas ?? ""}
        onChange={(v) => setFicha({ doencas: v || null })}
        disabled={disabled}
        linhas={8}
        placeholder="Descreva condições relevantes para o atendimento."
      />
    </Secao>
  )
}
