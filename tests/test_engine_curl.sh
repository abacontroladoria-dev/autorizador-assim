#!/bin/bash
set -e

SUPABASE_URL="https://wmugemamnqxjfpxrlwes.supabase.co"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5ODA0NywiZXhwIjoyMDkxNjc0MDQ3fQ.jNPXyxt6IqhZ-GCJBsmDqQOz9PKHuAXKf30aJfHYfoo"

echo "Testing engine HTTP endpoint (5s timeout)..."
curl -s -X POST \
  "$SUPABASE_URL/functions/v1/cco-conciliation-engine" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 5 \
  -w "\n%{http_code}\n" \
  || echo "FAILED/TIMEOUT"
