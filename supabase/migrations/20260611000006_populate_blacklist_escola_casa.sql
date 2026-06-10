-- Popula BLACKLIST_AUTORIZACAO com as terapias que não devem ser auditadas pelo fluxo ASSIM.
--
-- Aplicador ABA Escola e Aplicador ABA Casa são operações de atendimento presencial
-- que não requerem autorização eletrônica via ASSIM. Portanto, suas sessões devem ser
-- excluídas da Auditoria ASSIM tanto na fila de registros quanto na fila de faltas.

-- Verificar e inserir apenas se ainda não existem
DELETE FROM public.config_regras_terapias
WHERE categoria = 'BLACKLIST_AUTORIZACAO'
  AND terapia_nome IN ('Aplicador ABA Escola', 'Aplicador ABA Casa');

INSERT INTO public.config_regras_terapias (categoria, terapia_nome, ativo)
VALUES
  ('BLACKLIST_AUTORIZACAO', 'Aplicador ABA Escola', true),
  ('BLACKLIST_AUTORIZACAO', 'Aplicador ABA Casa', true);

GRANT SELECT ON TABLE public.config_regras_terapias TO anon, authenticated;
