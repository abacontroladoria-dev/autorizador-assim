-- Razão Social do prestador PJ: até aqui só cpf/cnpj existiam, e o gerador de
-- documento (montarInfoDocumentoPrestador em lib/remuneracao/documento.ts) já
-- lia razaoSocial/razao_social do cadastro sem nenhuma coluna alimentar isso —
-- por isso o PDF/Word sempre caía em "RAZÃO SOCIAL NÃO CADASTRADA".
alter table remuneracao_contratos
  add column if not exists razao_social text;
