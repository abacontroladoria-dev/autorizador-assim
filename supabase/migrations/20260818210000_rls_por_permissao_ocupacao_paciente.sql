-- APLICADO EM PRODUÇÃO via SQL Editor em 2026-08-20. Este arquivo é o registro
-- no livro-caixa. Pré-checagem antes de aplicar: os 13 usuários ativos com
-- acesso à tela tinham override explícito em usuarios_permissoes (nenhum
-- dependia só do roleDefaults do frontend, que esta função não conhece), então
-- ninguém perdeu acesso. Conferido depois em pg_policies: 3 policies, todas
-- com usuario_tem_permissao(), nenhuma com qual = true.
--
-- Pedido do usuário (2026-08-18): endurecer de verdade a segurança de
-- aumentar_ocupacao_paciente_auditoria (e da tabela-irmã
-- cronograma_paciente_observacoes) — não só contra acesso anônimo
-- (20260818200000), mas restringindo quem, dentro dos usuários autenticados,
-- pode ler/escrever.
--
-- Por que NÃO usar remuneracao_has_role(['admin','diretoria','cronograma','terapeutico'])
-- (convenção de cronograma_salas_auditoria): investigação confirmou que o
-- controle de acesso real da tela /cronograma/ocupacao-paciente é
-- usuarios_permissoes (grant por usuário, codigo 'cronograma_ocupacao_paciente'),
-- INDEPENDENTE de usuarios.role — não existe tabela ligando papel a grupo de
-- permissão, só um seed inicial (roleDefaults no frontend) que pode ter sido
-- editado depois por usuário via /admin/permissoes. Restringir por papel
-- arriscava travar em silêncio usuários reais (Juliana, Victoria França,
-- Júlia Souza) cujo `role` não necessariamente é 'cronograma'/'terapeutico'.
--
-- Solução: RLS que verifica a MESMA fonte de verdade que o frontend usa pra
-- decidir se a página aparece no menu — usuarios_permissoes.permissao_codigo
-- = 'cronograma_ocupacao_paciente' AND permitido = true — em vez de tentar
-- inferir isso a partir do papel. admin/diretoria continuam com bypass
-- incondicional (mesma convenção de todo o módulo cronograma).

create or replace function public.usuario_tem_permissao(p_codigo text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.ativo = true and u.role in ('admin', 'diretoria')
  )
  or exists (
    select 1 from public.usuarios_permissoes up
    join public.usuarios u on u.id = up.usuario_id
    where up.usuario_id = auth.uid()
      and up.permissao_codigo = p_codigo
      and up.permitido = true
      and u.ativo = true
  );
$$;

comment on function public.usuario_tem_permissao(text) is
  'RLS helper: true se o usuário autenticado é admin/diretoria, ou tem o código de permissão de tela explicitamente concedido em usuarios_permissoes. Independente de usuarios.role para os demais papéis — ver 20260818210000.';

-- Mesmo padrão de is_admin()/is_diretoria() em 20260817140000: no PostgreSQL a
-- função nasce com EXECUTE para PUBLIC, e anon é membro de PUBLIC — o revoke é
-- o que de fato fecha a rota /rest/v1/rpc. O grant a authenticated não é
-- opcional: esta função é citada DENTRO das policies abaixo, e expressão de
-- policy é avaliada com a permissão de quem consulta; sem ele o usuário logado
-- levaria "permission denied for function usuario_tem_permissao".
revoke all on function public.usuario_tem_permissao(text) from public, anon;
grant execute on function public.usuario_tem_permissao(text) to authenticated;

-- ===== Limpeza das policies antigas =====
-- Por nome seria frágil aqui: a trilha nasceu em 20260818170000 como
-- `cronograma_paciente_observacoes_auditoria` e foi renomeada FORA das
-- migrations (20260818180000 já a chama de aumentar_ocupacao_paciente_auditoria).
-- RENAME TO preserva o nome das policies, então elas provavelmente ainda usam o
-- nome antigo — mas se alguma tiver sido recriada com outro nome, um
-- `drop policy if exists "<nome antigo>"` não acharia nada, a policy permissiva
-- `using (true)` sobreviveria, e RLS é OR entre policies: o endurecimento seria
-- anulado em silêncio. Removendo por catálogo não há nome a adivinhar.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'aumentar_ocupacao_paciente_auditoria',
        'cronograma_paciente_observacoes'
      )
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ===== aumentar_ocupacao_paciente_auditoria =====
alter table public.aumentar_ocupacao_paciente_auditoria enable row level security;

create policy "aumentar_ocupacao_paciente_auditoria_select" on public.aumentar_ocupacao_paciente_auditoria
  for select to authenticated
  using (public.usuario_tem_permissao('cronograma_ocupacao_paciente'));

create policy "aumentar_ocupacao_paciente_auditoria_insert" on public.aumentar_ocupacao_paciente_auditoria
  for insert to authenticated
  with check (public.usuario_tem_permissao('cronograma_ocupacao_paciente'));

-- Continua sem policy de UPDATE/DELETE — imutável, nem admin edita/apaga.

-- ===== cronograma_paciente_observacoes (texto atual da observação) =====
alter table public.cronograma_paciente_observacoes enable row level security;

create policy "cronograma_paciente_observacoes_all" on public.cronograma_paciente_observacoes
  for all to authenticated
  using (public.usuario_tem_permissao('cronograma_ocupacao_paciente'))
  with check (public.usuario_tem_permissao('cronograma_ocupacao_paciente'));

revoke all on public.cronograma_paciente_observacoes from public;
revoke all on public.cronograma_paciente_observacoes from anon;
revoke all on public.cronograma_paciente_observacoes from authenticated;
grant select, insert, update, delete on public.cronograma_paciente_observacoes to authenticated;

alter table public.cronograma_paciente_observacoes force row level security;
