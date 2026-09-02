-- Contrato de banco de horas com 1 único vínculo pode cobrir mais de uma
-- terapia da agenda do profissional (ex.: Especialista Técnico de Área +
-- Fonoaudiologia no mesmo contrato). O cadastro agora deixa marcar todas via
-- checkbox; quando 2+ estão marcadas, `funcao` grava o rótulo composto
-- "Contrato único, especialidades múltiplas" (usado como está pelo dashboard
-- de Rem. Mês — vira uma barra própria, sem ratear o valor entre as
-- especialidades reais, a pedido do usuário). Esta coluna guarda a seleção
-- crua, só para o checkbox reabrir marcado do jeito que foi salvo — nenhum
-- cálculo em lib/remuneracao/ lê ela.
ALTER TABLE remuneracao_contratos_itens
  ADD COLUMN IF NOT EXISTS especialidades_banco_horas jsonb;

COMMENT ON COLUMN remuneracao_contratos_itens.especialidades_banco_horas IS
  'Array das terapias marcadas no checkbox de banco de horas (jsonb de strings). NULL/vazio = comportamento antigo de terapia única. Só leitura/escrita do cadastro (ContratosCadastro.tsx) — a classificação efetiva usada pelo cálculo continua em `funcao`.';
