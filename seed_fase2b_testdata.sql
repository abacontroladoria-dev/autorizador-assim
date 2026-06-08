-- ============================================================================
-- SEED DATA — FASE 2-B Test Dataset
-- ============================================================================
-- Cria dados realistas para testar:
-- 1. Detecção de mutações
-- 2. Consolidação de autorizações
-- 3. Soft delete & retention
-- 4. Motor de conciliação (Fase 3)

-- ============================================================================
-- CLEAR OLD TEST DATA (optional — comment out if you want to preserve)
-- ============================================================================
DELETE FROM cco.session_substitutions WHERE session_key LIKE 'test_%';
DELETE FROM cco.occurrences WHERE session_key LIKE 'test_%';
DELETE FROM cco.session_authorizations WHERE session_key LIKE 'test_%';
DELETE FROM cco.session_mutations WHERE session_key_old LIKE 'test_%' OR session_key_new LIKE 'test_%';
DELETE FROM cco.atendimentos WHERE session_key LIKE 'test_%';

-- ============================================================================
-- INSERT TEST SESSIONS — cco.atendimentos
-- ============================================================================
-- Scenario: Mix of active, orphaned, and edge-case sessions
-- Uses test_* prefix for easy identification

INSERT INTO cco.atendimentos (
  session_key,
  tita_agendamento_id,
  paciente_nome,
  data_sessao,
  hora_inicio,
  status_agendamento,
  possui_tratativa,
  justificativa,
  created_at
) VALUES
-- ✅ ATIVO — Autorização pendente (will generate AUTORIZACAO_PENDENTE)
('test_001_pendente', 1001, 'Maria Silva', CURRENT_DATE, '09:00', 'AGENDADA', FALSE, NULL, now()),

-- ✅ ATIVO — Sem autorização (will generate SESSAO_SEM_AUTORIZACAO)
('test_002_sem_autorizacao', 1002, 'João Santos', CURRENT_DATE, '10:00', 'AGENDADA', FALSE, NULL, now()),

-- ✅ ATIVO — Evolução atrasada (2+ dias sem tratativa) (will generate EVOLUCAO_ATRASADA)
('test_003_evolucao_atrasada', 1003, 'Ana Costa', CURRENT_DATE - INTERVAL '3 days', '14:00', 'AGENDADA', FALSE, NULL, now()),

-- ✅ ATIVO — Com terapeuta faltando (will generate FALTA_TERAPEUTA)
('test_004_falta_terapeuta', 1004, 'Carlos Oliveira', CURRENT_DATE, '11:00', 'AGENDADA', FALSE, NULL, now()),

-- ✅ ATIVO — Com substituição (will generate SUBSTITUICAO)
('test_005_substituicao', 1005, 'Patricia Mendes', CURRENT_DATE, '13:00', 'AGENDADA', FALSE, NULL, now()),

-- ✅ ATIVO — Falta de paciente (will generate FALTA_PACIENTE)
('test_006_falta_paciente', 1006, 'Lucas Ferreira', CURRENT_DATE, '15:00', 'FALTA_PACIENTE', FALSE, 'Paciente faltou sem justificativa', now()),

-- ✅ ATIVO — Autorização com glosa (will generate GLOSA)
('test_007_glosa', 1007, 'Fernanda Gomes', CURRENT_DATE, '16:00', 'AGENDADA', FALSE, NULL, now()),

-- ✅ ATIVO — Sesão normal (control: sem ocorrências)
('test_008_normal', 1008, 'Roberto Alves', CURRENT_DATE, '17:00', 'AGENDADA', TRUE, NULL, now()),

-- ✅ ORFÃO — Sessão marcada como órfã (mutation evidence)
('test_009_orphaned_old', 1009, 'Beatriz Lima', CURRENT_DATE - INTERVAL '5 days', '09:00', 'REMARCADA', FALSE, NULL, now()),

-- ✅ NOVO — Sessão nova após remarcação (same TITA ID)
('test_010_orphaned_new', 1009, 'Beatriz Lima', CURRENT_DATE, '10:30', 'AGENDADA', FALSE, NULL, now());

-- Mark test_009 as orphaned (soft delete)
UPDATE cco.atendimentos SET
  orphaned_at = now(),
  orphan_reason = 'RESCHEDULED → test_010_orphaned_new'
WHERE session_key = 'test_009_orphaned_old';

-- ============================================================================
-- INSERT MUTATIONS — cco.session_mutations
-- ============================================================================
-- Record the rescheduling event

INSERT INTO cco.session_mutations (
  tita_agendamento_id,
  session_key_old,
  session_key_new,
  mutation_type,
  data_sessao_old,
  data_sessao_new,
  hora_inicio_old,
  hora_inicio_new,
  paciente_nome,
  detected_at,
  processed_at
) VALUES
(1009, 'test_009_orphaned_old', 'test_010_orphaned_new', 'RESCHEDULED',
 CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE, '09:00'::time, '10:30'::time,
 'Beatriz Lima', now() - INTERVAL '2 hours', now() - INTERVAL '1 hour');

-- ============================================================================
-- INSERT AUTHORIZATIONS — cco.session_authorizations
-- ============================================================================
-- Cover all authorization status variations
-- Valid statuses: LIBERADA, PENDENTE, GLOSA, CANCELADA, SEM_SOLICITACAO
-- Valid sources: assim, fila

INSERT INTO cco.session_authorizations (
  session_key,
  source,
  authorization_status,
  status_assim,
  synced_at,
  inherited_from
) VALUES
-- Pendente (10+ min old)
('test_001_pendente', 'assim', 'PENDENTE', NULL, now() - INTERVAL '15 minutes', NULL),

-- Glosa
('test_007_glosa', 'assim', 'GLOSA', 'GLOSA_REGISTRADA', now(), NULL),

-- Normal + inherited (from orphaned session)
('test_010_orphaned_new', 'assim', 'LIBERADA', 'AUTORIZADO', now(), 'test_009_orphaned_old'),

-- Normal
('test_008_normal', 'assim', 'LIBERADA', 'AUTORIZADO', now(), NULL);

-- ============================================================================
-- INSERT SESSION SUBSTITUTIONS — cco.session_substitutions
-- ============================================================================
-- Valid statuses: falta, substituto, presente, confirmado

INSERT INTO cco.session_substitutions (
  session_key,
  tita_agendamento_id,
  status_ct,
  profissional_substituto_id,
  synced_at
) VALUES
-- Terapeuta faltando, sem substituto
('test_004_falta_terapeuta', 1004, 'falta', NULL, now()),

-- Com substituição registrada
('test_005_substituicao', 1005, 'substituto', 201, now());

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT 'SEED DATA COMPLETED' as status;

SELECT
  'Total Sessions' as metric,
  COUNT(*) as count
FROM cco.atendimentos
WHERE session_key LIKE 'test_%';

SELECT
  'Active Sessions' as metric,
  COUNT(*) as count
FROM cco.atendimentos
WHERE session_key LIKE 'test_%' AND orphaned_at IS NULL;

SELECT
  'Orphaned Sessions' as metric,
  COUNT(*) as count
FROM cco.atendimentos
WHERE session_key LIKE 'test_%' AND orphaned_at IS NOT NULL;

SELECT
  'Authorizations (Status)' as metric,
  authorization_status,
  COUNT(*) as count
FROM cco.session_authorizations
WHERE session_key LIKE 'test_%'
GROUP BY authorization_status;

SELECT
  'Session Mutations' as metric,
  COUNT(*) as count
FROM cco.session_mutations
WHERE session_key_old LIKE 'test_%' OR session_key_new LIKE 'test_%';

SELECT
  'Session Substitutions' as metric,
  COUNT(*) as count
FROM cco.session_substitutions
WHERE session_key LIKE 'test_%';
