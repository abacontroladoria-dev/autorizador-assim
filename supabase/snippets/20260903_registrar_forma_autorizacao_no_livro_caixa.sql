-- =============================================================================
-- Livro-caixa — registrar 20260903010000 (forma_autorizacao segue a ASSIM)
-- =============================================================================
-- CONTEXTO: a migration foi aplicada à mão no SQL Editor em 2026-09-03. Só o
-- INSERT em supabase_migrations.schema_migrations ficou para trás.
--
-- POR QUE IMPORTA: enquanto a versão estiver ausente do livro-caixa, qualquer
-- `supabase db push` futuro a considera PENDENTE — e o push empurra o pendente
-- INTEIRO, não só ela (reference_db_push_blast_radius).
--
-- Este snippet NÃO reaplica nada. Só registra o que já está no ar.
-- Idempotente: `on conflict do nothing`.

insert into supabase_migrations.schema_migrations (version, name)
values ('20260903010000', 'forma_autorizacao_segue_a_assim')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- Conferência (só lê) — esperado: as DUAS versões de hoje presentes
-- ---------------------------------------------------------------------------
select version, name
from supabase_migrations.schema_migrations
where version in ('20260903000000', '20260903010000')
order by version;
