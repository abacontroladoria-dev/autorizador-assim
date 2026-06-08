#!/bin/bash

# Invoke engine and capture logs
SUPABASE_URL="https://wmugemamnqxjfpxrlwes.supabase.co"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

echo "Invoking cco-conciliation-engine..."
timeout 15 curl -s -X POST \
  "$SUPABASE_URL/functions/v1/cco-conciliation-engine" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{}' || echo "TIMEOUT or ERROR"

echo ""
echo "Checking processing_logs via RPC..."

# Call RPC to get recent logs
timeout 10 curl -s -X POST \
  "$SUPABASE_URL/rest/v1/rpc/count_test_data" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{}' || echo "RPC call failed"
