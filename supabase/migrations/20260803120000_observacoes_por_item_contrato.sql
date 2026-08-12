-- A observação do contrato desceu do PROFISSIONAL para o ITEM. Morava em
-- remuneracao_contratos.observacoes (1 por profissional, ver 20260710120000),
-- então quem tinha dois contratos tinha uma nota para os dois e ninguém sabia
-- de qual ela falava. Agora mora em remuneracao_contratos_itens, ao lado de
-- numero/funcao/valor (tabela criada em 20260724160000).
--
-- A coluna do pai NÃO é removida: fica congelada como backup, mesmo padrão do
-- blob jsonb `contratos` em 20260724160000 e das tabelas _atuais/_antigos em
-- 20260710120000. O app para de ESCREVER nela nesta mesma entrega — daqui pra
-- frente ela é histórico, não fonte de verdade. Renomear para "EM DESUSO" fica
-- para uma migration futura, depois de validado em produção (foi assim em
-- 20260724170000).
--
-- ORDEM DE DEPLOY OBRIGATÓRIA: esta migration roda ANTES do deploy do frontend.
-- upsertContrato faz upsert do pai -> DELETE de todos os itens -> INSERT dos
-- itens, em três chamadas PostgREST sem transação. Se o frontend subir primeiro,
-- o INSERT leva `observacoes` numa tabela sem a coluna e volta PGRST204 com o
-- DELETE já executado: o profissional perde TODOS os contratos, e saveAll()
-- dispara as linhas sujas em paralelo, então um "Salvar tudo" limpa vários de
-- uma vez. useDraftRow não salva ao desmontar, logo não há cópia para recuperar.
--
-- Reaplicável: ADD COLUMN IF NOT EXISTS, UPDATE que só escreve onde o item
-- ainda não tem nota, e INSERT guardado por NOT EXISTS.
--
-- RLS não muda: as policies das duas tabelas são row-level (remuneracao_has_role
-- com ['rp','admin','diretoria']), sem referência a coluna.

ALTER TABLE remuneracao_contratos_itens
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Backfill 1 — profissional COM itens: a nota vai para o primeiro contrato dele.
-- É o único palpite honesto, já que a nota nunca disse a qual contrato se
-- referia.
--
-- DISTINCT ON + ORDER BY ordem, e NÃO "WHERE ordem = 0": a tabela não tem unique
-- em (contrato_id, ordem) — só um índice comum. Igualdade a zero perderia a nota
-- de quem, por qualquer motivo, tiver o menor ordem = 1, e gravaria em duas
-- linhas se existissem duas com ordem 0. Assim é sempre exatamente 1 linha.
UPDATE remuneracao_contratos_itens i
   SET observacoes = src.nota,
       updated_at  = now()
  FROM (
    SELECT DISTINCT ON (c.id)
           it.id                            AS item_id,
           nullif(btrim(c.observacoes), '') AS nota
      FROM remuneracao_contratos c
      JOIN remuneracao_contratos_itens it ON it.contrato_id = c.id
     WHERE nullif(btrim(c.observacoes), '') IS NOT NULL
     ORDER BY c.id, it.ordem, it.created_at, it.id
  ) src
 WHERE i.id = src.item_id
   AND i.observacoes IS NULL;  -- idempotente: não sobrescreve nota já editada na tela

-- Backfill 2 — profissional com nota e NENHUM item: sem esta parte a nota dele
-- ficaria invisível para sempre (a tela só mostra nota de item), que é exatamente
-- a perda que esta entrega existe para acabar. Cria o item que CARREGA a nota com
-- vigente = false: a calculadora só olha `vigente`, então nenhum cálculo muda, e
-- o chip do bloco continua dizendo "sem contrato vigente", que era o que já
-- dizia — nenhum aviso troca de texto.
INSERT INTO remuneracao_contratos_itens
  (contrato_id, ordem, numero, funcao, valor_pa, vigente, modelo_faturamento, valor_total, observacoes)
SELECT c.id, 0, NULL, NULL, NULL, false, 'atendimento', NULL, nullif(btrim(c.observacoes), '')
  FROM remuneracao_contratos c
 WHERE nullif(btrim(c.observacoes), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM remuneracao_contratos_itens i WHERE i.contrato_id = c.id
   );

-- O cache de schema do PostgREST precisa VER a coluna nova antes de o frontend
-- mandar `observacoes` no insert de itens.
NOTIFY pgrst, 'reload schema';

-- ─── Conferir depois de aplicar, ANTES de deployar o frontend ───────────────
-- (a) coluna existe
--   select column_name, data_type from information_schema.columns
--    where table_name='remuneracao_contratos_itens' and column_name='observacoes';
--
-- (b) itens_com_nota deve ser >= notas_no_pai
--   select (select count(*) from remuneracao_contratos
--            where nullif(btrim(observacoes),'') is not null) as notas_no_pai,
--          (select count(*) from remuneracao_contratos_itens
--            where nullif(btrim(observacoes),'') is not null) as itens_com_nota;
--
-- (c) nenhuma nota perdida — deve voltar 0 linhas
--   select c.profissional_nome from remuneracao_contratos c
--    where nullif(btrim(c.observacoes),'') is not null
--      and not exists (select 1 from remuneracao_contratos_itens i
--                       where i.contrato_id = c.id
--                         and nullif(btrim(i.observacoes),'') is not null);
