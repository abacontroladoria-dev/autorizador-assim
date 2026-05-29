-- Expande o constraint de status da fila para incluir 'glosa' e 'cancelado'
-- e atualiza sync_assim_results para reclassificar corretamente após sincronização.

ALTER TABLE "public"."fila_autorizacoes"
  DROP CONSTRAINT IF EXISTS "chk_status";

ALTER TABLE "public"."fila_autorizacoes"
  ADD CONSTRAINT "chk_status" CHECK ((status = ANY (ARRAY[
    'pendente'::text,
    'processando'::text,
    'executando'::text,
    'concluido'::text,
    'erro'::text,
    'falta'::text,
    'glosa'::text,
    'cancelado'::text
  ]))) NOT VALID;

ALTER TABLE "public"."fila_autorizacoes"
  VALIDATE CONSTRAINT "chk_status";

-- Reclassifica status com base no retorno real do ASSIM:
--   'Liberado *' → cancelado
--   'Liberado'   → concluido  (corrige caso o RPA não detectou a tela de sucesso)
--   outro valor  → glosa      (código de rejeição, ex: "1601-REINCIDENCIA NO ATEN")
--   NULL         → mantém status atual
-- 'concluido', 'falta' e 'pendente' nunca são sobrescritos.
CREATE OR REPLACE FUNCTION public.sync_assim_results()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE fila_autorizacoes fa
  SET
    status_assim        = vm.status_assim,
    status              = CASE
      WHEN vm.status_assim = 'Liberado *'
        AND fa.status <> 'concluido'
        THEN 'cancelado'
      WHEN vm.status_assim = 'Liberado'
        AND fa.status = 'erro'
        THEN 'concluido'
      WHEN vm.status_assim IS NOT NULL
        AND vm.status_assim NOT ILIKE '%Liberado%'
        AND fa.status NOT IN ('concluido', 'falta', 'pendente')
        THEN 'glosa'
      ELSE fa.status
    END,
    numero_autorizacao  = vm.guia,
    horario_autorizacao = vm.data_execucao,
    error_message       = CASE
      WHEN vm.status_assim ILIKE '%REINCIDENCIA%' THEN vm.status_assim
      WHEN vm.status_assim ILIKE '%ERRO%'         THEN vm.status_assim
      ELSE NULL
    END,
    assim_updated_at    = NOW()
  FROM vw_match_autorizacoes_assim vm
  WHERE fa.paciente_id::bigint = vm.paciente_id
    AND fa.data_atendimento    = vm.data_atendimento
    AND fa.horario             = vm.hora_inicial;
END;
$function$;
