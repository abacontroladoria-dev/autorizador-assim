// ─── TIPOS DA API DE LAUDOS (cronogramauniversoaba.com.br/api_laudos) ────────

export interface EspecialidadeLaudoApi {
  id_laudo_especialidade: number
  id_especialidade: number
  especialidade: string
  qtd_autorizada: number
  alta: boolean
  data_alta: string | null
}

export interface LaudoApi {
  id_laudo: number
  id_favorecido: number
  nome_paciente: string
  plano: string | null
  data_nascimento: string | null
  idade: number | null
  autorizado_em: string | null
  comportamento_agressivo: boolean
  ambiente_natural: boolean
  laudo_em_uso: boolean
  data_laudo: string | null
  data_validade: string | null
  especialidades: EspecialidadeLaudoApi[]
}

export interface PacienteLaudosApi {
  paciente_id: number
  nome_paciente: string
  plano: string | null
  data_nascimento: string | null
  idade: number | null
  quantidade_laudos: number
  laudos: LaudoApi[]
}

export interface ErroLaudosApi {
  erro: string
}
