-- Permissão de acesso ao controle de insumos (porte do AXIUM).
--
-- Definição do usuário em 2026-08-18: quem acessa é o setor **`faturamento`**,
-- mais `admin` e `diretoria`.
--
-- ATENÇÃO AO NOME DO PAPEL: o pedido falou "financeiro", mas esse valor NÃO
-- existe — o CHECK de `usuarios.role` aceita apenas admin, diretoria, recepcao,
-- autorizacao, terapeutico, faturamento, rp, cronograma e
-- disponibilidade_terapeuta. O setor financeiro do dia a dia é o papel
-- `faturamento`, e foi nele que a permissão entrou. Se a intenção era criar um
-- papel NOVO, separado de `faturamento`, é outra migration: mexe no CHECK, na
-- tela de administração e nos roleDefaults.
--
-- Um código só (`insumos`), não os 8 granulares do AXIUM
-- (compras.ver/aprovar/comprar/confirmar-entrega/cotar-manual/alterar-status/
-- solicitar/editar): o acesso pedido é por setor. Granularizar quando aparecer o
-- caso de quem cota mas não aprova.
--
-- O default por papel vive em `frontend/lib/permissions/routes.ts` (roleDefaults),
-- não aqui. Esta tabela é o catálogo que alimenta a tela /admin/permissoes e os
-- overrides por usuário em `usuarios_permissoes`.

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('insumos', 'Controle de Insumos', '/insumos', 'Insumos',
   'Solicitacoes de compra, cotacoes, aprovacao e registro de compra de insumos')
ON CONFLICT (codigo) DO NOTHING;
