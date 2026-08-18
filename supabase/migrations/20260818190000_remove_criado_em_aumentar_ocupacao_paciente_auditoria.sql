-- Pedido do usuário (2026-08-18): criado_em (timestamptz, sempre em UTC) era
-- redundante e confuso ao lado de data/hora (texto, já convertido pra
-- horário de Brasília — ver 20260818180000). Removido; data/hora seguem
-- sendo as únicas colunas de data/hora da tabela.

alter table public.aumentar_ocupacao_paciente_auditoria
  drop column if exists criado_em;
