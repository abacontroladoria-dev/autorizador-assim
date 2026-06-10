-- Fix RLS policies: Remove public/anon access from sensitive tables
-- This migration removes overly permissive policies that allow unauthenticated access to medical/clinical data

-- ===== AUTORIZACOES TABLE =====
-- Remove public access policies
drop policy if exists "insert publico" on "public"."autorizacoes";
drop policy if exists "select liberado geral" on "public"."autorizacoes";
drop policy if exists "Permitir update de autorizacoes" on "public"."autorizacoes";
drop policy if exists "update autorizacoes liberado" on "public"."autorizacoes";

-- Recreate with authenticated requirement
create policy "insert autorizacoes authenticated"
on "public"."autorizacoes"
as permissive
for insert
to authenticated
with check (true);

create policy "select autorizacoes authenticated"
on "public"."autorizacoes"
as permissive
for select
to authenticated
using (true);

create policy "update autorizacoes authenticated"
on "public"."autorizacoes"
as permissive
for update
to authenticated
using (true)
with check (true);

-- Keep existing delete policy (blocks all)

-- ===== CHAMADA_PACIENTE TABLE =====
-- Remove anon policy
drop policy if exists "Liberar tudo chamada" on "public"."chamada_paciente";

-- Recreate with authenticated requirement
create policy "all chamada_paciente authenticated"
on "public"."chamada_paciente"
as permissive
for all
to authenticated
using (true)
with check (true);

-- ===== LOGS TABLE =====
-- Remove public insert policy
drop policy if exists "insert logs liberado geral" on "public"."logs";

-- Recreate with authenticated requirement
create policy "insert logs authenticated"
on "public"."logs"
as permissive
for insert
to authenticated
with check (true);

-- Keep existing authenticated insert policy

-- ===== SYNC_CONTROLE TABLE =====
-- Remove public access policies
drop policy if exists "Permitir select sync" on "public"."sync_controle";
drop policy if exists "Permitir update sync" on "public"."sync_controle";

-- Recreate with authenticated requirement
create policy "select sync_controle authenticated"
on "public"."sync_controle"
as permissive
for select
to authenticated
using (true);

create policy "update sync_controle authenticated"
on "public"."sync_controle"
as permissive
for update
to authenticated
using (true)
with check (true);

-- Keep existing authenticated insert/update policies if any
