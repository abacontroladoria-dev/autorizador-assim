-- ITEM 1 — Alvos da sincronização do Órbita.
--
-- Retorna, por paciente com atendimento ATIVO a partir de hoje, a data de
-- atendimento mais próxima. O sync do Órbita usa isso para buscar cada paciente
-- na sua próxima data (em vez de só "hoje") e popular agenda_orbita com o
-- CRM/médico. Como o CRM é por paciente, 1 linha em qualquer data já resolve a
-- view — inclusive para quem só tem atendimento futuro (que antes ficava fora de
-- agenda_orbita → CRM null → robô travava no campo do CRM).
--
-- Retorna JSONB (array numa única linha) de propósito: evita o cap
-- max_rows=1000 do PostgREST, que truncaria a lista de pacientes.
--
-- SECURITY DEFINER para ler agenda_tita independentemente da RLS do chamador
-- (a função é chamada tanto pelo cron/service_role quanto por usuário do frontend).

create or replace function public.fn_orbita_sync_targets()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('paciente_id', t.paciente_id, 'prox_data', t.prox_data)),
    '[]'::jsonb
  )
  from (
    select at.paciente_id, min(at.data_atendimento) as prox_data
    from public.agenda_tita at
    where at.ativo = true
      and at.paciente_id is not null
      and at.data_atendimento >= (timezone('America/Sao_Paulo', now()))::date
    group by at.paciente_id
  ) t
$$;

grant execute on function public.fn_orbita_sync_targets() to authenticated, service_role;
