#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test R2 (SESSAO_SEM_AUTORIZACAO) detection scenarios."""

import json
import requests
import time
import sys
import os
import subprocess
from datetime import datetime

if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    import io

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

def query_table(table_name, query_params=None):
    """Query data from Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    params = query_params or {}
    response = requests.get(url, headers=headers, params=params)
    return response.json() if response.status_code == 200 else []

def upsert_table(table_name, data):
    """Upsert data into Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    response = requests.post(url, json=data, headers=headers)
    return response.json() if response.status_code in [200, 201] else None

def invoke_engine():
    """Invoke the CCO conciliation engine."""
    url = f"{SUPABASE_URL}/functions/v1/cco-conciliation-engine"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json={}, timeout=60)
        return response.json()
    except Exception as e:
        print(f"    Error invoking engine: {e}")
        return {"ok": False, "error": str(e)}

print("\n" + "="*80)
print("TEST SCENARIO 1: Existing session without authorization")
print("="*80)

# Create a test session without authorization
test_session_key_1 = "test_r2_cenario_1_sem_auth"
print(f"\n[1] Creating atendimento without authorization: {test_session_key_1}")
upsert_table("cco.atendimentos", {
    "session_key": test_session_key_1,
    "data_sessao": "2026-06-08",
    "paciente_nome": "Teste Cenario 1",
    "terapia": "Psicoterapia",
    "status_agendamento": "Agendado",
    "terapeuta_id": 1,
})

# Run engine
print("[2] Running engine to detect R2...")
response = invoke_engine()
print(f"    Engine status: {response.get('ok', 'error')}")
print(f"    Candidates detected: {response.get('candidates_detected')}")
print(f"    Occurrences generated: {response.get('occurrences_generated')}")

# Check if R2 occurrence was created for test_session_1
print("[3] Verifying R2 occurrence created...")
occ_result = query_table("cco.occurrences", {
    "session_key": f"eq.{test_session_key_1}",
    "tipo": "eq.SESSAO_SEM_AUTORIZACAO"
})

if occ_result:
    occurrence = occ_result[0]
    print(f"    [PASS] R2 occurrence found!")
    print(f"    ID: {occurrence['id']}")
    print(f"    Tipo: {occurrence['tipo']}")
    print(f"    Severity: {occurrence['severity']}")
    print(f"    Resolved: {occurrence['resolved_at'] is not None}")
    occurrence_id_1 = occurrence['id']
else:
    print(f"    [FAIL] R2 occurrence NOT found for {test_session_key_1}")
    occurrence_id_1 = None

print("\n" + "="*80)
print("TEST SCENARIO 2: Authorization created after R2 occurrence")
print("="*80)

# Create another test session without authorization
test_session_key_2 = "test_r2_cenario_2_depois_auth"
print(f"\n[1] Creating atendimento without authorization: {test_session_key_2}")
upsert_table("cco.atendimentos", {
    "session_key": test_session_key_2,
    "data_sessao": "2026-06-08",
    "paciente_nome": "Teste Cenario 2",
    "terapia": "Psicoterapia",
    "status_agendamento": "Agendado",
    "terapeuta_id": 2,
})

# Run engine
print("[2] Running engine (first pass without authorization)...")
response = invoke_engine()
print(f"    Candidates detected: {response.get('candidates_detected')}")
print(f"    Occurrences generated: {response.get('occurrences_generated')}")

# Check if R2 occurrence was created
occ_result = query_table("cco.occurrences", {
    "session_key": f"eq.{test_session_key_2}",
    "tipo": "eq.SESSAO_SEM_AUTORIZACAO"
})

occurrence_id_2 = None
if occ_result:
    occurrence = occ_result[0]
    print(f"[3] R2 occurrence created for test session 2")
    print(f"    ID: {occurrence['id']}")
    print(f"    Resolved: {occurrence['resolved_at'] is not None}")
    occurrence_id_2 = occurrence['id']

# Now add authorization for session 2
print(f"\n[4] Adding authorization for {test_session_key_2}...")
upsert_table("cco.session_authorizations", {
    "session_key": test_session_key_2,
    "source": "assim",
    "authorization_status": "LIBERADA",
})

# Run engine again
print("[5] Running engine (second pass with authorization)...")
response = invoke_engine()
print(f"    Candidates detected: {response.get('candidates_detected')}")
print(f"    Occurrences generated: {response.get('occurrences_generated')}")

# Check if occurrence was auto-resolved
if occurrence_id_2:
    occ_result = query_table("cco.occurrences", {
        "id": f"eq.{occurrence_id_2}"
    })

    if occ_result:
        occurrence = occ_result[0]
        is_resolved = occurrence['resolved_at'] is not None
        print(f"\n[6] Checking if occurrence was auto-resolved...")
        print(f"    Resolved: {is_resolved}")
        if is_resolved:
            print(f"    [PASS] Occurrence auto-resolved!")
            print(f"    Resolved at: {occurrence['resolved_at']}")
            print(f"    Resolved by: {occurrence['resolved_by']}")
        else:
            print(f"    [FAIL] Occurrence was NOT auto-resolved")

print("\n" + "="*80)
print("SUMMARY")
print("="*80)
print("\nTest Results:")
print(f"  Scenario 1 - Session without auth: {'PASS' if occurrence_id_1 else 'FAIL'}")
print(f"  Scenario 2 - Auto-resolution: Check above")
print("\n" + "="*80 + "\n")
