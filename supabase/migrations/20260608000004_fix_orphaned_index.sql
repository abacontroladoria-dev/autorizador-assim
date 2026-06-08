-- Fix: Index condition inverted for orphan cleanup queries
-- Previously: WHERE orphaned_at IS NULL (for active records)
-- Now: WHERE orphaned_at IS NOT NULL (for orphaned records to cleanup)

-- Drop the incorrectly-conditioned index
DROP INDEX IF EXISTS cco.idx_atend_orphaned_at;

-- Create the correct index for cleanup queries
CREATE INDEX idx_atend_orphaned_at ON cco.atendimentos(orphaned_at)
WHERE orphaned_at IS NOT NULL;

COMMENT ON INDEX cco.idx_atend_orphaned_at IS
  'Performance index for orphan cleanup queries. Filters only orphaned records (orphaned_at IS NOT NULL) for efficient deletion by daily cron job.';
