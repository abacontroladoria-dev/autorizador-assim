-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
--
-- POR QUE ESTE ARQUIVO EXISTE: rodar snippets/20260813_glosa_no_aceite.sql
-- inteiro hoje FALHA com
--
--   42P13: cannot change return type of existing function
--   HINT: Use DROP FUNCTION listar_central_autorizacoes(date) first.
--
-- Nao e defeito do snippet: e o Postgres impedindo um retrocesso. Aquele arquivo
-- foi escrito em 2026-08-13, antes de 20260814130000 acrescentar `criado_por` a
-- listar_central_autorizacoes. A funcao em producao hoje tem 25 colunas (com
-- criado_por, MEDIDO em 2026-08-20); o CREATE OR REPLACE do snippet antigo
-- tentaria devolve-la para 24 e apagar o "Solicitado por" da /solicitar.
--
-- E o resto daquele lote JA ESTA EM PRODUCAO. Medido em 2026-08-20:
--   - robo_concluir_tarefa aceita p_status_assim (responde 28000 "token
--     invalido", nao PGRST202 "function not found") -> 20260813130000 aplicada;
--   - listar_central_autorizacoes devolve criado_por, e a versao que o traz
--     (20260814130000) ja embute os dois ramos de glosa -> o efeito de
--     20260813130100 esta la, por caminho diferente;
--   - fila_autorizacoes tem linhas status='glosa' desde 2026-08-03.
--
-- O QUE SOBRA: so a funcao de alerta (20260813130200), que este arquivo aplica
-- por CREATE OR REPLACE — no-op se ja estiver na versao certa, e que preserva os
-- grants (o REVOKE de 20260817140000 continua valendo). Mais o registro das tres
-- versoes no livro-caixa, para um `db push` futuro nao reaplicar a 130100 por
-- cima e reverter o criado_por.
--
-- OBSERVACAO: as duas regras do modulo 'assim' em alertas_regras estao com
-- ativo=false hoje, entao esta funcao sai no primeiro IF sem gerar alerta
-- nenhum. Aplicar agora e preparo, nao mudanca de comportamento.

begin;

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

  -- Desfecho que o robô colheu na tela do aceite. Agrupado porque a chave da fila
  -- (empresa/matricula/dep/tuss/horario) pode ter mais de uma linha histórica.
  --
  -- Dois sinais, não um. `tem_guia_aceite` é o que esta CTE já entregava (guia
  -- vinculada a uma conclusão) e continua idêntico — o filtro de status saiu do
  -- WHERE e virou condição do bool_or para não excluir a linha de glosa antes de
  -- olhar para ela. `tem_glosa` é o sinal novo: a ASSIM recusou, e isso foi lido
  -- no recibo, não no relatório.
  fila_desfecho as (
    select f.empresa, f.matricula, f.dep, f.tuss, f.horario,
           bool_or(f.status = 'concluido' and f.numero_autorizacao is not null)
                                                                  as tem_guia_aceite,
           bool_or(f.status = 'glosa')                             as tem_glosa,
           -- Só de linha com desfecho. Sem o filter, o WHERE afrouxado deixaria
           -- entrar guia de linha em 'erro'/'cancelado', que a versão anterior
           -- desta CTE nunca enxergou.
           max(f.numero_autorizacao) filter (
             where f.status in ('concluido', 'glosa')
           )                                                       as numero_autorizacao,
           max(f.status_assim) filter (where f.status = 'glosa')   as motivo_glosa
    from public.fila_autorizacoes f
    where f.data_atendimento = p_data
    group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
  ),

  -- Classifica cada bloco do dia. 'concluido' encerra; as duas classes
  -- 'pendente_*' sustentam a regra correspondente.
  avaliado as (
    select
      s.*,
      fd.numero_autorizacao as guia_fila,
      fd.motivo_glosa,
      case
        -- (1) guia colhida no aceite pelo robô
        when fd.tem_guia_aceite                      then 'concluido'
        -- (2) autorizacoes_assim confirmou liberação, ou o atendimento foi cancelado
        when s.situacao in ('LIBERADA', 'CANCELADA') then 'concluido'
        -- (3) convênio respondeu recusando
        when s.situacao = 'GLOSA'                    then 'pendente_glosa'
        -- (4) recusa lida pelo robô no recibo do aceite, antes de o relatório
        --     existir. Vem DEPOIS de (2) de propósito: o recibo diz "sujeito a
        --     análise posterior", então uma liberação no relatório tem que poder
        --     desfazer esta classificação.
        when fd.tem_glosa                            then 'pendente_glosa'
        -- (5) NAO_SOLICITADA, SINCRONIZANDO, RETORNO_NAO_CONFIRMADO e qualquer
        --     estado futuro: nada de guia, nada de falta -> continua pendente
        else                                              'pendente_sem_desfecho'
      end as classe
    from src s
    left join fila_desfecho fd
      on  fd.empresa  = s.empresa
      and fd.matricula = s.matricula
      and fd.dep      = s.dep
      and fd.tuss     = s.codigo_tuss
      and fd.horario  = s.hora_inicial
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
        -- Na glosa antecipada não existe codigo_erro (ele vem do relatório). O
        -- motivo lido no recibo já chega no formato "1013-CADASTRO ...", então o
        -- código é o que vem antes do primeiro hífen.
        'codigo_erro',   coalesce(a.codigo_erro, split_part(a.motivo_glosa, '-', 1)),
        'situacao',      a.situacao
      ),
      g.nome,
      case
        when a.classe = 'pendente_glosa' then
          concat('A ASSIM recusou a autorização de ',
                 coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'), '. ',
                 coalesce(nullif(a.codigo_erro, '') || ' - ', ''),
                 -- Só o primeiro hífen vira separador: o resto pertence ao texto
                 -- do motivo e não pode ser tocado.
                 coalesce(a.descricao_erro,
                          regexp_replace(a.motivo_glosa, '^(\d+)-', '\1 - '),
                          'Sem descrição do erro.'))
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


insert into supabase_migrations.schema_migrations (version, name) values
  ('20260813130000','robo_conclui_glosa'),
  ('20260813130100','solicitar_reconhece_glosa'),
  ('20260813130200','alerta_glosa_no_aceite')
on conflict (version) do nothing;

commit;

-- =============================================================================
-- Conferencia 1: listar_central_autorizacoes NAO pode ter perdido criado_por.
-- Esperado: uma linha, com criado_por presente.
-- =============================================================================
select p.oid::regprocedure as assinatura,
       (pg_get_function_result(p.oid) like '%criado_por%') as tem_criado_por
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'listar_central_autorizacoes';

-- =============================================================================
-- Conferencia 2: o lote de 13/08 consta no livro-caixa.
-- =============================================================================
select version, name
  from supabase_migrations.schema_migrations
 where version in ('20260813130000','20260813130100','20260813130200',
                   '20260814130000','20260820140000','20260820150000')
 order by version;
