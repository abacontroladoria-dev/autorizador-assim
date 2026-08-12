-- Rastreabilidade: quem é o usuário responsável por cada registro criado nas
-- tabelas do sistema próprio de agendamentos (reboot_*). Mesmo padrão de
-- usuario_id/usuario_nome já usado em cronograma_ocupacao_trilha_auditoria
-- (ver 20260810161045_create_cronograma_ocupacao_trilha_auditoria.sql), mas
-- aqui direto nas próprias tabelas (não em uma trilha separada), a pedido do
-- usuário. Nullable: tabelas ainda vazias, sem histórico a migrar, mas o
-- preenchimento é sempre feito pela camada de escrita do frontend.

ALTER TABLE public.reboot_pacientes
  ADD COLUMN IF NOT EXISTS id_usuario uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nome_usuario_responsavel text;

ALTER TABLE public.reboot_profissionais
  ADD COLUMN IF NOT EXISTS id_usuario uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nome_usuario_responsavel text;

ALTER TABLE public.reboot_disponibilidade_profissional
  ADD COLUMN IF NOT EXISTS id_usuario uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nome_usuario_responsavel text;

ALTER TABLE public.reboot_agendamentos
  ADD COLUMN IF NOT EXISTS id_usuario uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS nome_usuario_responsavel text;
