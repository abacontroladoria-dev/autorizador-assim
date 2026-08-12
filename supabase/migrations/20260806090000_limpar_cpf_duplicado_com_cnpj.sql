-- Consolida o documento do prestador numa coluna só: quando cpf e cnpj estão
-- os dois preenchidos no mesmo registro (resquício da tela antiga, que tinha
-- os dois campos livres), o cnpj prevalece e o cpf é zerado — mesmo critério
-- adotado na tela (ContratosCadastro.tsx), que agora só grava numa coluna por
-- vez (splitDocumento em lib/remuneracao/formatacao.ts).
--
-- Só a tabela viva: remuneracao_contratos_atuais foi renomeada para
-- "EM DESUSO - remuneracao_contratos_atuais" em produção (ver migration
-- 20260724170000) e não existe mais sob o nome antigo.
update remuneracao_contratos
set cpf = null
where cpf is not null
  and cnpj is not null;
