-- remuneracao_contratos_antigos e remuneracao_contratos_atuais foram substituídas por
-- remuneracao_contratos + remuneracao_contratos_itens (ver 20260710120000 e
-- 20260724160000). Nenhum código do app lê mais essas duas tabelas — renomeadas
-- (não dropadas, por segurança) para deixar isso óbvio no Table Editor. O rename já
-- foi feito manualmente em produção via dashboard; esta migration só formaliza no
-- histórico (IF EXISTS torna reaplicar um no-op seguro).

ALTER TABLE IF EXISTS remuneracao_contratos_antigos
  RENAME TO "EM DESUSO - remuneracao_contratos_antigos";

ALTER TABLE IF EXISTS remuneracao_contratos_atuais
  RENAME TO "EM DESUSO - remuneracao_contratos_atuais";
