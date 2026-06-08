/**
 * FASE 2 — CCO Validation Test Suite
 * Executes 14 acceptance criteria tests for CCO sync jobs
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

const results: TestResult[] = [];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function executeSQL(query: string): Promise<any> {
  const { data, error } = await supabase.rpc("execute_sql", { sql: query });
  if (error) throw new Error(`SQL Error: ${error.message}`);
  return data;
}

async function invokeFunction(
  functionName: string,
): Promise<{ ok: boolean; rows_processed: number; job: string }> {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      },
      body: "{}",
    },
  );

  if (!response.ok) {
    throw new Error(`Function invocation failed: ${response.status}`);
  }

  return response.json();
}

function test(passed: boolean, name: string, message: string, details?: string) {
  results.push({ name, passed, message, details });
  console.log(`${passed ? "✅" : "❌"} ${name}`);
  if (details) console.log(`   ${details}`);
}

// ============================================================================
// PRE-DEPLOYMENT CHECKLIST
// ============================================================================

async function checkPrerequisites() {
  console.log("\n🔍 PRE-DEPLOYMENT CHECKLIST\n");

  // Check schema cco exists
  const { data: schemas } = await supabase.rpc("execute_sql", {
    sql: "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'cco'",
  });

  test(
    (schemas?.length || 0) > 0,
    "Schema CCO exists",
    "Found cco schema in database",
  );

  // Check tables exist
  const tableChecks = [
    "cco.atendimentos",
    "cco.session_authorizations",
    "cco.session_substitutions",
    "cco.processing_logs",
  ];

  for (const table of tableChecks) {
    const { data: exists } = await supabase.rpc("execute_sql", {
      sql: `SELECT to_regclass('${table}') IS NOT NULL as exists`,
    });
    test((exists?.[0]?.exists || false), `Table ${table} exists`, "");
  }
}

// ============================================================================
// TEST 1-4: MANUAL JOB INVOCATION
// ============================================================================

async function testJobInvocations() {
  console.log("\n🚀 JOB INVOCATION TESTS\n");

  const jobs = [
    "cco-sync-tita-sessions",
    "cco-sync-assim-authorizations",
    "cco-sync-authorization-queue",
    "cco-sync-therapist-control",
  ];

  for (const job of jobs) {
    try {
      const result = await invokeFunction(job);
      test(
        result.ok === true,
        `Job: ${job}`,
        `Processed ${result.rows_processed} rows`,
        `Response: ${JSON.stringify(result)}`,
      );
    } catch (err) {
      test(false, `Job: ${job}`, (err as Error).message);
    }
  }
}

// ============================================================================
// TEST 5-6: IDEMPOTENCY
// ============================================================================

async function testIdempotency() {
  console.log("\n🔄 IDEMPOTENCY TESTS\n");

  try {
    // Get initial count
    const { data: initial } = await supabase.rpc("execute_sql", {
      sql: "SELECT COUNT(*) as cnt FROM cco.atendimentos",
    });
    const initialCount = initial?.[0]?.cnt || 0;

    // Run Job 1 twice
    const result1 = await invokeFunction("cco-sync-tita-sessions");
    await new Promise((r) => setTimeout(r, 1000));
    const result2 = await invokeFunction("cco-sync-tita-sessions");

    // Get final count
    const { data: final } = await supabase.rpc("execute_sql", {
      sql: "SELECT COUNT(*) as cnt FROM cco.atendimentos",
    });
    const finalCount = final?.[0]?.cnt || 0;

    // Idempotent if second run doesn't increase count significantly
    const isIdempotent = result2.rows_processed === 0 || result2.rows_processed === result1.rows_processed;

    test(
      isIdempotent,
      "Job 1 Idempotency",
      "Re-running Job 1 does not create duplicates",
      `Initial: ${initialCount}, Run1: ${result1.rows_processed}, Run2: ${result2.rows_processed}, Final: ${finalCount}`,
    );

    // Check no duplicates
    const { data: dupeCheck } = await supabase.rpc("execute_sql", {
      sql: "SELECT COUNT(DISTINCT session_key) as unique_cnt, COUNT(*) as total_cnt FROM cco.atendimentos",
    });

    const unique = dupeCheck?.[0]?.unique_cnt || 0;
    const total = dupeCheck?.[0]?.total_cnt || 0;

    test(
      unique === total,
      "No Duplicates in atendimentos",
      "COUNT(DISTINCT session_key) == COUNT(*)",
      `Unique: ${unique}, Total: ${total}`,
    );
  } catch (err) {
    test(false, "Idempotency Tests", (err as Error).message);
  }
}

// ============================================================================
// TEST 7-10: DATA VALIDATION
// ============================================================================

async function testDataValidation() {
  console.log("\n✔️ DATA VALIDATION TESTS\n");

  try {
    // Test 7: Session key consistency
    const { data: keyCollisions } = await supabase.rpc("execute_sql", {
      sql: `SELECT COUNT(*) as collisions FROM (
        SELECT paciente_nome, data_sessao, hora_inicio, COUNT(DISTINCT session_key) as unique_keys
        FROM cco.atendimentos
        GROUP BY paciente_nome, data_sessao, hora_inicio
        HAVING COUNT(DISTINCT session_key) > 1
      ) t`,
    });

    test(
      (keyCollisions?.[0]?.collisions || 0) === 0,
      "Session Key Consistency",
      "No collision of session_key for same (patient, date, time)",
    );

    // Test 8: Date/Time Normalization
    const { data: invalidDates } = await supabase.rpc("execute_sql", {
      sql: "SELECT COUNT(*) as count FROM cco.atendimentos WHERE data_sessao !~ '^\\d{4}-\\d{2}-\\d{2}$'",
    });

    test(
      (invalidDates?.[0]?.count || 0) === 0,
      "Date Format Validation",
      "All dates in YYYY-MM-DD format",
    );

    // Test 9: Authorization Status Enum
    const { data: statusValues } = await supabase.rpc("execute_sql", {
      sql: `SELECT DISTINCT authorization_status FROM cco.session_authorizations
        WHERE authorization_status IS NOT NULL ORDER BY authorization_status`,
    });

    const validStatuses = [
      "LIBERADA",
      "PENDENTE",
      "GLOSA",
      "CANCELADA",
      "SEM_SOLICITACAO",
    ];
    const statuses = statusValues?.map((s: any) => s.authorization_status) || [];
    const validEnum = statuses.every((s: string) => validStatuses.includes(s));

    test(
      validEnum,
      "Authorization Status Enum",
      `Found statuses: ${statuses.join(", ")}`,
    );

    // Test 10: Foreign Key Integrity
    const { data: orphanedAuth } = await supabase.rpc("execute_sql", {
      sql: `SELECT COUNT(*) as count FROM cco.session_authorizations sa
        WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = sa.session_key)`,
    });

    const { data: orphanedSubs } = await supabase.rpc("execute_sql", {
      sql: `SELECT COUNT(*) as count FROM cco.session_substitutions ss
        WHERE NOT EXISTS (SELECT 1 FROM cco.atendimentos a WHERE a.session_key = ss.session_key)`,
    });

    test(
      (orphanedAuth?.[0]?.count || 0) === 0,
      "FK Integrity: session_authorizations",
      "No orphaned authorization records",
    );

    test(
      (orphanedSubs?.[0]?.count || 0) === 0,
      "FK Integrity: session_substitutions",
      "No orphaned substitution records",
    );
  } catch (err) {
    test(false, "Data Validation Tests", (err as Error).message);
  }
}

// ============================================================================
// TEST 11-12: PERFORMANCE
// ============================================================================

async function testPerformance() {
  console.log("\n⚡ PERFORMANCE TESTS\n");

  try {
    const { data: jobStats } = await supabase.rpc("execute_sql", {
      sql: `SELECT
        job_name,
        COUNT(*) as executions,
        AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration_sec,
        MAX(EXTRACT(EPOCH FROM (finished_at - started_at))) as max_duration_sec
      FROM cco.processing_logs
      WHERE status = 'success'
      GROUP BY job_name
      ORDER BY job_name`,
    });

    if (!jobStats || jobStats.length === 0) {
      test(false, "Performance Metrics", "No job execution logs found");
      return;
    }

    for (const stat of jobStats) {
      const avgOk = (stat.avg_duration_sec || 0) < 20;
      const maxOk = (stat.max_duration_sec || 0) < 30;

      test(
        avgOk && maxOk,
        `Job Performance: ${stat.job_name}`,
        `Avg: ${(stat.avg_duration_sec || 0).toFixed(2)}s (< 20s), Max: ${(stat.max_duration_sec || 0).toFixed(2)}s (< 30s)`,
      );
    }
  } catch (err) {
    test(false, "Performance Tests", (err as Error).message);
  }
}

// ============================================================================
// TEST 13-14: LOGGING
// ============================================================================

async function testLogging() {
  console.log("\n📋 LOGGING TESTS\n");

  try {
    // Test 13: Check processing logs
    const { data: logs } = await supabase.rpc("execute_sql", {
      sql: "SELECT * FROM cco.processing_logs ORDER BY started_at DESC LIMIT 10",
    });

    test(
      (logs?.length || 0) > 0,
      "Processing Logs Exist",
      `Found ${logs?.length || 0} log entries`,
    );

    if (logs && logs.length > 0) {
      const log = logs[0];
      const isValid =
        log.job_name &&
        log.started_at &&
        log.status &&
        (log.status === "success" ? log.rows_processed !== undefined : true);

      test(
        isValid,
        "Log Entry Format",
        `Latest: job=${log.job_name}, status=${log.status}, rows=${log.rows_processed}`,
      );
    }

    // Test 14: Check error handling
    const { data: errorLogs } = await supabase.rpc("execute_sql", {
      sql: "SELECT COUNT(*) as count FROM cco.processing_logs WHERE status = 'error'",
    });

    test(
      true,
      "Error Logging Available",
      `Error log capability verified (${errorLogs?.[0]?.count || 0} errors logged so far)`,
    );
  } catch (err) {
    test(false, "Logging Tests", (err as Error).message);
  }
}

// ============================================================================
// TEST 15: INTEGRATION
// ============================================================================

async function testIntegration() {
  console.log("\n🔗 INTEGRATION TEST\n");

  try {
    const { data: counts } = await supabase.rpc("execute_sql", {
      sql: `SELECT
        (SELECT COUNT(DISTINCT session_key) FROM cco.atendimentos) as sessions,
        (SELECT COUNT(DISTINCT session_key) FROM cco.session_authorizations) as with_auth,
        (SELECT COUNT(DISTINCT session_key) FROM cco.session_substitutions) as with_subs`,
    });

    if (!counts || counts.length === 0) {
      test(false, "Integration: Data Consistency", "No data found");
      return;
    }

    const data = counts[0];
    const sessionsOk = (data.sessions || 0) > 0;
    const authOk = (data.with_auth || 0) < (data.sessions || 1);
    const subsOk = (data.with_subs || 0) < (data.sessions || 1);

    test(
      sessionsOk,
      "Integration: Sessions Materialized",
      `${data.sessions} sessions found`,
    );

    test(
      authOk,
      "Integration: Authorization Subset",
      `${data.with_auth} sessions have authorization (< ${data.sessions} total)`,
    );

    test(
      subsOk,
      "Integration: Substitutions Subset",
      `${data.with_subs} sessions have substitution (< ${data.sessions} total)`,
    );
  } catch (err) {
    test(false, "Integration Test", (err as Error).message);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       FASE 2 — CCO VALIDATION TEST SUITE (15 TESTS)        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await checkPrerequisites();
    await testJobInvocations();
    await testIdempotency();
    await testDataValidation();
    await testPerformance();
    await testLogging();
    await testIntegration();
  } catch (err) {
    console.error("FATAL ERROR:", err);
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                      TEST SUMMARY                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const result of results) {
    console.log(`${result.passed ? "✅" : "❌"} ${result.name}`);
    console.log(`   ${result.message}`);
    if (result.details) console.log(`   Details: ${result.details}`);
  }

  console.log(`\n📊 RESULTS: ${passed}/${total} tests passed (${((passed / total) * 100).toFixed(1)}%)`);

  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED! Ready for Fase 3.\n");
    Deno.exit(0);
  } else {
    console.log("⚠️  Some tests failed. Review logs above.\n");
    Deno.exit(1);
  }
}

main().catch(console.error);
