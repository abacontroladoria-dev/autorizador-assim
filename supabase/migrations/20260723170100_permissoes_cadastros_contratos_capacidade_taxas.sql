-- Novas telas de Cadastros (Contratos, Capacidade, Variáveis & Taxas), saídas
-- de dentro de /relacionamento-prestador/config — a rota antiga deixa de
-- existir, então a permissão que cobria as 3 abas juntas também sai.

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cadastros_contratos', 'Contratos', '/cadastros/contratos', 'Cadastros',
   'Cadastro de contratos vigentes/antigos por profissional (PA por atendimento ou banco de horas)'),
  ('cadastros_capacidade', 'Capacidade', '/cadastros/capacidade', 'Cadastros',
   'Limite de pacientes de Coordenador de Caso por profissional'),
  ('cadastros_taxas', 'Variáveis & Taxas', '/cadastros/taxas-e-parametros', 'Cadastros',
   'Taxas de PA e diária por especialidade, e parâmetros globais de remuneração')
on conflict (codigo) do nothing;

-- usuarios_permissoes.permissao_codigo referencia permissoes(codigo) ON DELETE
-- CASCADE (20260529110000) — overrides individuais dessa permissão somem junto.
delete from public.permissoes where codigo = 'relacionamento_prestador_config';
