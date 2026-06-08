# ============================================================================
# FASE 2-B — Test Execution Script
# ============================================================================
# Purpose: Run comprehensive tests for Session Mutation Handling (Fase 2-B)
# Usage: .\run-fase2b-tests.ps1
#
# Prerequisites:
# - Supabase CLI installed (supabase --version)
# - Correct project selected (supabase projects list)
# - .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
# ============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# Color definitions
$ColorSuccess = 'Green'
$ColorError = 'Red'
$ColorWarning = 'Yellow'
$ColorInfo = 'Cyan'

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor $ColorInfo
Write-Host "║  FASE 2-B — Session Mutation Handling — Test Suite            ║" -ForegroundColor $ColorInfo
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor $ColorInfo
Write-Host ""
Write-Host "Status: Starting test execution..." -ForegroundColor $ColorInfo
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor $ColorInfo
Write-Host ""

# ============================================================================
# STEP 1: Pre-flight checks
# ============================================================================

Write-Host "STEP 1: Pre-flight Verification" -ForegroundColor $ColorInfo
Write-Host "─────────────────────────────────────────" -ForegroundColor $ColorInfo

# Check Supabase CLI
$supabaseVersion = supabase --version 2>&1
if ($supabaseVersion -match 'version') {
    Write-Host "✅ Supabase CLI: $supabaseVersion" -ForegroundColor $ColorSuccess
} else {
    Write-Host "❌ Supabase CLI not found. Install: npm install -g @supabase/cli" -ForegroundColor $ColorError
    exit 1
}

# Check environment file
$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    Write-Host "⚠️  .env file not found. Attempting to detect from supabase.json..." -ForegroundColor $ColorWarning
}

# Load environment variables
if (Test-Path $envFile) {
    Write-Host "📄 Loading environment from: $envFile" -ForegroundColor $ColorInfo
    Get-Content $envFile | Where-Object { $_ -match '^\s*[^#]' } | ForEach-Object {
        $parts = $_ -split '='
        if ($parts.Count -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            [Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

# Check Supabase connection
$supabaseUrl = $env:SUPABASE_URL
$supabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY

if ([string]::IsNullOrEmpty($supabaseUrl)) {
    Write-Host "❌ SUPABASE_URL not set. Set in .env.local or environment." -ForegroundColor $ColorError
    exit 1
} else {
    Write-Host "✅ Supabase URL: $($supabaseUrl.Substring(0, 30))..." -ForegroundColor $ColorSuccess
}

if ([string]::IsNullOrEmpty($supabaseKey)) {
    Write-Host "❌ SUPABASE_SERVICE_ROLE_KEY not set. Set in .env.local or environment." -ForegroundColor $ColorError
    exit 1
} else {
    Write-Host "✅ Service role key detected" -ForegroundColor $ColorSuccess
}

Write-Host ""

# ============================================================================
# STEP 2: Define Test Suite
# ============================================================================

$tests = @(
    @{
        Name = "CHECK_1: Schema Validation"
        Description = "Verify all schema changes applied"
        Query = @"
SELECT 'mutations_table' as check_name,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'cco' AND table_name = 'session_mutations') as result UNION ALL
SELECT 'orphaned_at_column',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'cco' AND table_name = 'atendimentos' AND column_name = 'orphaned_at') UNION ALL
SELECT 'inherited_from_column',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'cco' AND table_name = 'session_authorizations' AND column_name = 'inherited_from')
"@
        AcceptanceCriteria = "All three checks must return TRUE"
    },
    @{
        Name = "CHECK_2: Mutation Detection"
        Description = "Verify mutations are detected and processed"
        Query = @"
SELECT
  COUNT(*) as total_mutations,
  COUNT(CASE WHEN mutation_type = 'RESCHEDULED' THEN 1 END) as rescheduled_count,
  COUNT(CASE WHEN processed_at IS NOT NULL THEN 1 END) as processed_count
FROM cco.session_mutations
LIMIT 1
"@
        AcceptanceCriteria = "processed_count must equal total_mutations"
    },
    @{
        Name = "CHECK_3: Orphan Marking"
        Description = "Verify orphaned sessions are marked"
        Query = @"
SELECT
  COUNT(*) as total_orphaned,
  COUNT(DISTINCT paciente_nome) as unique_patients_orphaned
FROM cco.atendimentos
WHERE orphaned_at IS NOT NULL
LIMIT 1
"@
        AcceptanceCriteria = "Results show orphaned records are being marked"
    },
    @{
        Name = "CHECK_4: Authorization Consolidation"
        Description = "Verify authorizations are inherited"
        Query = @"
SELECT
  COUNT(*) as total_inherited,
  COUNT(DISTINCT inherited_from) as unique_sources
FROM cco.session_authorizations
WHERE inherited_from IS NOT NULL
LIMIT 1
"@
        AcceptanceCriteria = "inherited_from column has data when mutations exist"
    },
    @{
        Name = "CHECK_5: Referential Integrity"
        Description = "Verify no broken foreign keys"
        Query = @"
SELECT 'session_authorizations',
  COUNT(*) as broken_fk_count
FROM cco.session_authorizations sa
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = sa.session_key AND a.orphaned_at IS NULL)
UNION ALL
SELECT 'session_substitutions',
  COUNT(*) as broken_fk_count
FROM cco.session_substitutions ss
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = ss.session_key AND a.orphaned_at IS NULL)
UNION ALL
SELECT 'occurrences',
  COUNT(*) as broken_fk_count
FROM cco.occurrences occ
WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = occ.session_key AND a.orphaned_at IS NULL)
"@
        AcceptanceCriteria = "All three broken_fk_count values must be 0"
    },
    @{
        Name = "CHECK_6: Mutation Mapping"
        Description = "Verify orphans have corresponding mutations"
        Query = @"
SELECT COUNT(*) as unmapped_orphans
FROM cco.atendimentos a
WHERE a.orphaned_at IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM cco.session_mutations WHERE session_key_old = a.session_key)
"@
        AcceptanceCriteria = "unmapped_orphans must be 0"
    },
    @{
        Name = "CHECK_7: Retention Policy"
        Description = "Verify 30-day retention tracking"
        Query = @"
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
"@
        AcceptanceCriteria = "Most records in WITHIN_RETENTION; cron scheduled"
    },
    @{
        Name = "CHECK_8: TITA ID Tracking"
        Description = "Verify TITA ID links mutations"
        Query = @"
SELECT
  COUNT(DISTINCT tita_agendamento_id) as unique_tita_ids,
  COUNT(DISTINCT tita_agendamento_id) FILTER (WHERE tita_agendamento_id IS NOT NULL) as non_null_ids
FROM cco.session_mutations
"@
        AcceptanceCriteria = "TITA IDs tracked in mutations table"
    },
    @{
        Name = "CHECK_9: Processing Logs"
        Description = "Verify sync jobs are executing"
        Query = @"
SELECT
  job_name,
  COUNT(*) as executions,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  MAX(finished_at) as last_execution
FROM cco.processing_logs
WHERE job_name IN ('cco-sync-tita-sessions', 'cco-mutation-detector')
GROUP BY job_name
"@
        AcceptanceCriteria = "Recent executions with success count > 0"
    }
)

# ============================================================================
# STEP 3: Execute Tests
# ============================================================================

Write-Host "STEP 2: Running Test Suite" -ForegroundColor $ColorInfo
Write-Host "─────────────────────────────────────────" -ForegroundColor $ColorInfo
Write-Host ""

$results = @()
$testNumber = 1

foreach ($test in $tests) {
    Write-Host "[$testNumber/9] $($test.Name)" -ForegroundColor $ColorInfo
    Write-Host "    Description: $($test.Description)" -ForegroundColor Gray
    Write-Host "    Query: $($test.Query.Substring(0, 50))..." -ForegroundColor Gray
    Write-Host "    Expected: $($test.AcceptanceCriteria)" -ForegroundColor Gray

    # Create temporary query file
    $tempQuery = New-TemporaryFile -Suffix '.sql'
    Set-Content -Path $tempQuery.FullName -Value $test.Query

    # Execute query via psql
    # Note: This requires psql to be in PATH or full path specified

    # Alternative: Use SQL Editor copy-paste method
    Write-Host "    📋 Copy this query to Supabase SQL Editor and execute:" -ForegroundColor $ColorWarning
    Write-Host ""
    Write-Host $test.Query -ForegroundColor Gray
    Write-Host ""

    # Add to results
    $results += @{
        TestName = $test.Name
        Description = $test.Description
        Criteria = $test.AcceptanceCriteria
        Status = "MANUAL"
    }

    $testNumber++
    Write-Host ""
}

# ============================================================================
# STEP 4: Summary Report
# ============================================================================

Write-Host "STEP 3: Test Summary" -ForegroundColor $ColorInfo
Write-Host "─────────────────────────────────────────" -ForegroundColor $ColorInfo
Write-Host ""

Write-Host "Total Tests: 9" -ForegroundColor $ColorInfo
Write-Host "Status: MANUAL EXECUTION REQUIRED" -ForegroundColor $ColorWarning
Write-Host ""

Write-Host "📋 Test Results Summary:" -ForegroundColor $ColorInfo
Write-Host ""

$results | ForEach-Object {
    Write-Host "[$($_.TestName)]" -ForegroundColor Gray
    Write-Host "  Status: $($_.Status)" -ForegroundColor $ColorWarning
    Write-Host "  Expected: $($_.Criteria)" -ForegroundColor Gray
    Write-Host ""
}

# ============================================================================
# STEP 5: Manual Testing Instructions
# ============================================================================

Write-Host "🔧 MANUAL TESTING INSTRUCTIONS" -ForegroundColor $ColorInfo
Write-Host "─────────────────────────────────────────" -ForegroundColor $ColorInfo
Write-Host ""

Write-Host "1️⃣  Open Supabase Dashboard" -ForegroundColor $ColorInfo
Write-Host "   URL: $supabaseUrl" -ForegroundColor Gray
Write-Host ""

Write-Host "2️⃣  Go to SQL Editor" -ForegroundColor $ColorInfo
Write-Host "   Path: Project → SQL Editor" -ForegroundColor Gray
Write-Host ""

Write-Host "3️⃣  For each query above:" -ForegroundColor $ColorInfo
Write-Host "   a) Copy the query block" -ForegroundColor Gray
Write-Host "   b) Paste into SQL Editor" -ForegroundColor Gray
Write-Host "   c) Click 'Run' button" -ForegroundColor Gray
Write-Host "   d) Compare results to expected criteria" -ForegroundColor Gray
Write-Host "   e) Record PASS/FAIL status" -ForegroundColor Gray
Write-Host ""

Write-Host "4️⃣  Document results in:" -ForegroundColor $ColorInfo
Write-Host "   File: FASE2B_TEST_EXECUTION.md" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# STEP 6: Generate Test Report
# ============================================================================

$reportFile = "FASE2B_TEST_REPORT_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

$reportContent = @"
╔════════════════════════════════════════════════════════════════╗
║  FASE 2-B — Test Execution Report                            ║
╚════════════════════════════════════════════════════════════════╝

Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Tester: [Your Name]
Environment: [Staging/Production]
Database: $supabaseUrl

════════════════════════════════════════════════════════════════

TESTS TO EXECUTE (9 Total)

$($tests | ForEach-Object { "- $($_.Name)`n" })

════════════════════════════════════════════════════════════════

INSTRUCTIONS:

1. For each test query above, copy to Supabase SQL Editor
2. Execute the query
3. Compare results to acceptance criteria
4. Mark PASS or FAIL below
5. Document any anomalies

════════════════════════════════════════════════════════════════

TEST RESULTS:

[ ] CHECK_1: Schema Validation
[ ] CHECK_2: Mutation Detection
[ ] CHECK_3: Orphan Marking
[ ] CHECK_4: Authorization Consolidation
[ ] CHECK_5: Referential Integrity
[ ] CHECK_6: Mutation Mapping
[ ] CHECK_7: Retention Policy
[ ] CHECK_8: TITA ID Tracking
[ ] CHECK_9: Processing Logs

════════════════════════════════════════════════════════════════

ISSUES FOUND:

(Document any failed tests or anomalies here)

════════════════════════════════════════════════════════════════

SIGN-OFF:

QA Lead: __________________ Date: __________
Tech Lead: ________________ Date: __________

Overall Status: [ ] PASS [ ] FAIL [ ] CONDITIONAL

════════════════════════════════════════════════════════════════
"@

Set-Content -Path $reportFile -Value $reportContent
Write-Host "📊 Test report template created: $reportFile" -ForegroundColor $ColorSuccess

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor $ColorInfo
Write-Host "✅ Test script complete. Follow manual testing instructions above." -ForegroundColor $ColorSuccess
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor $ColorInfo
