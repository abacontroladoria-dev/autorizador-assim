#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FASE 2-B & 3 — Complete Flow Test
Executa o fluxo completo:
1. Invocar 4 jobs de sincronização
2. Invocar motor de conciliação
3. Validar dados e ocorrências
"""

import json
import requests
import time
import sys
import os
from datetime import datetime

if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

class Colors:
    RESET = '\033[0m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    CYAN = '\033[36m'
    BOLD = '\033[1m'

def log(color, text):
    print(f"{color}{text}{Colors.RESET}")

def header(text):
    print("\n" + "=" * 80)
    log(Colors.BOLD + Colors.CYAN, text)
    print("=" * 80 + "\n")

def success(text):
    log(Colors.GREEN + Colors.BOLD, f"✅ {text}")

def warning(text):
    log(Colors.YELLOW + Colors.BOLD, f"⚠️  {text}")

def error(text):
    log(Colors.RED + Colors.BOLD, f"❌ {text}")

def info(text):
    log(Colors.BLUE, f"ℹ️  {text}")

def invoke_function(function_name, payload=None, timeout=60):
    """Invoke an Edge Function and return the result"""
    url = f"{SUPABASE_URL}/functions/v1/{function_name}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload or {},
            timeout=timeout
        )

        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"HTTP {response.status_code}", "details": response.text}
    except Exception as e:
        return {"error": str(e)}

def query_table(table_name, select="*", limit=None):
    """Query Supabase REST API"""
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }

    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {"select": select}

    if limit:
        params["limit"] = limit

    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            return []
    except:
        return []

def run_complete_test():
    """Execute complete test flow"""

    header("FASE 2-B & 3 — COMPLETE FLOW TEST")
    start_time = datetime.now()

    results = {
        "start_time": start_time.isoformat(),
        "jobs": {},
        "engine": {},
        "validation": {}
    }

    # ========================================================================
    # PHASE 1: Run Sync Jobs
    # ========================================================================

    header("PHASE 1: Running Sync Jobs")

    jobs = [
        ("cco-sync-tita-sessions", "TITA Sessions"),
        ("cco-sync-assim-authorizations", "ASSIM Authorizations"),
        ("cco-sync-authorization-queue", "Authorization Queue"),
        ("cco-sync-therapist-control", "Therapist Control"),
    ]

    for job_name, display_name in jobs:
        info(f"Invoking {display_name}...")
        # Job 1 needs more time for TITA API calls
        timeout = 60 if "tita" in job_name.lower() else 30
        result = invoke_function(job_name, timeout=timeout)

        if "error" in result:
            error(f"{display_name} failed: {result.get('error')}")
            results["jobs"][job_name] = {"status": "FAILED", "error": result["error"]}
        else:
            success(f"{display_name}: {result.get('rows_processed', 0)} rows")
            results["jobs"][job_name] = {
                "status": "SUCCESS",
                "rows_processed": result.get("rows_processed"),
                "response": result
            }

        time.sleep(1)  # Small delay between jobs

    # ========================================================================
    # PHASE 2: Run Conciliation Engine
    # ========================================================================

    header("PHASE 2: Running Conciliation Engine")

    info("Invoking motor de conciliação...")
    engine_result = invoke_function("cco-conciliation-engine", timeout=60)

    if "error" in engine_result:
        error(f"Engine failed: {engine_result.get('error')}")
        results["engine"]["status"] = "FAILED"
    else:
        success(f"Engine completed")
        results["engine"]["status"] = "SUCCESS"
        results["engine"]["response"] = engine_result

    time.sleep(2)

    # ========================================================================
    # PHASE 3: Validation
    # ========================================================================

    header("PHASE 3: Data Validation")

    # Count sessions
    sessions = query_table("cco.atendimentos", "count", limit=1000)
    active_sessions = [s for s in sessions if s.get("orphaned_at") is None] if isinstance(sessions, list) else []

    info(f"Total sessions: {len(sessions)}")
    info(f"Active sessions: {len(active_sessions)}")

    results["validation"]["sessions"] = {
        "total": len(sessions),
        "active": len(active_sessions),
        "orphaned": len(sessions) - len(active_sessions)
    }

    # Count mutations
    mutations = query_table("cco.session_mutations", "count", limit=1000)
    info(f"Mutations detected: {len(mutations)}")
    results["validation"]["mutations"] = len(mutations)

    # Count authorizations
    authorizations = query_table("cco.session_authorizations", "count", limit=1000)
    info(f"Authorizations synced: {len(authorizations)}")
    results["validation"]["authorizations"] = len(authorizations)

    # Count occurrences (the key metric!)
    occurrences = query_table("cco.occurrences", "id,tipo,severity,resolved_at", limit=1000)
    active_occurrences = [o for o in occurrences if o.get("resolved_at") is None] if isinstance(occurrences, list) else []
    info(f"Occurrences generated: {len(occurrences)}")
    info(f"Active occurrences: {len(active_occurrences)}")
    results["validation"]["occurrences"] = {
        "total": len(occurrences),
        "active": len(active_occurrences)
    }

    # Breakdown by type
    if occurrences and isinstance(occurrences, list):
        tipo_counts = {}
        for occ in occurrences:
            tipo = occ.get("tipo", "UNKNOWN")
            tipo_counts[tipo] = tipo_counts.get(tipo, 0) + 1

        info("\nOccurrence Types:")
        for tipo, count in sorted(tipo_counts.items()):
            print(f"  • {tipo}: {count}")

        results["validation"]["occurrences_by_type"] = tipo_counts

    # Check dashboard snapshot
    dashboard = query_table("cco.dashboard_snapshot", "*", limit=1)
    if dashboard and len(dashboard) > 0:
        snap = dashboard[0]
        success(f"Dashboard snapshot exists for {snap.get('data_ref')}")
        results["validation"]["dashboard"] = {
            "autorizacoes_pendentes": snap.get("autorizacoes_pendentes"),
            "sessoes_sem_autorizacao": snap.get("sessoes_sem_autorizacao"),
            "evolucoes_atrasadas": snap.get("evolucoes_atrasadas"),
            "faltas_terapeuta": snap.get("faltas_terapeuta"),
            "substituicoes": snap.get("substituicoes"),
            "faltas_paciente": snap.get("faltas_paciente"),
            "glosas": snap.get("glosas"),
            "receita_em_risco_count": snap.get("receita_em_risco_count")
        }
    else:
        warning("Dashboard snapshot not found")

    # ========================================================================
    # SUMMARY
    # ========================================================================

    header("TEST RESULTS SUMMARY")

    jobs_passed = sum(1 for j in results["jobs"].values() if j.get("status") == "SUCCESS")

    print(f"\n{Colors.BOLD}Jobs:{Colors.RESET}")
    print(f"  Completed: {jobs_passed}/{len(jobs)}")

    print(f"\n{Colors.BOLD}Data:{Colors.RESET}")
    print(f"  Sessions: {results['validation']['sessions']['total']}")
    print(f"  Active: {results['validation']['sessions']['active']}")
    print(f"  Mutations: {results['validation']['mutations']}")
    print(f"  Authorizations: {results['validation']['authorizations']}")

    print(f"\n{Colors.BOLD}Occurrences:{Colors.RESET}")
    occ_summary = results['validation']['occurrences']
    print(f"  Generated: {occ_summary['total']}")
    print(f"  Active: {occ_summary['active']}")

    if "occurrences_by_type" in results['validation']:
        print(f"\n{Colors.BOLD}Occurrence Breakdown:{Colors.RESET}")
        for tipo, count in sorted(results['validation']['occurrences_by_type'].items()):
            print(f"  • {tipo}: {count}")

    # Final verdict
    print(f"\n{Colors.BOLD}Final Verdict:{Colors.RESET}")
    if jobs_passed == len(jobs) and occ_summary['total'] > 0:
        success("Complete flow works! Data materialized and occurrences detected. ✨")
        results["status"] = "SUCCESS"
    elif jobs_passed == len(jobs):
        warning("Jobs completed but no occurrences detected (may need real TITA data)")
        results["status"] = "PARTIAL"
    else:
        error("Some jobs failed")
        results["status"] = "FAILED"

    results["end_time"] = datetime.now().isoformat()

    # Save results to JSON
    with open("test_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    info(f"\nDetailed results saved to test_results.json")

    return 0 if results["status"] == "SUCCESS" else 1

if __name__ == "__main__":
    exit_code = run_complete_test()
    sys.exit(exit_code)
