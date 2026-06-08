#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test engine detection speed — measure time per table query
"""

import requests
import time
import json

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

def test_table_access(table_name, select_clause, filters=None):
    """Test access to a table"""
    # WRONG: use /rest/v1/{schema}.{table}
    # This will fail 404
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"

    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }

    params = {"select": select_clause, "limit": "1"}

    print(f"\nTesting: {table_name}")
    print(f"URL: {url}")

    start = time.time()
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        elapsed = time.time() - start

        print(f"Status: {response.status_code} ({elapsed:.2f}s)")
        if response.status_code != 200:
            print(f"Error: {response.json().get('message')}")
            return None

        data = response.json()
        print(f"Success: {len(data)} rows")
        return data
    except requests.Timeout:
        print(f"TIMEOUT after 10s")
        return None
    except Exception as e:
        print(f"Exception: {e}")
        return None

# Test each table
print("=" * 80)
print("Testing REST API access to CCO tables")
print("=" * 80)

tables = [
    ("cco.atendimentos", "count", "FAIL - wrong schema syntax"),
    ("cco.session_authorizations", "session_key", "FAIL - wrong schema syntax"),
    ("cco.occurrences", "id", "FAIL - wrong schema syntax"),
    ("public.autorizacoes_assim", "id", "OK - public schema"),
]

for table, select, note in tables:
    result = test_table_access(table, select)
    print(f"Note: {note}")
