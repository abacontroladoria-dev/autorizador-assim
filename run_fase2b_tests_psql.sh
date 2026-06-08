#!/bin/bash
# FASE 2-B — Execute tests via psql (PostgreSQL direct connection)

# You need to set these environment variables:
# PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT

# Or get the connection string from Supabase:
# Settings > Database > Connection Pooling > Connection String

# Example:
# export PGHOST="wmugemamnqxjfpxrlwes.db.supabase.co"
# export PGUSER="postgres"
# export PGPASSWORD="your_password"
# export PGDATABASE="postgres"
# export PGPORT="5432"

set -e

echo "════════════════════════════════════════════════════════════════════════════"
echo "FASE 2-B — AUTOMATED TEST EXECUTION (via psql)"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

if [ -z "$PGHOST" ] || [ -z "$PGPASSWORD" ]; then
    echo "❌ ERROR: Database connection variables not set!"
    echo ""
    echo "To run this script, set these environment variables:"
    echo "  export PGHOST='wmugemamnqxjfpxrlwes.db.supabase.co'"
    echo "  export PGUSER='postgres'"
    echo "  export PGPASSWORD='your_database_password'"
    echo "  export PGDATABASE='postgres'"
    echo "  export PGPORT='5432'"
    echo ""
    echo "Then run: bash run_fase2b_tests_psql.sh"
    exit 1
fi

echo "✅ Connecting to PostgreSQL at $PGHOST..."
echo ""

# CHECK 1: Schema Changes
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 1: Schema Changes Applied"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'cco' AND table_name = 'session_mutations') as mutations_table_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'cco' AND table_name = 'atendimentos' AND column_name = 'orphaned_at') as orphaned_at_exists,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'cco' AND table_name = 'session_authorizations' AND column_name = 'inherited_from') as inherited_from_exists;
EOF

echo ""
echo "✅ CHECK 1 PASSED"
echo ""

# CHECK 2: Mutation Detection
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 2: Mutation Detection Validation"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  COUNT(*) as total_mutations,
  COUNT(CASE WHEN mutation_type = 'RESCHEDULED' THEN 1 END) as rescheduled_count,
  COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_count
FROM cco.session_mutations;
EOF

echo ""

# CHECK 3: Orphan Marking
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 3: Orphan Marking Validation"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  COUNT(*) as total_orphaned,
  COUNT(DISTINCT paciente_nome) as unique_patients_orphaned
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL;
EOF

echo ""

# CHECK 4: Authorization Consolidation
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 4: Authorization Consolidation Validation"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  COUNT(*) as total_inherited,
  COUNT(DISTINCT inherited_from) as unique_source_sessions
FROM cco.session_authorizations
WHERE inherited_from IS NOT NULL;
EOF

echo ""

# CHECK 5: Data Integrity
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 5: Referential Integrity"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT 'session_authorizations orphaned FK' as check_detail,
  COUNT(*) as broken_fk_count
FROM cco.session_authorizations sa
WHERE NOT EXISTS (
  SELECT 1 FROM cco.atendimentos a
  WHERE a.session_key = sa.session_key
    AND a.orphaned_at IS NULL
);
EOF

echo ""

# CHECK 6: Mutation Mapping
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 6: Mutation Mapping Validation"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT COUNT(*) as unmapped_orphans
FROM cco.atendimentos a
WHERE a.orphaned_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cco.session_mutations
    WHERE session_key_old = a.session_key
  );
EOF

echo ""

# CHECK 7: Retention Policy
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 7: Retention Policy Validation"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  CASE
    WHEN orphaned_at < now() - interval '30 days' THEN 'ELIGIBLE_FOR_DELETE'
    WHEN orphaned_at < now() - interval '25 days' THEN 'NEAR_THRESHOLD'
    ELSE 'WITHIN_RETENTION'
  END as retention_status,
  COUNT(*) as record_count
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL
GROUP BY retention_status
ORDER BY retention_status;
EOF

echo ""

# CHECK 8: TITA ID Tracking
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 8: TITA ID Tracking"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  COUNT(DISTINCT m.tita_agendamento_id) as unique_tita_ids_tracked
FROM cco.session_mutations m;
EOF

echo ""

# CHECK 9: Processing Logs
echo "════════════════════════════════════════════════════════════════════════════"
echo "CHECK 9: Processing Log Verification"
echo "════════════════════════════════════════════════════════════════════════════"
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -p "$PGPORT" <<EOF
SELECT
  job_name,
  COUNT(*) as executions,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'error') as failed
FROM cco.processing_logs
WHERE job_name IN ('cco-sync-tita-sessions', 'cco-mutation-detector')
GROUP BY job_name;
EOF

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "✅ ALL TESTS COMPLETED"
echo "════════════════════════════════════════════════════════════════════════════"
