-- =============================================================================
-- Livro-caixa — registrar 20260825130000 e 20260825140000 (autorizações avulsas)
-- =============================================================================
-- CONTEXTO: o diagnóstico de 2026-09-01 provou que as duas migrations JÁ ESTÃO
-- APLICADAS em produção (colunas, índice, as duas RPCs com EXECUTE, o catálogo de
-- permissão e a view com o filtro `avulsa` preservando `numero_autorizacao_origem`).
-- Foram coladas à mão e só o INSERT no livro-caixa ficou para trás.
--
-- POR QUE IMPORTA: enquanto a versão estiver ausente de
-- supabase_migrations.schema_migrations, qualquer `supabase db push` futuro
-- considera as duas PENDENTES e tenta reaplicá-las. A 130000 faz
-- DROP VIEW + CREATE VIEW em vw_central_pacientes — reaplicar derruba os grants de
-- novo (foi assim que o `anon` se perdeu, ver bloco 2) e a /central-pacientes pode
-- abrir vazia, com 403, sem erro visível.
--
-- Este snippet NÃO reaplica nada. Só registra o que já está no ar.
-- Idempotente: `on conflict do nothing`.

begin;

-- ---------------------------------------------------------------------------
-- Bloco 1 — o registro que faltou
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260825130000', 'autorizacoes_avulsas'),
  ('20260825140000', 'terapias_tuss_sem_a_view')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- Bloco 2 — o grant do `anon` que o DROP VIEW levou
-- ---------------------------------------------------------------------------
-- A 20260825130000 concede a `anon, authenticated, service_role`, mas hoje a view
-- só tem service_role, authenticated e postgres: o DROP levou o grant do anon e a
-- aplicação manual não o devolveu.
--
-- Restaura exatamente o que a migration declara — não amplia acesso para papel
-- nenhum além do que o arquivo já previa. A view é SECURITY INVOKER e a RLS das
-- tabelas de base continua valendo, então isto não expõe linha que o anon já não
-- pudesse ver por essas policies.
--
-- Se você preferir NÃO devolver o acesso ao anon (a tela é autenticada e hoje nada
-- depende dele), comente as duas linhas abaixo — o sistema segue funcionando. Mas
-- então o arquivo da migration deixa de descrever a realidade, e a próxima pessoa
-- que a reaplicar vai reintroduzir o grant sem perceber.
grant select on public.vw_central_pacientes to anon;

commit;

-- ---------------------------------------------------------------------------
-- Conferência (rodar depois; só lê)
-- ---------------------------------------------------------------------------
-- Esperado: as duas versões presentes, e 4 grants de SELECT na view.
select 'livro-caixa' as o_que, string_agg(version, ', ') as valor
from supabase_migrations.schema_migrations
where version in ('20260825130000', '20260825140000')
union all
select 'grants da view', string_agg(grantee, ', ' order by grantee)
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'vw_central_pacientes'
  and privilege_type = 'SELECT';
