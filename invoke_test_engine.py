import requests
import time

URL = "https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/cco-conciliation-engine-test"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

print("Invoking minimal test function...")
start = time.time()
try:
    r = requests.post(URL, headers={"Authorization": f"Bearer {KEY}"}, timeout=5)
    print(f"Status: {r.status_code} ({time.time()-start:.1f}s)")
    print(r.text)
except Exception as e:
    print(f"ERROR ({time.time()-start:.1f}s): {e}")
