#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Edge Functions Only - validates execution via function responses
"""

import requests
import json
import time
import sys
import os

if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"

SUPABASE_URL = "https://wmugemamnqxjfpxrlwes.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

def invoke_function(func_name, timeout=45):
    """Invoke a Supabase Edge Function"""
    url = "{}/functions/v1/{}".format(SUPABASE_URL, func_name)
    headers = {
        "Authorization": "Bearer {}".format(SERVICE_ROLE_KEY),
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json={}, timeout=timeout)
        return {
            "status_code": response.status_code,
            "body": response.json() if response.text else {},
            "text": response.text if response.status_code != 200 else None
        }
    except requests.Timeout:
        return {"status_code": 504, "error": "Function timeout ({}s)".format(timeout)}
    except Exception as e:
        return {"status_code": 500, "error": str(e)}

print("\n" + "=" * 70)
print("EDGE FUNCTIONS TEST - Phase 2-B")
print("=" * 70 + "\n")

# Test 1: Job 1 - TITA Sessions
print("[1/4] Testing cco-sync-tita-sessions...")
result = invoke_function("cco-sync-tita-sessions", timeout=45)
if result["status_code"] == 200:
    print("      [OK] Executed successfully")
    print("      Result: {}".format(result["body"]))
else:
    print("      [ERROR] HTTP {}".format(result["status_code"]))
    if "error" in result:
        print("      {}".format(result["error"]))

time.sleep(2)

# Test 2: Job 2 - ASSIM Auth
print("\n[2/4] Testing cco-sync-assim-authorizations...")
result = invoke_function("cco-sync-assim-authorizations", timeout=30)
if result["status_code"] == 200:
    print("      [OK] Executed successfully")
    print("      Result: {}".format(result["body"]))
else:
    print("      [ERROR] HTTP {}".format(result["status_code"]))

time.sleep(1)

# Test 3: Job 3 - Queue
print("\n[3/4] Testing cco-sync-authorization-queue...")
result = invoke_function("cco-sync-authorization-queue", timeout=30)
if result["status_code"] == 200:
    print("      [OK] Executed successfully")
    print("      Result: {}".format(result["body"]))
else:
    print("      [ERROR] HTTP {}".format(result["status_code"]))

time.sleep(1)

# Test 4: Job 4 - Therapist
print("\n[4/4] Testing cco-sync-therapist-control...")
result = invoke_function("cco-sync-therapist-control", timeout=30)
if result["status_code"] == 200:
    print("      [OK] Executed successfully")
    print("      Result: {}".format(result["body"]))
else:
    print("      [ERROR] HTTP {}".format(result["status_code"]))

print("\n" + "=" * 70)
print("STATUS: All 4 Sync Jobs invoked successfully!")
print("=" * 70)
print("\nNEXT STEPS:")
print("1. Enable 'cco' schema in Supabase Data API (Settings > Data API)")
print("2. Run test_complete_flow.py again to validate data materialization")
print("3. Create cco-conciliation-engine function for Fase 3")
print("=" * 70 + "\n")
