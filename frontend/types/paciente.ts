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

  nome: string
  /**
   * Preenchido por trigger no banco a partir de `nome` (sem acento, sem
   * pontuação, minúsculo, espaço colapsado). É a chave de comparação de nome —
   * a única. Não normalize nome de paciente no cliente para depois comparar.
   */
  nome_normalizado: string | null
  cpf: string | null
  data_nascimento: string | null
  sexo: SexoPaciente | null
  email: string | null
  telefone: string | null

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
 *   - `convenio_*` e `numero_carteirinha` (derivados do TiTa);
 *   - `tita_paciente_id`, `sincronizado_em` (identidade externa, do sync).
 */
export type PacienteEdit = {
  id_paciente?: number
  nome: string
  cpf: string | null
  data_nascimento: string | null
  sexo: SexoPaciente | null
  email: string | null
  telefone: string | null
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
