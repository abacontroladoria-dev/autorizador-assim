import type { FeriadoInfo } from "@/types/remuneracao"

export type { FeriadoInfo }

export type FeriadoRow = {
  id: string
  data: string
  nome: string
  tipo: "integral" | "parcial"
  horario_inicio: string
  horario_fim: string
  created_at: string
  updated_at: string
  updated_by: string | null
}
