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
  // "removido_tita": bundle antes implantado cuja série foi excluída diretamente na
  // TiTa (a API só grava, não exclui) e detectada pela reconciliação — some da grade
  // como "Implantado" e libera o slot. Ver reconciliação em OcupPacMode.tsx.
  status: "pendente" | "confirmado" | "recusado" | "inviavel" | "removido_tita"
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
