#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check if test data exists in CCO tables"""

import requests
import json
import sys
import os

if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

headers = {
    "Authorization": "Bearer {}".format(SERVICE_ROLE_KEY),
    "apikey": SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
}

# SQL queries to run
queries = {
    "sessions": """
        SELECT COUNT(*) as count FROM cco.atendimentos
        WHERE session_key LIKE 'test_%'
    """,
    "mutations": """
        SELECT COUNT(*) as count FROM cco.session_mutations
        WHERE session_key_old LIKE 'test_%'
    """,
    "authorizations": """
        SELECT COUNT(*) as count FROM cco.session_authorizations
        WHERE session_key LIKE 'test_%'
    """,
    "substitutions": """
        SELECT COUNT(*) as count FROM cco.session_substitutions
        WHERE session_key LIKE 'test_%'
    """,
}

print("=" * 70)
print("CHECKING TEST DATA IN CCO SCHEMA")
print("=" * 70 + "\n")

for label, query in queries.items():
    # Try to execute query via RPC or direct SQL
    # For now, try querying the table directly with count
    table_map = {
        "sessions": "cco.atendimentos",
        "mutations": "cco.session_mutations",
        "authorizations": "cco.session_authorizations",
        "substitutions": "cco.session_substitutions",
    }

    table = table_map[label]
    url = f"{SUPABASE_URL}/rest/v1/{table}"

    try:
        # Add filter for test_ prefix
        if "atendimentos" in table:
            filter_col = "session_key"
        elif "mutations" in table:
            filter_col = "session_key_old"
        else:
            filter_col = "session_key"

        params = {
            "select": "id",
            f"{filter_col}": "like.test_%"
        }

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            count = len(data) if isinstance(data, list) else 0
            print("[OK] {}: {} records found".format(label.upper(), count))
        else:
            print("[ERROR] {}: HTTP {}".format(label.upper(), response.status_code))
            if response.text:
                print("   Error: {}".format(response.text[:200]))

    except Exception as e:
        print("[ERROR] {}: {}".format(label.upper(), str(e)[:100]))

print("\n" + "=" * 70)
print("If all counts are > 0, the test data was properly inserted.")
print("=" * 70)
