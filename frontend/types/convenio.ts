// Cadastro nativo de Convênios + Planos de Saúde (public.convenios / public.planos_saude).
// Ver supabase/migrations/20260826110000_create_convenios_planos_saude.sql.
//
// Fonte de verdade para o select "Plano de saúde" da Ficha Médica de paciente
// (pacientes_ficha_medica.plano_saude_id) — nunca texto livre.

export type Convenio = {
  id: number
  nome: string
  razao_social: string | null
  cnpj: string | null
  ans: string | null
  observacao: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  id_usuario: string | null
  nome_usuario_responsavel: string | null
}

export type ConvenioEdit = {
  nome: string
  razao_social: string | null
  cnpj: string | null
  ans: string | null
  observacao: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export type PlanoSaude = {
  id: number
  convenio_id: number
  nome: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
  id_usuario: string | null
  nome_usuario_responsavel: string | null
}

export type PlanoSaudeEdit = {
  convenio_id: number
  nome: string
}

/** Convênio com seus planos aninhados — shape usado na tela de cadastro. */
export type ConvenioComPlanos = Convenio & { planos: PlanoSaude[] }

/** Plano achatado com o nome do convênio — shape para o select da Ficha Médica. */
export type PlanoSaudeComConvenio = PlanoSaude & {
  convenio_nome: string
}
