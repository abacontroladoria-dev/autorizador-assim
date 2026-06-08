import requests
import time
import sys

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

url = f"{SUPABASE_URL}/functions/v1/cco-conciliation-engine"
headers = {
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

print("=" * 80)
print("Invoking cco-conciliation-engine")
print("=" * 80)

start = time.time()
try:
    response = requests.post(url, headers=headers, json={}, timeout=15)
    elapsed = time.time() - start
    print(f"\n[{elapsed:.1f}s] Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"\nResponse:")
    try:
        import json
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text[:500])
except requests.Timeout:
    elapsed = time.time() - start
    print(f"\n[{elapsed:.1f}s] TIMEOUT - function did not respond in 15 seconds")
except requests.ConnectionError as e:
    elapsed = time.time() - start
    print(f"\n[{elapsed:.1f}s] CONNECTION ERROR: {e}")
except Exception as e:
    elapsed = time.time() - start
    print(f"\n[{elapsed:.1f}s] ERROR: {e}")
