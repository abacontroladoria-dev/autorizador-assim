insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cronograma_valores_convenio', 'Valores de Convênio', '/cronograma/valores-convenio', 'Cronograma', 'Cadastro de valores por convênio/terapia, com exceções por paciente')
on conflict (codigo) do nothing;
