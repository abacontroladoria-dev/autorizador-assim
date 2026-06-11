DROP INDEX IF EXISTS cco.idx_atend_orphaned_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'cco'
      AND table_name = 'atendimentos'
      AND column_name = 'orphaned_at'
  ) THEN

    CREATE INDEX idx_atend_orphaned_at
      ON cco.atendimentos(orphaned_at)
      WHERE orphaned_at IS NOT NULL;

  END IF;
END $$;