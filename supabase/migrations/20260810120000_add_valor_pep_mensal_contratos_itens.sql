-- PRD "Sistema de Faturamento de Prestadores (PA/PEP)" Seção 6/13.3: "valor
-- mensal PEP por paciente (contrato)". Espelha o padrão já usado para PA
-- (valor_pa, que já vive nesta tabela): quando o contrato não define um
-- valor, cai no valor de referência global (remuneracao_config.cc_pe_default)
-- — mesma lógica de paDoContrato() em calculo.ts, agora replicada para PEP.
ALTER TABLE remuneracao_contratos_itens
  ADD COLUMN IF NOT EXISTS valor_pep_mensal numeric;

COMMENT ON COLUMN remuneracao_contratos_itens.valor_pep_mensal IS
  'Valor mensal da PEP por paciente (V), só para contrato de Analista do Comportamento. NULL = usa remuneracao_config.cc_pe_default.';
