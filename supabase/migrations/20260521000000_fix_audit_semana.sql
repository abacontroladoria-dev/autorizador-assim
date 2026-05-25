-- =============================================================
-- Fix DB-1: LIMIT 1 sem ORDER BY em preencher_paciente_assim
-- Sem ORDER BY o PostgreSQL retorna linha arbitrária quando há
-- múltiplas matrículas iguais — possível paciente_id errado.
-- =============================================================
CREATE OR REPLACE FUNCTION public.preencher_paciente_assim()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin

  new.matricula_limpa :=
    case
      when new.matricula like '%.%.%'
        then split_part(new.matricula, '.', 2)
      else regexp_replace(new.matricula, '\D', '', 'g')
    end;

  select ao.paciente_id::bigint
  into new.paciente_id
  from agenda_orbita ao
  where ao.matricula = new.matricula_limpa
  order by ao.created_at desc
  limit 1;

  return new;

end;
$function$;

-- =============================================================
-- Fix DB-1: LIMIT 1 sem ORDER BY em inserir_na_fila_autorizacoes
-- paciente_medico_vigente tem PK em paciente_id então normalmente
-- retorna 1 linha, mas ORDER BY garante determinismo se houver
-- inconsistência histórica.
-- =============================================================
CREATE OR REPLACE FUNCTION public.inserir_na_fila_autorizacoes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare

  v_crm text;
  v_nome_medico text;

begin

  if new.status = 'manual'
     and new.matricula is not null
     and new.tuss is not null then

    select
      pmv.crm_numero,
      pmv.nome_medico
    into
      v_crm,
      v_nome_medico
    from paciente_medico_vigente pmv
    where pmv.paciente_id = new.paciente_id::text
    order by pmv.updated_at desc
    limit 1;

    v_crm := coalesce(v_crm, new.crm);

    v_nome_medico :=
      coalesce(v_nome_medico, new.nome_medico);

    insert into fila_autorizacoes (

      agenda_id,
      paciente_id,
      paciente_nome,

      matricula,
      data_atendimento,
      horario,

      status,

      empresa,
      dep,

      crm,
      nome_medico,

      tuss,

      machine_id,
      created_at

    )
    values (

      new.id,
      new.paciente_id,
      new.paciente_nome,

      new.matricula,
      new.data_atendimento,
      new.horario,

      'concluido',

      new.empresa,
      new.dep,

      v_crm,
      v_nome_medico,

      new.tuss,

      'manual_trigger',
      now()

    )
    on conflict do nothing;

  end if;

  return new;

end;
$function$;

-- =============================================================
-- Fix DB-4: Drop constraint UNIQUE duplicada em agenda_orbita
-- agenda_orbita_unique e unique_agenda_real são idênticos —
-- dobram o custo de INSERT/UPDATE sem nenhum benefício.
-- =============================================================
ALTER TABLE public.agenda_orbita DROP CONSTRAINT IF EXISTS unique_agenda_real;

-- =============================================================
-- Fix A-4: Índice em autorizacoes_assim.paciente_id
-- vw_match_autorizacoes_assim faz JOIN nesta coluna — sem índice
-- gera sequential scan crescente com o volume de autorizações.
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_autorizacoes_assim_paciente_id
  ON public.autorizacoes_assim(paciente_id);
