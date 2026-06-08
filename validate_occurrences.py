#!/usr/bin/env python3
"""Validate detected occurrences against real TITA data."""

import os
import json
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

print("\n" + "="*80)
print("VALIDAÇÃO DE OCORRÊNCIAS DETECTADAS")
print("="*80)

# Get occurrences
result = supabase.table("occurrences").select("*").execute()
occurrences = result.data

print(f"\n📊 Total de ocorrências: {len(occurrences)}")

for occ in occurrences:
    session_key = occ.get("session_key")
    tipo = occ.get("tipo")
    severity = occ.get("severity")

    print(f"\n{'─'*80}")
    print(f"🔍 {tipo} ({severity})")
    print(f"   Session Key: {session_key}")
    print(f"   Fingerprint: {occ.get('fingerprint')}")
    print(f"   Criada em: {occ.get('created_at')}")

    # Get atendimento details
    att_result = supabase.table("atendimentos").select("*").eq("session_key", session_key).limit(1).execute()
    if att_result.data:
        att = att_result.data[0]
        print(f"   Paciente: {att.get('paciente_nome')}")
        print(f"   Data: {att.get('data_sessao')}")
        print(f"   Possui Tratativa: {att.get('possui_tratativa')}")
        print(f"   Terapia: {att.get('terapia')}")

    # Get authorization status
    auth_result = supabase.table("session_authorizations").select("*").eq("session_key", session_key).execute()
    if auth_result.data:
        for auth in auth_result.data:
            print(f"   Auth ({auth.get('source')}): {auth.get('authorization_status')}")

    # Get substitution status
    sub_result = supabase.table("session_substitutions").select("*").eq("session_key", session_key).limit(1).execute()
    if sub_result.data:
        sub = sub_result.data[0]
        print(f"   Substitution Status: {sub.get('status_ct')}")
        if sub.get('profissional_substituto_nome'):
            print(f"   Substituto: {sub.get('profissional_substituto_nome')}")

print("\n" + "="*80)
print("✅ Validação concluída")
print("="*80 + "\n")
