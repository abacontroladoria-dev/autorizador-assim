-- RLS de cadastros_pacientes_suspensoes_temporarias.
--
-- Mesmo padrão já aplicado às 4 tabelas de laudos/altas em
-- 20260826140700: usuario_tem_permissao('cadastros_pacientes') OR papel
-- admin/diretoria/cronograma. Sem essa tabela nascer já com RLS fechada, ela
-- repetiria o gap que existiu em laudo/alta até 20260826140700 (qualquer
-- authenticated lendo/editando/apagando dado clínico de qualquer paciente).
--
-- DELETE revogado do banco: suspensão é registro clínico, mesma decisão da
-- alta (20260827100000) — a exclusão da tela é sempre soft delete
-- (ativo = false).

alter table public.cadastros_pacientes_suspensoes_temporarias enable row level security;
alter table public.cadastros_pacientes_suspensoes_temporarias force row level security;

drop policy if exists cadastros_pacientes_suspensoes_temporarias_select
  on public.cadastros_pacientes_suspensoes_temporarias;
create policy cadastros_pacientes_suspensoes_temporarias_select
  on public.cadastros_pacientes_suspensoes_temporarias
  for select to authenticated
  using (
    public.usuario_tem_permissao('cadastros_pacientes')
    or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
  );

drop policy if exists cadastros_pacientes_suspensoes_temporarias_insert
  on public.cadastros_pacientes_suspensoes_temporarias;
create policy cadastros_pacientes_suspensoes_temporarias_insert
  on public.cadastros_pacientes_suspensoes_temporarias
  for insert to authenticated
  with check (
    public.usuario_tem_permissao('cadastros_pacientes')
    or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
  );

drop policy if exists cadastros_pacientes_suspensoes_temporarias_update
  on public.cadastros_pacientes_suspensoes_temporarias;
create policy cadastros_pacientes_suspensoes_temporarias_update
  on public.cadastros_pacientes_suspensoes_temporarias
  for update to authenticated
  using (
    public.usuario_tem_permissao('cadastros_pacientes')
    or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
  )
  with check (
    public.usuario_tem_permissao('cadastros_pacientes')
    or public.remuneracao_has_role(array['admin','diretoria','cronograma'])
  );

revoke delete on public.cadastros_pacientes_suspensoes_temporarias from authenticated;
