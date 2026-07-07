insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('relacionamento_prestador', 'Relacionamento Prestador', '/relacionamento-prestador', 'Relacionamento Prestador', 'Análise, remuneração e histórico dos prestadores (RP)')
on conflict (codigo) do nothing;
