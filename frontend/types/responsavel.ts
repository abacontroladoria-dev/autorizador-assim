// Responsável pelo paciente (`public.responsaveis` + `public.pacientes_responsaveis`).
//
// Entidade própria, e não campos repetidos dentro do paciente, porque irmãos
// atendidos na clínica compartilham responsável. As colunas legadas
// `pacientes.responsavel_*` continuam existindo, mas como espelho somente-leitura
// do sync do TiTa — a verdade digitada é esta aqui.
//
// Ver supabase/migrations/20260826100200_create_responsaveis.sql.

export type TipoVinculoResponsavel =
  | "filiacao_1"
  | "filiacao_2"
  | "financeiro"
  | "pedagogico"

/** Rótulos da tela, na ordem em que aparecem no formulário. */
export const TIPOS_VINCULO: { tipo: TipoVinculoResponsavel; rotulo: string }[] = [
  { tipo: "filiacao_1", rotulo: "Filiação 1" },
  { tipo: "filiacao_2", rotulo: "Filiação 2" },
  { tipo: "financeiro", rotulo: "Responsável financeiro" },
  { tipo: "pedagogico", rotulo: "Responsável pedagógico" },
]

export type Responsavel = {
  id: number
  nome: string
  cpf: string | null
  rg: string | null
  rg_orgao_emissor: string | null
  rg_uf: string | null
  data_nascimento: string | null
  celular: string | null
  telefone_residencial: string | null
  email: string | null

  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null

  ativo: boolean
  criado_em: string
  atualizado_em: string
}

/** O que a tela pode gravar. `id` ausente = criação. */
export type ResponsavelEdit = Omit<Responsavel, "id" | "criado_em" | "atualizado_em"> & {
  id?: number
}

/** Vínculo já resolvido, com o responsável embutido — o que a tela exibe. */
export type VinculoResponsavel = {
  paciente_id: number
  responsavel_id: number
  tipo: TipoVinculoResponsavel
  parentesco: string | null
  responsavel: Responsavel
}

/** O vínculo enquanto está sendo editado, antes de salvar. */
export type VinculoResponsavelEdit = {
  responsavel_id: number
  tipo: TipoVinculoResponsavel
  parentesco: string | null
}
