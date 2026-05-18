export type GuiaTerapia = {
  id: string
  guia_numero: string
  terapia_nome: string
  terapeuta_id: string
}

export type TerapeutaCarimbo = {
  id: string
  nome: string
  carimbo_digital: string | null
}

export type ProcessedGuiaItem = {
  pageIndex: number
  guiaNumero: string | null
  status: "success" | "warning" | "error"
  originalPdf: string
  versoPdf: string
  finalPdf: string
  terapias: GuiaTerapia[]
  terapeutas: TerapeutaCarimbo[]
  error?: string
}
