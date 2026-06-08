#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Debug the actual schema and data."""

import json
import requests

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

def query_table(table_name):
    """Query data from Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Prefer": "return=representation"
    }

    response = requests.get(url, headers=headers, params={"limit": "1"})
    print(f"Querying {table_name}:")
    print(f"  Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  Rows: {len(data)}")
        if data:
            print(f"  Columns: {list(data[0].keys())}")
    else:
        print(f"  Error: {response.text}")
    print()

# Try different table name variations
print("="*80)
print("CHECKING TABLE NAMES")
print("="*80 + "\n")

query_table("cco.occurrences")
query_table("occurrences")
query_table("public.occurrences")

# Check atendimentos to verify schema works
print("Checking atendimentos (reference):")
url = f"{SUPABASE_URL}/rest/v1/cco.atendimentos"
headers = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}
response = requests.get(url, headers=headers, params={"limit": "1"})
data = response.json()
if isinstance(data, list) and len(data) > 0:
    print(f"  Columns in cco.atendimentos: {list(data[0].keys())}")
else:
    print(f"  Response: {data}")
