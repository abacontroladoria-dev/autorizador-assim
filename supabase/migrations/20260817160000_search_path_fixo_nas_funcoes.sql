-- Fixa search_path nas 77 funções sem ele (advisor 0011).
--
-- APLICADO EM PRODUÇÃO via SQL Editor em 2026-08-17. Registro no livro-caixa.
-- Idempotente: o loop só pega função que ainda não tem search_path definido.
--
-- Contexto: docs/warnings-supabase/ANALISE.md §4.
--
-- Caminho aplicado: `<schema da função>, public, extensions, pg_temp`.
-- É superconjunto do `"$user", public` que elas resolviam antes, então nenhuma
-- resolução de nome muda. Levantamento feito antes de aplicar mostrou que os
-- únicos schemas citados nos corpos são `auth`, `net` e `vault` — todos por
-- referência QUALIFICADA (auth.uid(), net.http_post(), vault.decrypted_secrets),
-- que não depende de search_path.
--
-- `extensions` entra no caminho mesmo hoje sendo inútil (unaccent, http e pg_net
-- estão em `public`): custa nada agora e evita revisitar as 77 se um dia as
-- extensões saírem de public — que é o único jeito de fechar o advisor 0014 sem
-- quebrar as 9 rotinas de sync do TiTa.
--
-- O filtro `pg_depend deptype = 'e'` exclui as 23 funções que pertencem às
-- extensões http e unaccent. O advisor também as ignora, e ALTER nelas se
-- perderia no próximo upgrade da extensão.
--
-- DO em vez de 77 ALTERs soltos de propósito: é all-or-nothing, e neste dia dois
-- scripts de várias linhas foram aplicados pela metade, sem erro nenhum.

do $$
declare
  r        record;
  novo     text;
  contador int := 0;
begin
  for r in
    select p.oid,
           n.nspname as schema_nome,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'central')
      and p.prokind = 'f'
      and not exists (
            select 1 from unnest(coalesce(p.proconfig, '{}')) c
            where c like 'search_path=%'
          )
      and not exists (
            select 1 from pg_depend d
            where d.objid = p.oid and d.deptype = 'e'
          )
    order by n.nspname, p.proname
  loop
    novo := case when r.schema_nome = 'public'
                 then 'public, extensions, pg_temp'
                 else r.schema_nome || ', public, extensions, pg_temp'
            end;

    execute format(
      'alter function %I.%I(%s) set search_path = %s',
      r.schema_nome, r.proname, r.args, novo
    );

    contador := contador + 1;
    raise notice 'search_path fixado: %.%(%)', r.schema_nome, r.proname, r.args;
  end loop;

  raise notice '--- % funcoes alteradas ---', contador;
end
$$;
