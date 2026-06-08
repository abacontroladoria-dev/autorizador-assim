import requests
import json

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

headers = {
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
}

url = f"{SUPABASE_URL}/rest/v1/cco.processing_logs"
params = {
    "select": "*",
    "order": "started_at.desc",
    "limit": "10",
    "job_name": "eq.cco-conciliation-engine"
}

response = requests.get(url, headers=headers, params=params)
print(f"Status: {response.status_code}")
print(json.dumps(response.json(), indent=2))
