#!/bin/bash
file="supabase/functions/cco-conciliation-engine/index.ts"

# R4
sed -i 's/\.from("cco\.session_substitutions")/\n    .schema("cco")\n    .from("session_substitutions")/g' "$file"

# This will mess up, let me do it differently with proper quotes
