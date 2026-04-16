export type Autorizacao = {
  id: string

  beneficiario: string
  matricula?: string

  dataHora: string

  codigo?: string
  status?: string
  codigoStatus?: string

  especialidade?: string

  guia?: string
  token?: string

  justificativa?: string

  lote?: string

  created_at?: string
}