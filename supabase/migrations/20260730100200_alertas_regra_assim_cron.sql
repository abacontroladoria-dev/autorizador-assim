-- ============================================================================
-- Regras ASSIM: "sem desfecho operacional" e "glosa" + cron
-- ----------------------------------------------------------------------------
-- Depende de 20260730100000_create_alertas_infra.sql e …100100_alertas_rpcs.sql.
--
-- REGRA DE NEGÓCIO (definida pelo usuário):
--   Todo agendamento do TiTa NASCE pendente. Só é tratado como concluído quando
--   tem GUIA VÁLIDA ou FALTA (ou cancelamento). Portanto:
--
--     CONCLUÍDO = guia válida ∪ falta ∪ cancelamento
--     PENDENTE  = todo o resto (o complemento, não apenas 'NAO_SOLICITADA')
--
-- Isso é mais amplo do que a leitura ingênua de get_auditoria_assim. Usar
-- `situacao <> 'NAO_SOLICITADA'` como fim de pendência encerraria o alerta assim
-- que a recepção apenas ENFILEIRASSE o pedido (situacao vira 'SINCRONIZANDO'),
-- deixando o atendimento terminar o dia sem guia e sem pendência aberta — exatamente
-- a falha que este módulo existe para impedir. Também encerraria em 'GLOSA', que é
-- recusa do convênio, não desfecho.
--
-- COMO SE SABE QUE TEM GUIA VÁLIDA — duas fontes, e a primeira é a melhor:
--   1. fila_autorizacoes: no aceite, o robô grava status='concluido' +
--      numero_autorizacao=<guia> (ver robo-autorizador/rpa.js:314-319). É o sinal
--      mais cedo e mais confiável, porque não depende do match posicional.
--   2. autorizacoes_assim via get_auditoria_assim -> situacao='LIBERADA'.
--
-- get_auditoria_assim NÃO conhece fila.numero_autorizacao nem fila.status, e não
-- vamos alterá-la: ela é a RPC da aba Auditoria e precisa ficar preservada. Então a
-- fonte (1) é consultada aqui, ao lado da RPC, só para efeito de alerta.
--
-- DUAS REGRAS, DUAS CLASSES DE PENDÊNCIA:
--   pendente_sem_desfecho -> regra assim_sem_desfecho (média, tolerância 50min)
--   pendente_glosa        -> regra assim_glosa        (alta,  tolerância 0)
-- Um bloco que sai de "sem desfecho" para "glosa" fecha o primeiro alerta e abre o
-- segundo: são problemas diferentes, com ações diferentes. O histórico não se perde
-- porque a timeline (get_alerta_historico) é por ENTIDADE, não por alerta.
--
-- POR QUE NÃO TRIGGER EM autorizacoes_assim: aquela tabela é escrita por um robô
-- externo a este repositório. Um trigger ali refaria o match posicional por linha e,
-- se falhasse, travaria as escritas do robô. O cron reconcilia a cada 10 min sem
-- tocar no caminho de escrita dele.
--
-- ATENÇÃO: get_auditoria_assim passou a ser dependência de ESCRITA. Mudar o que ela
-- classifica muda quais alertas nascem e quais se encerram.
-- ============================================================================

create or replace function public.fn_alertas_avaliar_assim(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agora_local timestamp;
  v_gerados     integer := 0;
  v_encerrados  integer := 0;
  v_regras      integer;
begin
  select count(*) into v_regras
  from public.alertas_regras
  where modulo = 'assim' and ativo
    and codigo in ('assim_sem_desfecho', 'assim_glosa');

  if v_regras = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma regra assim ativa');
  end if;

  -- TIMEZONE — a armadilha desta função.
  -- O cron roda em UTC, mas hora_inicial de agenda_tita é hora de PAREDE local
  -- (America/Sao_Paulo, UTC-3). Comparar (p_data + hora_inicial) direto com now()
  -- erraria em 3 horas.
  v_agora_local := (now() at time zone 'America/Sao_Paulo');

  with
  -- Regras ativas + a classe de pendência que cada uma sustenta.
  regras as (
    select r.codigo, r.setor_destino, r.prioridade, r.tolerancia_minutos, r.nome,
           case r.codigo
             when 'assim_sem_desfecho' then 'pendente_sem_desfecho'
             when 'assim_glosa'        then 'pendente_glosa'
           end as classe_alvo
    from public.alertas_regras r
    where r.modulo = 'assim' and r.ativo
      and r.codigo in ('assim_sem_desfecho', 'assim_glosa')
  ),

  src as (
    select bloco_id, paciente_nome, hora_inicial, codigo_tuss, terapias, profissionais,
           empresa, matricula, dep, situacao, token, guia, codigo_erro, descricao_erro,
           observacao
    from public.get_auditoria_assim(p_data)
  ),

  -- Guia colhida pelo robô no momento do aceite. Agrupado porque a chave da fila
  -- (empresa/matricula/dep/tuss/horario) pode ter mais de uma linha histórica.
  fila_com_guia as (
    select f.empresa, f.matricula, f.dep, f.tuss, f.horario,
           max(f.numero_autorizacao) as numero_autorizacao
    from public.fila_autorizacoes f
    where f.data_atendimento = p_data
      and f.status = 'concluido'
      and f.numero_autorizacao is not null
    group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
  ),

  -- Classifica cada bloco do dia. 'concluido' encerra; as duas classes
  -- 'pendente_*' sustentam a regra correspondente.
  avaliado as (
    select
      s.*,
      fg.numero_autorizacao as guia_fila,
      case
        -- (1) guia colhida no aceite pelo robô
        when fg.matricula is not null                then 'concluido'
        -- (2) autorizacoes_assim confirmou liberação, ou o atendimento foi cancelado
        when s.situacao in ('LIBERADA', 'CANCELADA') then 'concluido'
        -- (3) convênio respondeu recusando
        when s.situacao = 'GLOSA'                    then 'pendente_glosa'
        -- (4) NAO_SOLICITADA, SINCRONIZANDO, RETORNO_NAO_CONFIRMADO e qualquer
        --     estado futuro: nada de guia, nada de falta -> continua pendente
        else                                              'pendente_sem_desfecho'
      end as classe
    from src s
    left join fila_com_guia fg
      on  fg.empresa  = s.empresa
      and fg.matricula = s.matricula
      and fg.dep      = s.dep
      and fg.tuss     = s.codigo_tuss
      and fg.horario  = s.hora_inicial
  ),

  -- ── Passo 1: gerar ─────────────────────────────────────────────────────────
  novos as (
    insert into public.alertas (
      modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
      titulo, descricao, prioridade, status, setor_destino, fingerprint
    )
    select
      'assim', g.codigo, 'sistema', 'atendimento', a.bloco_id,
      -- token/guia/codigo_erro entram no snapshot porque a Luana lê esses números
      -- INLINE na planilha que este módulo substitui — para contestar uma glosa ela
      -- precisa da guia recusada e do código do erro na própria linha, sem abrir
      -- detalhe. Em 'pendente_sem_desfecho' vêm nulos por definição (não há guia);
      -- em 'pendente_glosa' vêm preenchidos pelo match com autorizacoes_assim.
      jsonb_build_object(
        'paciente_nome', a.paciente_nome,
        'data',          p_data::text,
        'hora',          to_char(a.hora_inicial, 'HH24:MI'),
        'terapia',       a.terapias,
        'profissional',  a.profissionais,
        'tuss',          a.codigo_tuss,
        'token',         a.token,
        'guia',          coalesce(a.guia, a.guia_fila),
        'codigo_erro',   a.codigo_erro,
        'situacao',      a.situacao
      ),
      g.nome,
      case
        when a.classe = 'pendente_glosa' then
          concat('A ASSIM recusou a autorização de ',
                 coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'), '. ',
                 coalesce(nullif(a.codigo_erro, '') || ' - ', ''),
                 coalesce(a.descricao_erro, 'Sem descrição do erro.'))
        else
          concat('Atendimento de ', coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'),
                 ' não possui guia válida, falta registrada nem cancelamento.')
      end,
      g.prioridade, 'aberto', g.setor_destino,
      concat_ws('|', 'assim', g.codigo, a.bloco_id)
    from avaliado a
    join regras g on g.classe_alvo = a.classe
    -- Tolerância zero = alerta imediato, sem esperar a hora da sessão (glosa é
    -- resposta do convênio e pode chegar antes do atendimento acontecer).
    where g.tolerancia_minutos = 0
       or (p_data + a.hora_inicial)
          + (g.tolerancia_minutos * interval '1 minute') <= v_agora_local
    on conflict do nothing
    returning id, entidade_tipo, entidade_id, regra_codigo
  ),
  ev_novos as (
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao
    )
    select n.id, n.entidade_tipo, n.entidade_id, 'deteccao', 'sistema', 'Sistema',
      case n.regra_codigo
        when 'assim_glosa' then 'Sistema detectou autorização recusada pela ASSIM.'
        else 'Sistema detectou atendimento sem desfecho operacional.'
      end
    from novos n
    returning 1
  ),

  -- ── Passo 2: reconciliar ────────────────────────────────────────────────────
  -- Encerra o alerta cuja condição deixou de valer. Compara contra a classe ALVO
  -- da própria regra, então cobre três transições: virou concluído, mudou de classe
  -- (sem desfecho -> glosa, ou o contrário), ou o bloco saiu da agenda (falta,
  -- cancelamento, ativo=false).
  encerraveis as (
    select a.id, a.entidade_tipo, a.entidade_id, a.regra_codigo,
           av.classe, av.situacao, av.token, av.guia, av.guia_fila
    from public.alertas a
    join regras g       on g.codigo = a.regra_codigo
    left join avaliado av on av.bloco_id = a.entidade_id
    where a.status <> 'resolvido'
      and a.entidade_ref ->> 'data' = p_data::text
      and (av.bloco_id is null or av.classe <> g.classe_alvo)
  ),
  fechados as (
    update public.alertas a set
      status        = 'resolvido',
      resolvido_em  = now(),
      resolucao     = 'automatico',
      atualizado_em = now()
    from encerraveis e
    where a.id = e.id
    returning a.id, e.entidade_tipo, e.entidade_id,
              e.classe, e.situacao, e.token, e.guia, e.guia_fila
  ),
  ev_fechados as (
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome,
      descricao, metadata
    )
    select
      f.id, f.entidade_tipo, f.entidade_id,
      case when f.classe = 'concluido' then 'robo' else 'encerramento' end,
      case when f.classe = 'concluido' then 'robo' else 'sistema'      end,
      case when f.classe = 'concluido' then 'Robô' else 'Sistema'      end,
      -- A CLASSE decide a frase, e só depois o token/guia detalham. A ordem importa:
      -- uma linha de GLOSA também tem `guia` preenchida, então testar guia primeiro
      -- fazia um alerta reclassificado como glosa anunciar "Robô encontrou
      -- autorização" — o oposto do que aconteceu.
      case f.classe
        when 'concluido' then
          case
            when coalesce(f.token, '') <> '' then
              concat('Robô encontrou autorização. Token ', f.token,
                     case when f.guia is not null then concat(' · Guia ', f.guia) else '' end)
            when coalesce(f.guia, f.guia_fila) is not null then
              concat('Robô encontrou autorização. Guia ', coalesce(f.guia, f.guia_fila))
            else 'Guia válida registrada para o atendimento.'
          end
        when 'pendente_glosa'        then 'A ASSIM respondeu recusando. Reclassificado como glosa.'
        when 'pendente_sem_desfecho' then 'Atendimento voltou a ficar sem guia válida.'
        else 'Atendimento saiu da lista de pendências (falta, cancelamento ou sessão removida da agenda).'
      end,
      jsonb_build_object(
        'classe',   f.classe,
        'situacao', f.situacao,
        'token',    f.token,
        'guia',     coalesce(f.guia, f.guia_fila),
        'motivo',   case when f.classe is null then 'fora_da_agenda' else f.classe end
      )
    from fechados f
    returning 1
  )
  select
    (select count(*) from ev_novos),
    (select count(*) from ev_fechados)
  into v_gerados, v_encerrados;

  return jsonb_build_object(
    'ok',         true,
    'data',       p_data,
    'gerados',    v_gerados,
    'encerrados', v_encerrados
  );
end;
$$;

grant execute on function public.fn_alertas_avaliar_assim(date) to authenticated;

comment on function public.fn_alertas_avaliar_assim(date) is
  'Gera e encerra alertas ASSIM para uma data. Concluído = guia válida (fila.numero_autorizacao ou situacao LIBERADA) ∪ falta ∪ cancelamento; pendente é o complemento. Idempotente. Chamada pelo cron alertas-assim-avaliar.';

-- ── Cron ─────────────────────────────────────────────────────────────────────
-- A cada 10 min no horário de operação. A clínica atende 08:00–17:40 BRT, que em
-- UTC é 11:00–20:40; estendo até 22:00 UTC para pegar desfecho que chega no fim
-- do dia. Seg–Sex. Janela de 3 dias para pegar desfecho tardio.
--
-- Chamada plpgsql direta, não net.http_post para edge function como os outros
-- crons deste repo: não há nada de rede a fazer aqui, e evita a dependência do
-- token de service role no Vault.
do $$
begin
  perform cron.unschedule('alertas-assim-avaliar');
exception
  when others then null; -- não existia ainda
end $$;

select cron.schedule(
  'alertas-assim-avaliar',
  '*/10 11-22 * * 1-5',
  $cron$
  select public.fn_alertas_avaliar_assim(d::date)
  from generate_series(
    (now() at time zone 'America/Sao_Paulo')::date - 2,
    (now() at time zone 'America/Sao_Paulo')::date,
    interval '1 day'
  ) d;
  $cron$
);
