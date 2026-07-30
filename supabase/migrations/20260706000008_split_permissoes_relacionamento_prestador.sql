-- Substitui a permissão única 'relacionamento_prestador' por 6 permissões
-- granulares (uma por aba/rota), para permitir liberar acesso separadamente
-- por aba (ex.: um usuário só com "Legenda", outro só com "Config").

DELETE FROM public.permissoes WHERE codigo = 'relacionamento_prestador';
DELETE FROM public.usuarios_permissoes WHERE permissao_codigo = 'relacionamento_prestador';

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('relacionamento_prestador_analise',    'Rem. Mês - Previsão',   '/relacionamento-prestador/analise',    'Relacionamento Prestador', 'Projeção mensal de remuneração via Supabase (sem upload)'),
  ('relacionamento_prestador_rp',         'Rem. Mês - Total',      '/relacionamento-prestador/rp',         'Relacionamento Prestador', 'Remuneração real do mês via upload de relatórios'),
  ('relacionamento_prestador_individual', 'Rem. Mês - Individual', '/relacionamento-prestador/individual', 'Relacionamento Prestador', 'Documento de remuneração por prestador'),
  ('relacionamento_prestador_config',     'Config',                '/relacionamento-prestador/config',     'Relacionamento Prestador', 'Configuração de taxas, diárias e contratos'),
  ('relacionamento_prestador_historico',  'Histórico',             '/relacionamento-prestador/historico',  'Relacionamento Prestador', 'Histórico de remuneração'),
  ('relacionamento_prestador_legenda',    'Legenda',               '/relacionamento-prestador/legenda',    'Relacionamento Prestador', 'Legenda de termos e regras')
on conflict (codigo) do nothing;
