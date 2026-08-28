insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cronograma_ocupacao_salas', 'Ocupação de Salas', '/cronograma/ocupacao-salas', 'Cronograma', 'Cadastro de salas e ocupação cruzada com a agenda real')
on conflict (codigo) do nothing;
