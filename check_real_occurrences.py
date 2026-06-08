#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Check real occurrences."""

import json
import requests

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

url = f"{SUPABASE_URL}/rest/v1/occurrences"
headers = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}

# Get count
response = requests.get(f"{url}?select=count()", headers=headers)
count_data = response.json()
print(f"Total occurrences: {count_data}")

# Get occurrence types summary
response = requests.get(f"{url}?select=tipo,severity,count", headers=headers)
data = response.json()
print(f"\nOccurrences data: {data}")

# Try with order and limit
response = requests.get(f"{url}?limit=100", headers=headers)
data = response.json()

if isinstance(data, list) and len(data) > 0:
    print(f"\nFirst occurrence: {data[0]}")

    # Count by tipo
    tipo_count = {}
    for occ in data:
        tipo = occ.get('tipo', 'UNKNOWN')
        tipo_count[tipo] = tipo_count.get(tipo, 0) + 1

    print(f"\nTypes in first 100:")
    for tipo, count in sorted(tipo_count.items()):
        print(f"  {tipo}: {count}")
else:
    print(f"\nResponse: {data}")
