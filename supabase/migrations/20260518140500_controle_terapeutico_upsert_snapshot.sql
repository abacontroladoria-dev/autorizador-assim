alter table public.controle_terapeutico
  add column if not exists data_atendimento date,
  add column if not exists hora_inicial time without time zone,
  add column if not exists hora_final time without time zone,
  add column if not exists profissional_id bigint,
  add column if not exists profissional_nome text,
  add column if not exists terapia_id bigint,
  add column if not exists terapia_nome text;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'controle_terapeutico'
      and policyname = 'controle_terapeutico_insert_authenticated'
  ) then
    create policy "controle_terapeutico_insert_authenticated"
      on public.controle_terapeutico
      as permissive
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

create or replace view public.vw_central_terapeutica as
select
  a.tita_agendamento_id,
  coalesce(ct.data_atendimento, a.data_atendimento) as data_atendimento,
  coalesce(ct.hora_inicial, a.hora_inicial) as hora_inicial,
  coalesce(ct.hora_final, a.hora_final) as hora_final,
  a.paciente_id,
  a.paciente_nome,
  coalesce(ct.profissional_id, a.profissional_id) as profissional_id,
  coalesce(ct.profissional_nome, a.profissional_nome) as profissional_nome,
  coalesce(ct.terapia_id, a.terapia_id) as terapia_id,
  coalesce(ct.terapia_nome, a.terapia_nome) as terapia_nome,
  a.sala_id,
  a.sala_nome,
  case
    when a.sala_nome ~~* '%Realengo%' then 'Realengo'
    when a.sala_nome ~~* '%Fazendinha%' then 'Fazendinha'
    when a.sala_nome ~~* '%Padre Miguel%' then 'Padre Miguel'
    else 'Outros'
  end as unidade,
  regexp_replace(
    a.sala_nome,
    '^Unid\.\s(Realengo|Fazendinha|Padre Miguel)\s-\s',
    ''
  ) as sala_operacional,
  a.clinica_id,
  a.clinica_nome,
  a.convenio_nome,
  coalesce(ct.status, 'pendente') as status,
  ct.profissional_substituto_id,
  coalesce(ct.profissional_substituto_nome, sub.profissional_nome) as profissional_substituto_nome,
  ct.observacao,
  ct.confirmado_por,
  ct.confirmado_em,
  ct.created_at as controle_created_at,
  ct.updated_at as controle_updated_at
from public.agenda_tita a
join public.terapias_controle tc
  on tc.terapia_id = a.terapia_id
  and tc.ativo = true
left join public.controle_terapeutico ct
  on ct.tita_agendamento_id = a.tita_agendamento_id
left join (
  select distinct
    agenda_tita.profissional_id,
    agenda_tita.profissional_nome
  from public.agenda_tita
) sub
  on sub.profissional_id = ct.profissional_substituto_id;
