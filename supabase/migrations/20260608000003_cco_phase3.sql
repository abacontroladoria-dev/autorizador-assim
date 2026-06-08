-- Fase 3 — Motor de Conciliação (CCO)
-- Adiciona payload_json e registra cron do engine

-- ============================================================================
-- ALTER TABLE: payload_json
-- ============================================================================

ALTER TABLE cco.occurrences
  ADD COLUMN IF NOT EXISTS payload_json jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_occ_payload
  ON cco.occurrences USING gin(payload_json);

-- ============================================================================
-- CRON: cco-conciliation-engine (Fallback trigger)
-- ============================================================================
-- Schedule: Every 10 minutes (offset :02, :12, :22, etc.)
-- Fallback to HTTP POST in case fire-and-forget from sync jobs fails
-- Advisory lock in the engine prevents concurrent execution

SELECT cron.schedule(
  'cco-conciliation-engine',
  '2,12,22,32,42,52 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/cco-conciliation-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    )
  $$
);

COMMENT ON TABLE cco.occurrences IS 'Ocorrências detectadas pelo motor de conciliação. Cada tipo de problema gera uma ocorrência com fingerprint único por session_key + tipo. Pode ser reaberta automaticamente se condição reaparecer.';
COMMENT ON COLUMN cco.occurrences.payload_json IS 'Dados contextuais da ocorrência em JSON (timestamps, IDs, valores brutos). Permite rastrear valores no momento da detecção sem multiplicar colunas da tabela.';
