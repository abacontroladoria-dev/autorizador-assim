file = "supabase/functions/cco-conciliation-engine/index.ts"

# Read
with open(file, 'r') as f:
    content = f.read()

# Apply all 11 fixes
fixes = [
    ('    .from("cco.session_authorizations")', '    .schema("cco")\n    .from("session_authorizations")'),
    ('    .from("cco.atendimentos")', '    .schema("cco")\n    .from("atendimentos")'),
    ('    .from("cco.session_substitutions")', '    .schema("cco")\n    .from("session_substitutions")'),
    ('      .from("cco.occurrences")', '      .schema("cco")\n      .from("occurrences")'),
    ('    .from("cco.dashboard_snapshot")', '    .schema("cco")\n    .from("dashboard_snapshot")'),
]

for old, new in fixes:
    content = content.replace(old, new)

# Write
with open(file, 'w') as f:
    f.write(content)

print("Applied all fixes")
