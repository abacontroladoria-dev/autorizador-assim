-- Registra na tabela de módulos os códigos de permissão que faltavam.
-- usuarios_permissoes.permissao_codigo tem FK para permissoes(codigo), então
-- esses códigos só podem ser ajustados por usuário no painel se existirem aqui.
-- 'cco' nunca foi inserido no seed original; as demais são rotas que antes
-- não tinham módulo direcionado (/autorizacoes, /preauditoria, /outros-convenios).

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cco',              'Conciliação ASSIM', '/cco',              'Operações', 'Conciliação CCO ASSIM'),
  ('autorizacoes',     'Autorizações',      '/autorizacoes',     'Operações', 'Histórico e gestão de autorizações'),
  ('preauditoria',     'Pré-auditoria',     '/preauditoria',     'Operações', 'Visão operacional de pré-auditoria'),
  ('outros_convenios', 'Outros Convênios',  '/outros-convenios', 'Pacientes', 'Pacientes de outros convênios')
on conflict (codigo) do nothing;
