#!/usr/bin/env python3
import requests
import json

SUPABASE_URL = 'https://wmugemamnqxjfpxrlwes.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo'

headers = {
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

response = requests.post(
    f'{SUPABASE_URL}/functions/v1/cco-conciliation-engine',
    headers=headers,
    json={},
    timeout=60
)

data = response.json()
print(f'Status: {response.status_code}')
print(f'candidates_detected: {data.get("candidates_detected")}')
print(f'occurrences_generated: {data.get("occurrences_generated")}')
counts = data.get("debug", {}).get("cco_record_counts", {})
print(f'Counts: {json.dumps(counts, indent=2)}')
