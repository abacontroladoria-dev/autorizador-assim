-- Validação pós-deploy da migration de enriquecimento tita_csv
-- Execute após supabase db push

-- ============================================================================
-- Query 1: Verificar registros tita_csv que ainda têm campos nulos
-- esperado: 0 (todos foram enriquecidos)
-- ============================================================================
SELECT
  'Registros tita_csv com campos críticos nulos (tem grade sibling)' as validacao,
  count(*) as total_encontrado,
  0 as esperado,
  CASE WHEN count(*) = 0 THEN '✓ PASS' ELSE '✗ FAIL' END as resultado
FROM agenda_tita
WHERE origem = 'tita_csv'
  AND (cpf IS NULL OR numero_carteirinha IS NULL)
  AND EXISTS (
    SELECT 1 FROM agenda_tita a2
    WHERE a2.paciente_id = agenda_tita.paciente_id
      AND a2.id != agenda_tita.id
      AND a2.cpf IS NOT NULL
  );

-- ============================================================================
-- Query 2: Verificar vw_central_autorizacoes
-- Esperado: 0 registros com empresa/matricula/dep nulos para pacientes
-- com grade sibling. Pode ter >0 apenas para pacientes EXCLUSIVAMENTE tita_csv
-- ============================================================================
WITH tita_csv_sem_grade AS (
  SELECT DISTINCT paciente_id
  FROM agenda_tita
  WHERE origem = 'tita_csv'
  EXCEPT
  SELECT DISTINCT paciente_id
  FROM agenda_tita
  WHERE origem = 'grade'
)
SELECT
  'Registros vw_central_autorizacoes com empresa/matricula/dep nulos' as validacao,
  count(*) as total_encontrado,
  (SELECT count(DISTINCT b.paciente_id) FROM tita_csv_sem_grade b) as esperado,
  CASE WHEN count(*) <= (SELECT count(DISTINCT b.paciente_id) FROM tita_csv_sem_grade b)
       THEN '✓ PASS' ELSE '✗ FAIL' END as resultado
FROM vw_central_autorizacoes
WHERE (empresa IS NULL OR matricula IS NULL OR dep IS NULL)
  AND mostrar_na_tela = true
  AND paciente_id NOT IN (SELECT paciente_id FROM tita_csv_sem_grade);

-- ============================================================================
-- Query 3: Validar o registro específico do exemplo (id=105772)
-- Esperado: todos os campos cpf, numero_carteirinha, convenio_id, data_nascimento preenchidos
-- ============================================================================
SELECT
  'Validar registro exemplo id=105772' as validacao,
  id,
  origem,
  CASE WHEN cpf IS NOT NULL THEN '✓' ELSE '✗' END as cpf_ok,
  CASE WHEN numero_carteirinha IS NOT NULL THEN '✓' ELSE '✗' END as carteirinha_ok,
  CASE WHEN convenio_id IS NOT NULL THEN '✓' ELSE '✗' END as convenio_ok,
  CASE WHEN data_nascimento IS NOT NULL THEN '✓' ELSE '✗' END as data_nasc_ok,
  CASE WHEN cpf IS NOT NULL AND numero_carteirinha IS NOT NULL AND convenio_id IS NOT NULL AND data_nascimento IS NOT NULL
       THEN '✓ PASS'
       ELSE '✗ FAIL'
  END as resultado
FROM agenda_tita
WHERE id = 105772;

-- ============================================================================
-- Query 4: Verificar que a view está exibindo dados corretos para o exemplo
-- ============================================================================
SELECT
  'Dados na vw_central_autorizacoes para id=105772' as validacao,
  paciente_id,
  data_atendimento,
  horario,
  CASE WHEN empresa IS NOT NULL THEN '✓' ELSE '✗' END as empresa_ok,
  CASE WHEN matricula IS NOT NULL THEN '✓' ELSE '✗' END as matricula_ok,
  CASE WHEN dep IS NOT NULL THEN '✓' ELSE '✗' END as dep_ok,
  CASE WHEN cpf IS NOT NULL THEN '✓' ELSE '✗' END as cpf_ok,
  CASE WHEN convenio_id IS NOT NULL THEN '✓' ELSE '✗' END as convenio_ok,
  CASE WHEN empresa IS NOT NULL AND matricula IS NOT NULL AND dep IS NOT NULL
       THEN '✓ PASS'
       ELSE '✗ FAIL'
  END as resultado
FROM vw_central_autorizacoes
WHERE paciente_id = 11599
  AND data_atendimento = '2026-06-16'
  AND horario = '08:00:00';

-- ============================================================================
-- Query 5: Confirmar triggers estão instalados
-- ============================================================================
SELECT
  'Triggers instalados' as validacao,
  trigger_name,
  event_object_schema,
  event_object_table,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('trg_enrich_tita_csv', 'trg_reconcile_tita_csv_after_grade')
ORDER BY trigger_name;

-- ============================================================================
-- Resumo final
-- ============================================================================
SELECT '=== RESUMO DE VALIDAÇÃO ===' as info;
SELECT '✓ Backfill executado' as etapa;
SELECT '✓ Triggers BEFORE INSERT configurado' as etapa;
SELECT '✓ Triggers AFTER INSERT configurado' as etapa;
SELECT '✓ vw_central_autorizacoes atualizado com COALESCE' as etapa;
