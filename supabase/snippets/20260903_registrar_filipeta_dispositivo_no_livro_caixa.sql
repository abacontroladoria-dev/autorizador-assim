-- =============================================================================
-- Livro-caixa — registrar 20260903000000 (filipeta por 8-DISPOSITIVO INDISPONIVEL)
-- =============================================================================
-- CONTEXTO: a migration foi aplicada à mão no SQL Editor em 2026-09-03. Só o
-- INSERT em supabase_migrations.schema_migrations ficou para trás.
--
-- POR QUE IMPORTA: enquanto a versão estiver ausente do livro-caixa, qualquer
-- `supabase db push` futuro a considera PENDENTE e tenta reaplicá-la — e o push
-- empurra o pendente INTEIRO, não só ela (reference_db_push_blast_radius).
-- Aqui a reaplicação em si é inofensiva (é um CREATE OR REPLACE idempotente,
-- sem DROP e sem mexer em grant), mas ela arrasta o resto da fila junto.
--
-- Este snippet NÃO reaplica nada. Só registra o que já está no ar.
-- Idempotente: `on conflict do nothing`.

insert into supabase_migrations.schema_migrations (version, name)
values ('20260903000000', 'filipeta_por_dispositivo_indisponivel')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- Conferência (só lê) — esperado: uma linha com a versão presente
-- ---------------------------------------------------------------------------
select version, name
from supabase_migrations.schema_migrations
where version = '20260903000000';
