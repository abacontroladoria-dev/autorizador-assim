-- Registra na tabela de módulos os códigos de permissão do grupo Cronograma
-- que existem no Sidebar/routes.ts (cronograma_solicitacoes, ocupacao_clinica)
-- mas nunca foram inseridos aqui, deixando o grupo ausente em /admin/permissoes.

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cronograma_solicitacoes', 'Saída Profissional / Ocupação Paciente', '/cronograma/solicitacoes', 'Cronograma', 'Solicitações de saída profissional e ocupação de paciente'),
  ('ocupacao_clinica', 'Aceites e Recusas', '/cronograma/ocupacao', 'Cronograma', 'Acompanhamento de aceites e recusas de ocupação')
on conflict (codigo) do nothing;
