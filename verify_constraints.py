import requests
import json

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

# Use RPC to check table structure
url = f"{SUPABASE_URL}/rest/v1/rpc/get_cco_stats"
headers = {
    "Authorization": f"Bearer {KEY}",
    "apikey": KEY,
}

print("Checking cco.occurrences table existence via RPC...")
response = requests.post(url, headers=headers, json={}, timeout=5)
print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2)}")
