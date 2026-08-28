-- FIX — fn_set_crm_uf casava só por paciente_id, não por crm.
--
-- A migration 20260728040000 criou o trigger que preenche fila_autorizacoes.crm_uf a
-- partir de agenda_orbita, mas o WHERE olhava só paciente_id e pegava a linha mais
-- recente por updated_at — ignorando qual médico (crm) estava de fato na guia. Quando
-- o mesmo paciente tem mais de um médico em agenda_orbita (comum: cada sessão pode ter
-- profissional diferente), a UF gravada podia ser de um médico e o CRM de outro.
--
-- Caso real confirmado (paciente 11720, Samuel Elias): fila_autorizacoes gravou
-- crm=205202 (Franz Fernandez, UF correta SP) com crm_uf='RJ' — UF de Paulo Roberto,
-- cujo agendamento futuro tinha sync mais recente. A guia saiu 'glosa'.
--
-- Fix: casar também por crm. Sem match por crm, não adivinha mais — deixa null (o
-- robô volta ao default anterior, RJ, que já era o comportamento antes desta feature
-- existir, não uma regressão nova).

create or replace function public.fn_set_crm_uf()
returns trigger
language plpgsql
as $$
begin
  if new.crm_uf is null
     and new.paciente_id is not null
     and new.crm is not null then

    select o.crm_uf
      into new.crm_uf
    from public.agenda_orbita o
    where o.paciente_id = (new.paciente_id)::text
      and o.crm = new.crm
      and o.crm_uf is not null
    order by o.updated_at desc nulls last
    limit 1;

  end if;

  return new;
end;
$$;

-- Corrige as linhas ainda não processadas (pendente/erro) que hoje carregam crm_uf
-- nulo ou errado por causa do bug — são as únicas onde a UF errada ainda pode virar
-- guia enviada ao portal. Linhas já concluídas/glosadas ficam como estão (já foram
-- enviadas; reprocessar é decisão manual, não deste fix).
update public.fila_autorizacoes fa
set crm_uf = sub.crm_uf_correto
from (
  select fa2.id, o.crm_uf as crm_uf_correto
  from public.fila_autorizacoes fa2
  join lateral (
    select o.crm_uf
    from public.agenda_orbita o
    where o.paciente_id = (fa2.paciente_id)::text
      and o.crm = fa2.crm
      and o.crm_uf is not null
    order by o.updated_at desc nulls last
    limit 1
  ) o on true
  where fa2.status in ('pendente', 'erro')
    and fa2.crm is not null
) sub
where fa.id = sub.id
  and fa.crm_uf is distinct from sub.crm_uf_correto;
