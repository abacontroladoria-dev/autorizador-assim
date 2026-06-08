import requests
import json
import time

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

# Test each detection with simple query to check query time
detections = {
    "R1": ("cco.session_authorizations", "select=count"),
    "R2": ("rpc/detect_sessions_without_authorization", "POST"),
    "R3": ("cco.atendimentos", "select=count"),
    "R4": ("cco.session_substitutions", "select=count"),
    "R5": ("cco.session_substitutions", "select=count&limit=1"),
    "R6": ("cco.atendimentos", "select=count"),
    "R7": ("cco.session_authorizations", "select=count"),
}

for name, (table, params) in detections.items():
    url = f"{SUPABASE_URL}/rest/v1/{table}" if not table.startswith("rpc") else f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "Authorization": f"Bearer {KEY}",
        "apikey": KEY,
    }

    print(f"\nTesting {name}...")
    start = time.time()
    try:
        if "rpc" in table:
            r = requests.post(url, headers=headers, json={}, timeout=5)
        else:
            r = requests.get(f"{url}?{params}", headers=headers, timeout=5)
        elapsed = time.time() - start
        print(f"{name}: {r.status_code} ({elapsed:.2f}s)")
        if r.status_code != 200:
            print(f"  Error: {r.json().get('message', 'unknown')[:100]}")
    except requests.Timeout:
        print(f"{name}: TIMEOUT (5s)")
    except Exception as e:
        print(f"{name}: ERROR - {e}")
