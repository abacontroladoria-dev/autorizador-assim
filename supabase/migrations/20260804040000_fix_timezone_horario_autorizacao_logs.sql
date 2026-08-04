-- fila_autorizacoes.horario_autorizacao é timestamp SEM timezone e guarda hora de
-- parede em America/Sao_Paulo (mesma convenção provada pelo campo "Autorizado em",
-- que lê essa coluna direto e exibe certo). O trigger abaixo copiava esse valor cru
-- para fila_autorizacoes_logs.horario_autorizacao, que é timestamp COM timezone.
-- Sem conversão explícita, o Postgres faz o cast implícito assumindo o timezone da
-- sessão (UTC no Supabase), adiantando o instante gravado em 3h — daí "Autorização
-- concluída" aparecer 3h atrasada na timeline.
CREATE OR REPLACE FUNCTION public.trigger_log_fila_autorizacoes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

declare

  descricao_evento text;

begin

  -- ============================================
  -- INSERT
  -- ============================================

  if tg_op = 'INSERT' then

    descricao_evento :=

      case

        when new.status = 'pendente'
          then 'Solicitação criada'

        when new.status = 'processando'
          then 'Processamento iniciado'

        when new.status = 'concluido'
          then 'Autorização concluída'

        when new.status = 'falta'
          then 'Falta registrada'

        when new.status = 'erro'
          then 'Erro operacional'

        else
          'Registro criado'

      end;

    insert into fila_autorizacoes_logs (

      fila_id,
      status,
      descricao,
      machine_id,
      horario_autorizacao,
      numero_autorizacao,
      metadata

    )

    values (

      new.id,
      new.status,
      descricao_evento,
      new.machine_id,
      (new.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo'),
      new.numero_autorizacao,

      jsonb_build_object(

        'completion_type',
        new.completion_type,

        'tipo_falta',
        new.tipo_falta,

        'numero_autorizacao',
        new.numero_autorizacao

      )

    );

    return new;

  end if;

  -- ============================================
  -- UPDATE
  -- ============================================

  if tg_op = 'UPDATE' then

    if

      old.status is not distinct from new.status

      and old.numero_autorizacao
      is not distinct from
      new.numero_autorizacao

      and old.tipo_falta
      is not distinct from
      new.tipo_falta

      and old.completion_type
      is not distinct from
      new.completion_type

    then
      return new;
    end if;

    descricao_evento :=

      case

        when new.status = 'pendente'
          then 'Autorização reenviada'

        when new.status = 'processando'
          then 'Worker iniciou processamento'

        when new.status = 'concluido'
          then 'Autorização concluída'

        when new.status = 'erro'
          then 'Erro operacional'

        when new.status = 'falta'

          then

            case

              when new.tipo_falta = 'terapeuta'
                then 'Falta do terapeuta'

              when new.tipo_falta = 'paciente'
                then 'Falta do paciente'

              else 'Falta registrada'

            end

        else

          concat(
            'Status alterado para ',
            coalesce(new.status, 'desconhecido')
          )

      end;

    insert into fila_autorizacoes_logs (

      fila_id,
      status,
      descricao,
      machine_id,
      horario_autorizacao,
      numero_autorizacao,
      metadata

    )

    values (

      new.id,
      new.status,
      descricao_evento,
      new.machine_id,
      (new.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo'),
      new.numero_autorizacao,

      jsonb_build_object(

        'status_anterior',
        old.status,

        'status_novo',
        new.status,

        'completion_type',
        new.completion_type,

        'tipo_falta',
        new.tipo_falta,

        'numero_autorizacao',
        new.numero_autorizacao

      )

    );

    return new;

  end if;

  return new;

end;

$function$
;

-- Backfill: linhas já gravadas sob o cast incorreto ficaram 3h adiantadas em UTC
-- (ex.: 16:13 de parede virou 16:13 UTC = 13:13 local em vez de 19:13 UTC = 16:13 local).
-- Seguro porque fila_autorizacoes_logs.horario_autorizacao só é escrito por este
-- trigger — não há outro INSERT/UPDATE nessa coluna em todo o projeto.
UPDATE public.fila_autorizacoes_logs
SET horario_autorizacao = horario_autorizacao + INTERVAL '3 hours'
WHERE horario_autorizacao IS NOT NULL;
