-- ============================================================================
-- DIAGNÓSTICO: Sessões Mutantes em CCO
-- ============================================================================
-- Queries para identificar, quantificar e resolver o problema de
-- remarcações de sessão sem rastreamento adequado
-- ============================================================================

-- ============================================================================
-- SEÇÃO 1: DETECÇÃO DE ÓRFÃOS
-- ============================================================================

-- 1.1 Ocorrências com session_key que não existe em cco.atendimentos
-- (FK CONSTRAINT BROKEN se ON DELETE RESTRICT ativo)
SELECT
  COUNT(*) as orphaned_occurrences_count,
  'CRITICAL' as severity
FROM cco.occurrences o
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = o.session_key
);

-- 1.2 Detalhe: Quais ocorrências são órfãs
SELECT
  o.id,
  o.session_key,
  o.tipo,
  o.fingerprint,
  o.created_at,
  o.resolved_at,
  -- Tentativa de rastrear via TITA ID (improvável estar aqui)
  NULL as tita_agendamento_id_hint
FROM cco.occurrences o
LEFT JOIN cco.atendimentos a ON o.session_key = a.session_key
WHERE a.session_key IS NULL
  AND o.resolved_at IS NULL  -- Só as ativas
ORDER BY o.created_at DESC;

-- 1.3 Ocorrências de autorização órfãs (mesmo problema)
SELECT
  COUNT(*) as orphaned_authorizations_count
FROM cco.session_authorizations sa
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = sa.session_key
);

-- 1.4 Substituições órfãs
SELECT
  COUNT(*) as orphaned_substitutions_count
FROM cco.session_substitutions ss
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = ss.session_key
);

-- ============================================================================
-- SEÇÃO 2: DETECÇÃO DE REMARCAÇÕES (se tabela session_mutations existir)
-- ============================================================================

-- 2.1 Histogram de tipos de mutação (depois de implementar change log)
SELECT
  mutation_type,
  COUNT(*) as count,
  DATE_TRUNC('day', mutation_at)::date as date
FROM cco.session_mutations
GROUP BY mutation_type, DATE_TRUNC('day', mutation_at)
ORDER BY date DESC, count DESC;

-- 2.2 Remarcações que geraram órfãos
SELECT
  sm.tita_agendamento_id,
  sm.session_key_before,
  sm.session_key_after,
  sm.mutation_type,
  sm.data_old,
  sm.data_new,
  COUNT(o1.id) as occurrences_old,
  COUNT(o2.id) as occurrences_new,
  MAX(o1.created_at) as last_occurrence_old
FROM cco.session_mutations sm
LEFT JOIN cco.occurrences o1 ON sm.session_key_before = o1.session_key
LEFT JOIN cco.occurrences o2 ON sm.session_key_after = o2.session_key
WHERE sm.session_key_before IS NOT NULL
GROUP BY
  sm.tita_agendamento_id,
  sm.session_key_before,
  sm.session_key_after,
  sm.mutation_type,
  sm.data_old,
  sm.data_new
HAVING COUNT(o1.id) > 0  -- Tem histórico na versão antiga
ORDER BY sm.mutation_at DESC;

-- ============================================================================
-- SEÇÃO 3: DUPLICIDADE DE SESSION_KEYS (mesmo TITA_ID com múltiplas versões)
-- ============================================================================

-- 3.1 TITA_IDs com mais de uma session_key ativa
SELECT
  a.tita_agendamento_id,
  COUNT(DISTINCT a.session_key) as session_key_count,
  STRING_AGG(a.session_key, ', ') as session_keys,
  STRING_AGG(a.data_sessao::text, ', ') as dates
FROM cco.atendimentos a
WHERE a.tita_agendamento_id IS NOT NULL
GROUP BY a.tita_agendamento_id
HAVING COUNT(DISTINCT a.session_key) > 1
ORDER BY session_key_count DESC;

-- 3.2 Quantificação: % de TITA_IDs com duplicatas
SELECT
  SUM(CASE WHEN session_count > 1 THEN 1 ELSE 0 END) as duplicate_tita_ids,
  COUNT(*) as total_tita_ids,
  ROUND(
    100.0 * SUM(CASE WHEN session_count > 1 THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as percent_duplicated
FROM (
  SELECT
    tita_agendamento_id,
    COUNT(DISTINCT session_key) as session_count
  FROM cco.atendimentos
  WHERE tita_agendamento_id IS NOT NULL
  GROUP BY tita_agendamento_id
) sub;

-- ============================================================================
-- SEÇÃO 4: INCONSISTÊNCIA NO DASHBOARD
-- ============================================================================

-- 4.1 Contagem com e sem JOIN (mostra discrepância)
SELECT
  COUNT(*) as count_without_join,
  (SELECT COUNT(*)
   FROM cco.occurrences o
   JOIN cco.atendimentos a ON o.session_key = a.session_key
   WHERE o.resolved_at IS NULL) as count_with_join,
  COUNT(*) - (SELECT COUNT(*)
              FROM cco.occurrences o
              JOIN cco.atendimentos a ON o.session_key = a.session_key
              WHERE o.resolved_at IS NULL) as difference_orphaned
FROM cco.occurrences
WHERE resolved_at IS NULL;

-- 4.2 Contagem por tipo (mostrando inflação por órfãos)
SELECT
  'WITHOUT_JOIN' as method,
  o.tipo,
  COUNT(*) as count
FROM cco.occurrences o
WHERE o.resolved_at IS NULL
GROUP BY o.tipo

UNION ALL

SELECT
  'WITH_JOIN' as method,
  o.tipo,
  COUNT(*) as count
FROM cco.occurrences o
JOIN cco.atendimentos a ON o.session_key = a.session_key
WHERE o.resolved_at IS NULL
GROUP BY o.tipo

ORDER BY tipo, method;

-- ============================================================================
-- SEÇÃO 5: ANÁLISE DE AUTORIZAÇÕES CONSOLIDADAS
-- ============================================================================

-- 5.1 Autorizações da versão antiga que NÃO foram copiadas para nova
SELECT
  sm.session_key_before as old_session,
  sm.session_key_after as new_session,
  COUNT(sa1.id) as old_session_auths,
  (SELECT COUNT(*)
   FROM cco.session_authorizations
   WHERE session_key = sm.session_key_after) as new_session_auths
FROM cco.session_mutations sm
LEFT JOIN cco.session_authorizations sa1 ON sm.session_key_before = sa1.session_key
WHERE sm.session_key_before IS NOT NULL
  AND sm.mutation_type = 'reschedule'
GROUP BY sm.session_key_before, sm.session_key_after
HAVING COUNT(sa1.id) > 0;

-- 5.2 Status de consolidação (se coluna copied_from_session_key existe)
SELECT
  COUNT(*) as total_auths_in_system,
  COUNT(CASE WHEN copied_from_session_key IS NOT NULL THEN 1 END) as consolidated,
  COUNT(CASE WHEN copied_from_session_key IS NULL THEN 1 END) as original,
  ROUND(
    100.0 * COUNT(CASE WHEN copied_from_session_key IS NOT NULL THEN 1 END) / COUNT(*),
    2
  ) as percent_consolidated
FROM cco.session_authorizations;

-- ============================================================================
-- SEÇÃO 6: ANÁLISE TEMPORAL (Identificar quando as mutações ocorrem)
-- ============================================================================

-- 6.1 Taxa de remarcações por dia
SELECT
  DATE_TRUNC('day', sm.mutation_at)::date as date,
  COUNT(*) as mutations_count,
  COUNT(CASE WHEN sm.mutation_type = 'reschedule' THEN 1 END) as reschedules,
  COUNT(CASE WHEN sm.mutation_type = 'cancellation' THEN 1 END) as cancellations,
  COUNT(CASE WHEN sm.mutation_type = 'substitution' THEN 1 END) as substitutions
FROM cco.session_mutations sm
GROUP BY DATE_TRUNC('day', sm.mutation_at)
ORDER BY date DESC;

-- 6.2 Latência entre remarcação e detecção
SELECT
  AVG(EXTRACT(EPOCH FROM (sm.mutation_at - a.updated_at))/3600)::numeric(5,2) as avg_latency_hours,
  MAX(EXTRACT(EPOCH FROM (sm.mutation_at - a.updated_at))/3600)::numeric(5,2) as max_latency_hours,
  MIN(EXTRACT(EPOCH FROM (sm.mutation_at - a.updated_at))/3600)::numeric(5,2) as min_latency_hours
FROM cco.session_mutations sm
JOIN cco.atendimentos a ON sm.tita_agendamento_id = a.tita_agendamento_id;

-- ============================================================================
-- SEÇÃO 7: IDENTIFICAÇÃO DE ÓRFÃOS PARA LIMPEZA
-- ============================================================================

-- 7.1 Sessões que desapareceram de TITA (nenhuma correspondência atual)
-- Nota: Requer comparação com última snapshot de TITA
SELECT
  a.session_key,
  a.tita_agendamento_id,
  a.paciente_nome,
  a.data_sessao,
  a.hora_inicio,
  a.updated_at,
  COUNT(o.id) as occurrence_count,
  MIN(o.created_at) as first_occurrence,
  MAX(o.created_at) as last_occurrence
FROM cco.atendimentos a
LEFT JOIN cco.occurrences o ON a.session_key = o.session_key
WHERE a.tita_agendamento_id IS NOT NULL
  AND a.data_sessao < CURRENT_DATE
  AND NOT EXISTS (
    -- Assumindo tabela last_tita_sync que mantém snapshot do CSV mais recente
    SELECT 1 FROM last_tita_sync lt
    WHERE lt.tita_agendamento_id = a.tita_agendamento_id
  )
GROUP BY
  a.id, a.session_key, a.tita_agendamento_id, a.paciente_nome,
  a.data_sessao, a.hora_inicio, a.updated_at
ORDER BY a.updated_at DESC;

-- 7.2 Sessões órfãs: NÃO tem referência em nenhuma outra tabela
SELECT
  a.session_key,
  a.paciente_nome,
  a.data_sessao,
  COUNT(o.id) as occurrences,
  COUNT(sa.id) as authorizations,
  COUNT(ss.id) as substitutions
FROM cco.atendimentos a
LEFT JOIN cco.occurrences o ON a.session_key = o.session_key
LEFT JOIN cco.session_authorizations sa ON a.session_key = sa.session_key
LEFT JOIN cco.session_substitutions ss ON a.session_key = ss.session_key
WHERE NOT EXISTS (
  SELECT 1 FROM last_tita_sync lt
  WHERE lt.tita_agendamento_id = a.tita_agendamento_id
)
  AND a.data_sessao < CURRENT_DATE - INTERVAL '7 days'
GROUP BY a.id, a.session_key, a.paciente_nome, a.data_sessao
HAVING COUNT(o.id) = 0 AND COUNT(sa.id) = 0 AND COUNT(ss.id) = 0
ORDER BY a.data_sessao ASC;

-- ============================================================================
-- SEÇÃO 8: VALIDAÇÃO DE INTEGRIDADE PÓS-IMPLEMENTAÇÃO
-- ============================================================================

-- 8.1 Teste: Zero orphans rule
WITH orphan_check AS (
  SELECT
    'occurrences' as table_name,
    COUNT(*) as orphan_count
  FROM cco.occurrences o
  WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = o.session_key)

  UNION ALL

  SELECT
    'session_authorizations',
    COUNT(*)
  FROM cco.session_authorizations sa
  WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = sa.session_key)

  UNION ALL

  SELECT
    'session_substitutions',
    COUNT(*)
  FROM cco.session_substitutions ss
  WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = ss.session_key)
)
SELECT
  table_name,
  orphan_count,
  CASE WHEN orphan_count = 0 THEN '✅ PASS' ELSE '❌ FAIL' END as status
FROM orphan_check;

-- 8.2 Teste: tita_agendamento_id uniqueness per chain
SELECT
  tita_agendamento_id,
  COUNT(DISTINCT session_key) as session_key_count,
  CASE
    WHEN COUNT(DISTINCT session_key) = 1 THEN '✅ PASS (única versão ativa)'
    WHEN COUNT(DISTINCT session_key) > 1 THEN '❌ FAIL (múltiplas versões)'
    ELSE '⚠️ NULL'
  END as status
FROM cco.atendimentos
WHERE tita_agendamento_id IS NOT NULL
  AND (SELECT COUNT(*) FROM cco.atendimentos
       WHERE tita_agendamento_id = cco.atendimentos.tita_agendamento_id) > 1
GROUP BY tita_agendamento_id;

-- 8.3 Teste: Consolidation completeness
SELECT
  sm.session_key_after,
  COUNT(DISTINCT sm.session_key_before) as mutations_to_consolidate,
  COUNT(DISTINCT sa_old.id) as old_auths_waiting,
  COUNT(DISTINCT sa_new.id) as new_auths_present,
  CASE
    WHEN COUNT(DISTINCT sa_old.id) = COUNT(DISTINCT sa_new.id) THEN '✅ CONSOLIDATED'
    ELSE '❌ MISSING'
  END as consolidation_status
FROM cco.session_mutations sm
LEFT JOIN cco.session_authorizations sa_old ON sm.session_key_before = sa_old.session_key
LEFT JOIN cco.session_authorizations sa_new ON sm.session_key_after = sa_new.session_key
WHERE sm.mutation_type = 'reschedule'
GROUP BY sm.session_key_after;

-- ============================================================================
-- SEÇÃO 9: CLEANUP SCRIPTS (Executar com CUIDADO)
-- ============================================================================

-- 9.1 Mark orphaned sessions (soft delete)
-- Antes de executar: VALIDAR que realmente são órfãos!
UPDATE cco.atendimentos
SET orphaned_at = now()
WHERE session_key IN (
  SELECT o.session_key
  FROM cco.occurrences o
  LEFT JOIN cco.atendimentos a ON o.session_key = a.session_key
  WHERE a.session_key IS NULL
  LIMIT 100  -- Executar em batches
);

-- 9.2 Soft-delete occurrences of orphaned sessions
UPDATE cco.occurrences
SET orphaned_at = now()
WHERE session_key IN (
  SELECT session_key FROM cco.atendimentos
  WHERE orphaned_at IS NOT NULL
    AND orphaned_at > now() - INTERVAL '1 hour'
)
  AND orphaned_at IS NULL;

-- 9.3 Hard-delete orphaned sessions (AFTER 30-day grace period)
-- Use cron job, não execute manualmente!
DELETE FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL
  AND orphaned_at < now() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM cco.occurrences
    WHERE session_key = cco.atendimentos.session_key
      AND orphaned_at IS NULL
  );

-- ============================================================================
-- SEÇÃO 10: MONITORING VIEW (criar para dashboard)
-- ============================================================================

CREATE OR REPLACE VIEW cco.orphan_monitoring AS
SELECT
  'Critical' as severity,
  'Orphaned Occurrences' as issue,
  COUNT(*) as count,
  'FK references to non-existent session_key' as description
FROM cco.occurrences o
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = o.session_key)
  AND o.resolved_at IS NULL

UNION ALL

SELECT
  'Warning',
  'Duplicate TITA IDs',
  COUNT(DISTINCT tita_agendamento_id),
  'Single TITA appointment with multiple session_keys'
FROM cco.atendiments
WHERE tita_agendamento_id IS NOT NULL
GROUP BY tita_agendamento_id
HAVING COUNT(DISTINCT session_key) > 1

UNION ALL

SELECT
  'Warning',
  'Unconsolidated Mutations',
  COUNT(*),
  'Remarcações sem consolidação de histórico'
FROM cco.session_mutations
WHERE session_key_before IS NOT NULL
  AND mutation_at > now() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM cco.consolidation_log cl
    WHERE cl.source_session_key = cco.session_mutations.session_key_before
      AND cl.target_session_key = cco.session_mutations.session_key_after
  );

-- ============================================================================
-- SEÇÃO 11: REPROCESSAMENTO SEGURO
-- ============================================================================

-- 11.1 Detectar se reprocessamento está gerando duplicatas
SELECT
  a.tita_agendamento_id,
  a.session_key,
  a.data_sessao,
  a.synced_at,
  COUNT(*) as duplicate_count,
  CASE
    WHEN COUNT(*) > 1 THEN 'DELETE DUPLICATES'
    ELSE 'OK'
  END as action
FROM cco.atendimentos a
WHERE a.tita_agendamento_id IS NOT NULL
GROUP BY a.tita_agendamento_id, a.session_key, a.data_sessao, a.synced_at
HAVING COUNT(*) > 1;

-- 11.2 Remove recent duplicates (keep oldest)
DELETE FROM cco.atendimentos
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY tita_agendamento_id, session_key
        ORDER BY synced_at DESC
      ) as rn
    FROM cco.atendimentos
    WHERE synced_at > now() - INTERVAL '6 hours'
  ) sub
  WHERE rn > 1
);

-- ============================================================================
-- METADATA: Table Sizes and Growth
-- ============================================================================

SELECT
  'cco.atendimentos' as table_name,
  COUNT(*) as total_rows,
  (SELECT COUNT(*) FROM cco.atendimentos WHERE orphaned_at IS NOT NULL) as orphaned_rows,
  pg_size_pretty(pg_total_relation_size('cco.atendimentos'::regclass)) as total_size

UNION ALL

SELECT 'cco.occurrences', COUNT(*),
  (SELECT COUNT(*) FROM cco.occurrences WHERE orphaned_at IS NOT NULL),
  pg_size_pretty(pg_total_relation_size('cco.occurrences'::regclass))
FROM cco.occurrences

UNION ALL

SELECT 'cco.session_authorizations', COUNT(*),
  (SELECT COUNT(*) FROM cco.session_authorizations WHERE orphaned_at IS NOT NULL),
  pg_size_pretty(pg_total_relation_size('cco.session_authorizations'::regclass))
FROM cco.session_authorizations;
