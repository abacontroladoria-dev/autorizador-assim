-- Os itens recorrentes da PEP (Supervisão, Estudo, Treinamento de
-- Aplicadores, Treinamento Parental) podem ser entregues parcialmente no mês
-- (ex.: TC2 do PRD — "faltaram 2 das 4 supervisões"). O registro até aqui só
-- guardava um status binário (entregue/pendente) por item/competência, o que
-- não permite o motor de cálculo (calculoPEP.ts, Seção 9.2) apurar o ajuste
-- proporcional. Esta migration adiciona a contagem.
--
-- Para os itens semestrais o status binário continua sendo a fonte da
-- verdade (não há "quantidade" — é entregue ou não).

ALTER TABLE pep_registros_entrega
  ADD COLUMN IF NOT EXISTS quantidade_entregue integer;

COMMENT ON COLUMN pep_registros_entrega.quantidade_entregue IS
  'Só para itens recorrentes (pep_catalogo_itens.classe = recorrente): quantas unidades foram entregues na competência. NULL para itens semestrais, que usam apenas "status".';
