// Cadastro canônico de paciente (`public.pacientes`).
//
// Tipos escritos à mão, seguindo a convenção do projeto: o client do Supabase é
// `createBrowserClient<any>` (lib/supabase/client.ts) e cada domínio declara seu
// próprio tipo em frontend/types/. O `Database` gerado em types/supabase.ts na
// RAIZ do repo não é alcançável pelo alias `@/*`, que aponta para `frontend/`
// — foi por isso que services/reboot/** teve que ser excluído do tsconfig.
//
// Ver supabase/migrations/20260817190000_pacientes_canonica.sql.

/** Origem do cadastro. Governa o que o sync do TiTa pode refrescar. */
export type OrigemCadastroPaciente = "tita" | "pulsar"

export type SexoPaciente = "M" | "F" | "outro"

/** Vocabulário IBGE (PNAD). O rótulo bonito é do frontend. */
export type CorRaca =
  | "branca"
  | "preta"
  | "parda"
  | "amarela"
  | "indigena"
  | "nao_declarada"

export type EstadoCivil =
  | "solteiro"
  | "casado"
  | "divorciado"
  | "viuvo"
  | "separado"
  | "uniao_estavel"

export const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const
export type TipoSanguineo = (typeof TIPOS_SANGUINEOS)[number]

export type Paciente = {
  id_paciente: number
  /**
   * `agenda_tita.paciente_id` (= `raw_json.favorecido.id`). Chave ESTÁVEL do
   * paciente no TiTa e a forma correta de cruzar com a agenda.
   *
   * Nulo quando o paciente foi cadastrado direto no Pulsar. Nunca use `nome`
   * para esse cruzamento: `nome` é rótulo, sujeito a typo, acento e mojibake.
   */
  tita_paciente_id: number | null

  /**
   * NOME DE TRATAMENTO — o que aparece na agenda, no TiTa e nos relatórios.
   * Quando o paciente usa nome social, é este o social; o de registro vai em
   * `nome_civil`. Esta coluna nunca muda de significado: o sync depende dela.
   */
  nome: string
  /**
   * Preenchido por trigger no banco a partir de `nome` (sem acento, sem
   * pontuação, minúsculo, espaço colapsado). É a chave de comparação de nome —
   * a única. Não normalize nome de paciente no cliente para depois comparar.
   */
  nome_normalizado: string | null
  /**
   * Gerada pelo banco (trigger + sequence, ver 20260826100100), só para
   * pacientes cadastrados no Pulsar. NULA nos que vieram do TiTa. Nunca vai no
   * payload do upsert. Exibir com `formatarMatricula`.
   */
  matricula: number | null
  tem_nome_civil: boolean | null
  /** Nome de registro civil. Só faz sentido quando `tem_nome_civil`. */
  nome_civil: string | null
  cpf: string | null
  data_nascimento: string | null
  sexo: SexoPaciente | null
  cor_raca: CorRaca | null
  estado_civil: EstadoCivil | null
  rg: string | null
  rg_orgao_emissor: string | null
  rg_uf: string | null
  rg_data_emissao: string | null
  email: string | null
  telefone: string | null
  telefone_residencial: string | null
  /**
   * Óbito. Deliberadamente INDEPENDENTE de `ativo`: um paciente pode estar
   * inativo por alta e continuar vivo.
   */
  falecido: boolean
  /**
   * PATH do objeto no bucket privado `pacientes-fotos` — não uma URL. A URL
   * assinada é gerada no cliente e expira (ver services/pacientesFoto.service).
   */
  foto_path: string | null

  /**
   * Horário Administrativo, Notificação Prévia, Ainda não selecionado, Horário
   * Bloqueado e afins. Substitui `isFakePatient()` e os quatro filtros SQL
   * divergentes que existiam espalhados.
   */
  ficticio: boolean
  ativo: boolean
  observacoes: string | null
  origem_cadastro: OrigemCadastroPaciente
  /** Último espelhamento a partir do TiTa. */
  sincronizado_em: string | null
  lgpd_consentimento_em: string | null

  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null

  responsavel_nome: string | null
  responsavel_cpf: string | null
  responsavel_email: string | null
  responsavel_telefone: string | null
  responsavel_parentesco: string | null
  responsavel_financeiro: boolean | null
  /** Auto-referência, para irmãos que dividem um mesmo responsável financeiro. */
  responsavel_financeiro_id: number | null

  /**
   * CACHE derivado da linha mais recente de `agenda_tita`, não dado digitado.
   * Convênio é por AGENDAMENTO no TiTa — a verdade por sessão está na agenda.
   */
  convenio_id: number | null
  convenio_nome: string | null
  numero_carteirinha: string | null

  criado_em: string
  atualizado_em: string
  nome_usuario_responsavel: string | null
}

/**
 * O que a tela pode gravar. De fora ficam, de propósito:
 *   - `nome_normalizado` (trigger do banco);
 *   - `matricula` (sequence + trigger, 20260826100100);
 *   - `foto_path` (gravado pelo fluxo de upload, fora do dirty do formulário);
 *   - `convenio_*` e `numero_carteirinha` (derivados do TiTa);
 *   - `tita_paciente_id`, `sincronizado_em` (identidade externa, do sync).
 */
export type PacienteEdit = {
  id_paciente?: number
  nome: string
  tem_nome_civil: boolean | null
  nome_civil: string | null
  cpf: string | null
  data_nascimento: string | null
  sexo: SexoPaciente | null
  cor_raca: CorRaca | null
  estado_civil: EstadoCivil | null
  rg: string | null
  rg_orgao_emissor: string | null
  rg_uf: string | null
  rg_data_emissao: string | null
  email: string | null
  telefone: string | null
  telefone_residencial: string | null
  falecido: boolean
  ativo: boolean
  ficticio: boolean
  observacoes: string | null
  lgpd_consentimento_em: string | null

  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null

  responsavel_nome: string | null
  responsavel_cpf: string | null
  responsavel_email: string | null
  responsavel_telefone: string | null
  responsavel_parentesco: string | null
  responsavel_financeiro: boolean | null
  responsavel_financeiro_id: number | null
}

/**
 * Ficha médica (`public.pacientes_ficha_medica`), 1:1 com o paciente.
 *
 * Tabela separada e não colunas em `pacientes` por SEGURANÇA: `pacientes_select`
 * é aberta a todo autenticado, e dado de saúde não pode herdar essa abertura.
 * Ver 20260826100300.
 */
export type PacienteFichaMedica = {
  paciente_id: number
  tipo_sanguineo: TipoSanguineo | null
  restricoes_alimentares: string | null
  alergias: string | null
  doencas: string | null
  /** FK ainda não fechada — a tabela de planos vem de outra frente. */
  plano_saude_id: number | null
  /**
   * Carteirinha do plano de saúde digitada aqui. NÃO confundir com
   * `Paciente.numero_carteirinha`, que é cache derivado do TiTa.
   */
  numero_carteirinha: string | null
}

/**
 * Exibição da matrícula: cinco dígitos com zero à esquerda (1 -> "00001").
 * Espelha `public.matricula_formatada()` — se um dos dois mudar, mude os dois.
 * Largura MÍNIMA: acima de 99999 devolve o número inteiro, sem truncar.
 */
export function formatarMatricula(matricula: number | null): string {
  if (matricula === null) return "—"
  return String(matricula).padStart(5, "0")
}
