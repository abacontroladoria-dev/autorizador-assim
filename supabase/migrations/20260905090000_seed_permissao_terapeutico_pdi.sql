-- Permissão do PDI (Controle de Prazos + Painel por Analista) no catálogo de
-- /admin/permissoes — SEM esta linha, a permissão `terapeutico_pdi` existe no
-- código (lib/permissions/routes.ts) e no RLS (20260904120000/120100), mas não
-- aparece na tela de administração pra conceder a ninguém (Amanda/Gracielle),
-- porque aquela tela lista `public.permissoes`, um catálogo à parte — mesmo
-- padrão de 20260828150200_seed_permissao_acompanhamento_laudos.sql.
--
-- UM código só pras duas telas (Controle de Prazos e Painel por Analista):
-- é a mesma decisão já tomada no código (`terapeutico_pdi` mapeia as DUAS
-- rotas em CODIGO_PARA_ROTAS) — as duas telas leem os mesmos dados e fazem
-- sentido ser concedidas juntas, não perguntas separadas no admin.
--
-- Grupo 'Terapêutico', mesmo grupo do Sidebar (Análise de Tratativas / Escala
-- Terapêutica).
--
-- ⚠️ Os grupos de permissão são ADITIVOS e a união dos modelos só é
-- materializada no "Aplicar" de /admin/permissoes. Inserir o código aqui NÃO
-- concede acesso a ninguém: quem entra por papel entra pelos roleDefaults do
-- frontend (admin/diretoria já têm), e quem precisa de override explícito
-- (Amanda/Gracielle) precisa receber o código lá, na tela.

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('terapeutico_pdi', 'PDI - Controle de Prazos', '/terapeutico/prazos-pdi', 'Terapêutico',
   'Controle de Prazos do PDI (avaliação, relatório, PIC, fechamento) e o Painel por Analista (dashboard por Coordenador de Caso)')
ON CONFLICT (codigo) DO NOTHING;
