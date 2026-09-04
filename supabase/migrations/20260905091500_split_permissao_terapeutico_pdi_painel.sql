-- Separa a permissão do PDI em DOIS códigos independentes — pedido do
-- usuário (05/09/2026): a linha única em public.permissoes cobria as duas
-- telas (Controle de Prazos + Painel por Analista) com um só toggle; agora
-- cada uma tem a sua, e dá pra conceder separadamente em /admin/permissoes.
--
-- `terapeutico_pdi` continua sendo a mesma permissão de antes (código
-- inalterado, só a descrição é corrigida — não cobre mais o Painel). A RLS
-- de escrita em pdi_controle_prazos (20260904120000/120100) continua
-- exigindo ESTE código, não o novo — ver o comentário em
-- frontend/lib/permissions/routes.ts.

UPDATE public.permissoes
SET descricao = 'Controle de Prazos do PDI (avaliação, relatório, PIC, fechamento) — dados manuais e histórico'
WHERE codigo = 'terapeutico_pdi';

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('terapeutico_pdi_painel', 'PDI - Painel por Analista', '/terapeutico/pdi-painel-analista', 'Terapêutico',
   'Painel por Analista do PDI — dashboard por Coordenador de Caso, com semáforo de atrasados')
ON CONFLICT (codigo) DO NOTHING;
