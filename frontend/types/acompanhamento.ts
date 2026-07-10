// ─── TIPOS COMPARTILHADOS — ABA ACOMPANHAMENTO ────────────────────────────────

export interface AceiteSessao {
  dia: string
  hora: string
  tP: string
  prof: string
  unidade: string
  /** UUID da linha em csv_grades_profissionais de origem — usado para resolver o agendamento na TiTa. */
  csvGradeId: string
}

export type SlotStatus = "confirmado" | "recusado" | "inviavel"

export interface AceitePacBundle {
  id: string
  pac: string
  ts: number
  origem: "ocp-paciente"
  sessoes: AceiteSessao[]
  status: "pendente" | "confirmado" | "recusado" | "inviavel"
  inviavelSlots: string[]
  motivo?: string
  slotStatus?: Record<string, SlotStatus>
}

export interface ConfItem {
  id: string        // gerado na criação — PK no Supabase
  pac: string
  prof: string
  esp: string
  unidade: string
  dia: string
  hora: string
  origem: string
  registradoEm: string
  obs?: string
}
