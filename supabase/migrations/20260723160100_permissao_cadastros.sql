-- Cria a permissão da nova tela "Feriados" (seção CADASTROS no menu) e move
-- "Cadastro de Valores" para a mesma seção, junto ao novo agrupamento visual.

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cadastros_feriados', 'Feriados', '/cadastros/feriados', 'Cadastros',
   'Cadastro de feriados regionais que descontam dias úteis no Relacionamento Prestador e na Previsão de Receitas')
on conflict (codigo) do nothing;

update public.permissoes
set rota = '/cadastros/cadastro-valores', grupo = 'Cadastros'
where codigo = 'cronograma_valores_convenio';
