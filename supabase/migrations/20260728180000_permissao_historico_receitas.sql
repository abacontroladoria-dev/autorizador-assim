-- Nova aba "Histórico de Receitas" em Indicadores (Etapa 4 da evolução da
-- Previsão de Receitas) — mesmo padrão de permissão por aba já usado pelas
-- outras abas de /cronograma/indicadores (ver 20260724210000).

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('indicadores_historico_receitas', 'Histórico de Receitas', '/cronograma/indicadores?tab=historico-receitas', 'Indicadores',
   'Índice mensal do histórico congelado de receita: projetado, deduções por falta e receita efetivada, mês a mês')
on conflict (codigo) do nothing;
