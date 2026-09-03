-- Adiciona quem criou a suspensão diretamente na linha da tabela.
--
-- Até aqui, "quem criou" só existia em cadastros_auditoria (tabela =
-- 'suspensao_temporaria', acao = 'criar') — o frontend consultava a trilha
-- pra mostrar isso no card. O usuário pediu uma coluna própria na tabela: a
-- trilha é best-effort (grava fire-and-forget, ver
-- avisarFalhaDeTrilha em cadastrosAuditoria.service.ts — se o insert nela
-- falhar, o card ficaria sem "criado por" mesmo com a suspensão salva).
--
-- `usuario_nome` denormalizado ao lado de `usuario_id`, mesmo padrão de
-- cadastros_auditoria (20260826120000): o nome sobrevive mesmo que o usuário
-- seja renomeado ou removido depois.

alter table public.cadastros_pacientes_suspensoes_temporarias
  add column if not exists criado_por_usuario_id uuid references public.usuarios(id),
  add column if not exists criado_por_usuario_nome text;

comment on column public.cadastros_pacientes_suspensoes_temporarias.criado_por_usuario_id is
  'Usuário que criou o registro. Preenchido pelo frontend no insert (criarSuspensao), não por trigger.';
comment on column public.cadastros_pacientes_suspensoes_temporarias.criado_por_usuario_nome is
  'Nome denormalizado — sobrevive a rename/remoção do usuário em public.usuarios.';

-- Backfill das linhas já existentes, a partir da trilha de auditoria (melhor
-- esforço: só preenche onde a linha 'criar' correspondente existe).
update public.cadastros_pacientes_suspensoes_temporarias t
set criado_por_usuario_id = a.usuario_id,
    criado_por_usuario_nome = a.usuario_nome
from public.cadastros_auditoria a
where a.tabela = 'suspensao_temporaria'
  and a.acao = 'criar'
  and a.registro_id = t.id_suspensao::text
  and t.criado_por_usuario_id is null;
