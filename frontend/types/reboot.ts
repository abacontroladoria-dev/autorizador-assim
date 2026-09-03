// Tipos das tabelas do sistema próprio de agendamentos (reboot_*) — ver
// supabase/migrations/20260812140100_create_reboot_profissionais.sql,
// 20260812140200_create_reboot_disponibilidade_profissional.sql e
// 20260812150000_add_usuario_responsavel_reboot.sql. Escritos à mão (mesmo
// padrão dos demais arquivos em frontend/types/) — não existe um arquivo de
// tipos gerado do Supabase dentro do contexto de build do frontend.

export interface RebootProfissionalRow {
  id_profissional: number
  nome: string
  especialidade: string | null
  ativo: boolean
  criado_em: string
  atualizado_em: string
  id_usuario: string | null
  nome_usuario_responsavel: string | null
}

export interface RebootDisponibilidadeRow {
  id_disponibilidade: number
  id_profissional: number
  dia_semana: number
  horario_inicio: string
  horario_fim: string
  duracao_sessao_minutos: number
  intervalo_inicio: string | null
  intervalo_fim: string | null
  criado_em: string
  atualizado_em: string
  id_usuario: string | null
  nome_usuario_responsavel: string | null
}
