export type Log = {
  id: string
  autorizacao_id: string

  mensagem: string
  tipo: 'info' | 'erro' | 'aviso'

  created_at: string
}