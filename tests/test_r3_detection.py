#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test R3 (EVOLUCAO_ATRASADA) detection."""

import json
import requests
import sys
import os

if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

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
        print(f"Error invoking engine: {e}")
        return {"ok": False, "error": str(e)}

def query_occurrences(tipo):
    """Query occurrences by type."""
    url = f"{SUPABASE_URL}/rest/v1/cco.occurrences"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    params = {"tipo": f"eq.{tipo}"}

    response = requests.get(url, headers=headers, params=params)
    return response.json() if response.status_code == 200 else []

print("\n" + "="*80)
print("R3 DETECTION TEST - EVOLUCAO_ATRASADA")
print("="*80)

# Run engine
print("\n[1] Running engine to detect R3...")
response = invoke_engine()
print(f"    Engine status: {response.get('ok', 'error')}")
print(f"    Candidates detected: {response.get('candidates_detected')}")
print(f"    Occurrences generated: {response.get('occurrences_generated')}")

if response.get('engine_logs'):
    print("\n[2] Engine logs (R3 section):")
    for log in response['engine_logs']:
        if 'R3' in log or 'EVOLUCAO' in log:
            print(f"    {log}")

# Query R3 occurrences
print("\n[3] Verifying R3 occurrences in database...")
r3_occurrences = query_occurrences("EVOLUCAO_ATRASADA")
print(f"    Total R3 occurrences found: {len(r3_occurrences)}")

if r3_occurrences:
    print("\n[4] Sample R3 occurrences:")
    for occ in r3_occurrences[:5]:
        print(f"    - {occ['session_key'][:20]}... | Severity: {occ['severity']} | Created: {occ['created_at']}")

    # Count by severity
    severity_count = {}
    for occ in r3_occurrences:
        severity = occ['severity']
        severity_count[severity] = severity_count.get(severity, 0) + 1

    print(f"\n[5] Count by severity:")
    for severity, count in severity_count.items():
        print(f"    {severity}: {count}")

print("\n[6] Dashboard check:")
url = f"{SUPABASE_URL}/rest/v1/cco.dashboard_snapshot"
headers = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}
response = requests.get(url, headers=headers)
if response.status_code == 200:
    dashboard = response.json()
    if dashboard:
        snap = dashboard[0]
        print(f"    Total occurrences: {snap.get('total_occurrences_count')}")
        print(f"    Total occurrences unresolved: {snap.get('total_occurrences_unresolved_count')}")
        if 'sessoes_com_evolucao_atrasada' in snap:
            print(f"    Evolucao atrasada count: {snap.get('sessoes_com_evolucao_atrasada')}")

print("\n" + "="*80)
print(f"RESULT: {len(r3_occurrences)} R3 (EVOLUCAO_ATRASADA) occurrences materialized")
print("="*80 + "\n")
