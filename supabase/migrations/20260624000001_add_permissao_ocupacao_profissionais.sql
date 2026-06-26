insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('ocupacao_profissionais', 'Ocupação de Profissionais', '/cronograma/indicadores', 'Cronograma', 'Painel analítico de ocupação por profissional')
on conflict (codigo) do nothing;
