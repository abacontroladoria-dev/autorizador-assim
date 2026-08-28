"use client"

import { TIPOS_SANGUINEOS } from "@/types/paciente"
import type { PacienteFichaMedica, TipoSanguineo } from "@/types/paciente"
import { CampoSelect, CampoTextarea, Secao } from "../ui/campos"

// Dado de saúde vive em `pacientes_ficha_medica`, tabela com RLS própria — a
// policy de leitura de `pacientes` é aberta a todo autenticado e alergia/doença
// não podem herdar essa abertura. Ver 20260826100300.

const OPCOES_SANGUE = TIPOS_SANGUINEOS.map((t) => ({ valor: t, rotulo: t }))

export function FichaBasica({
  ficha,
  setFicha,
  disabled,
}: {
  ficha: Omit<PacienteFichaMedica, "paciente_id">
  setFicha: (patch: Partial<Omit<PacienteFichaMedica, "paciente_id">>) => void
  disabled: boolean
}) {
  return (
    <Secao titulo="Dados básicos" descricao="Informações de saúde do paciente">
      <CampoSelect<TipoSanguineo>
        label="Tipo sanguíneo"
        value={ficha.tipo_sanguineo}
        onChange={(v) => setFicha({ tipo_sanguineo: v })}
        disabled={disabled}
        opcoes={OPCOES_SANGUE}
      />
      <div />

      <CampoTextarea
        label="Restrições alimentares"
        value={ficha.restricoes_alimentares ?? ""}
        onChange={(v) => setFicha({ restricoes_alimentares: v || null })}
        disabled={disabled}
        placeholder="Ex.: intolerância a lactose, dieta sem glúten"
      />

      <CampoTextarea
        label="Alergias"
        value={ficha.alergias ?? ""}
        onChange={(v) => setFicha({ alergias: v || null })}
        disabled={disabled}
        placeholder="Ex.: dipirona, amendoim, látex"
      />
    </Secao>
  )
}
