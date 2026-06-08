#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check occurrence types and counts."""

import json
import requests

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

def query_table(table_name, select="*"):
    """Query data from Supabase table."""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    params = {"select": select}

    response = requests.get(url, headers=headers, params=params)
    return response.json() if response.status_code == 200 else []

print("\n" + "="*80)
print("OCCURRENCE SUMMARY BY TYPE")
print("="*80 + "\n")

# Get all occurrences
all_occs = query_table("cco.occurrences", "tipo,severity")

# Count by tipo
tipo_count = {}
severity_count = {}

for occ in all_occs:
    tipo = occ['tipo']
    severity = occ['severity']
    tipo_count[tipo] = tipo_count.get(tipo, 0) + 1
    if tipo not in severity_count:
        severity_count[tipo] = {}
    severity_count[tipo][severity] = severity_count[tipo].get(severity, 0) + 1

print("Occurrences by Type:")
for tipo in sorted(tipo_count.keys()):
    count = tipo_count[tipo]
    severities = severity_count[tipo]
    severity_str = ", ".join([f"{s}:{c}" for s, c in sorted(severities.items())])
    print(f"  {tipo}: {count} ({severity_str})")

total = sum(tipo_count.values())
print(f"\nTotal occurrences: {total}")
print("\n" + "="*80 + "\n")
