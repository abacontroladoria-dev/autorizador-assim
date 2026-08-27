-- Aperta a RLS das quatro tabelas de Laudos/Altas, hoje abertas.
--
-- SEPARADA DE PROPÓSITO das migrations 20260826140000/140100, que só
-- FORMALIZAM o que já existe em produção. Esta MUDA comportamento, e por isso
-- pode ser aplicada (ou revertida) sozinha.
--
-- O QUE ESTÁ ERRADO HOJE: as policies dessas tabelas são `USING (true)` para
-- todo `authenticated`. Qualquer usuário logado no Pulsar — inclusive quem só
-- tem acesso a cronograma ou a autorizações — lê, edita e APAGA o laudo de
-- qualquer paciente. Laudo é dado de saúde: é o dado mais sensível do sistema,
-- e é o único do cadastro de pacientes sem controle de permissão.
--
-- O padrão adotado é o mesmo já aplicado em public.pacientes
-- (20260826100500) e em public.cadastros_auditoria (20260826130000):
-- usuario_tem_permissao('cadastros_pacientes') OR papel admin/diretoria/
-- cronograma. O ramo por papel não é decoração: usuario_tem_permissao() lê
-- usuarios_permissoes e IGNORA os roleDefaults do frontend, então sem ele quem
-- tem a tela pelo papel perderia o acesso que hoje tem.
--
-- ADITIVA EM RELAÇÃO A QUEM JÁ USA A TELA: quem enxerga a aba hoje é
-- exatamente quem passa por um dos dois ramos. Quem perde acesso é quem nunca
-- deveria ter tido.

do $$
declare
  t text;
  tabelas constant text[] := array[
    'cadastros_pacientes_laudos',
    'cadastros_pacientes_laudo_especialidades',
    'cadastros_pacientes_altas',
    'cadastros_pacientes_altas_individualidades'
  ];
  pol record;
  cond constant text :=
    '(public.usuario_tem_permissao(''cadastros_pacientes'')'
    || ' or public.remuneracao_has_role(array[''admin'',''diretoria'',''cronograma'']))';
begin
  foreach t in array tabelas loop
    -- Só age se o rename de 20260826140400 já tiver acontecido.
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela %.% ausente — nada a fazer.', 'public', t;
      continue;
    end if;

    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      t || '_select', t, cond);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      t || '_insert', t, cond);
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      t || '_update', t, cond, cond);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      t || '_delete', t, cond);

    execute format('alter table public.%I enable row level security', t);
    -- force: nem o dono da tabela escapa da policy. Mesma postura de
    -- cadastros_auditoria.
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;
