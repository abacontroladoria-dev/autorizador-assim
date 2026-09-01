-- ============================================================================
-- sync-grade-csv: a rodada morria no primeiro bloco, calada
-- ----------------------------------------------------------------------------
-- Achado em 2026-09-01, pela tela: cronograma/indicadores?tab=profissionais
-- mostrava "Nenhum dado para o período 05/10 a 09/10". A grade terminava seca em
-- 30/09 — nenhuma linha de outubro — e os carimbos de `visto_em` contavam o
-- resto da história:
--
--     01/09          visto_em = 01/09 07:00   (a rodada de hoje)
--     02/09 a 11/09  visto_em = 27/08
--     14/09 a 30/09  visto_em = 20/08
--
-- Ou seja: cada rodada diária gravava UM bloco e morria. As faixas mais
-- distantes ficaram congeladas no dia em que alguma rodada antiga por acaso
-- chegou até elas, e outubro — do 5º ao 9º bloco da fila — nunca foi alcançado
-- por rodada nenhuma.
--
-- ─── Causa raiz ─────────────────────────────────────────────────────────────
--
-- 20260820120000 fez `fn_sync_grade_csv_em_lotes()` esperar SINCRONAMENTE a
-- resposta de cada `net.http_post`, com `pg_sleep` de até 130s por tentativa e
-- até 3 tentativas por bloco. Consertou o problema daquele dia (blocos falhando
-- em silêncio) e, sem querer, criou este: a função passou a precisar de 8 a 15
-- minutos no caminho feliz (9 blocos × 54-98s medidos) e até 60 no pior caso.
--
-- Só que ela não declara `statement_timeout` nenhum — nem por ALTER FUNCTION,
-- nem dentro do CREATE. Corre sob o default herdado pela role do cron, que é de
-- segundos. É abortada logo no começo, com o primeiro bloco já comitado e o
-- resto do laço simplesmente nunca executado.
--
-- É a MESMA armadilha já documentada em 20260824050000 e 20260820100000:
-- `SET statement_timeout` posto por ALTER FUNCTION não sobrevive a um
-- CREATE OR REPLACE. Por isso aqui ele vai declarado DENTRO do CREATE, onde a
-- próxima reescrita da função é obrigada a vê-lo.
--
-- ─── Por que ninguém foi avisado ────────────────────────────────────────────
--
-- O alerta `sync_grade_falhou` (criado em 20260820120000) só dispara quando um
-- bloco esgota as 3 tentativas. Um bloco que NUNCA CHEGA A RODAR não falha —
-- ele não acontece. O ponto cego durou 12 dias e foi descoberto por um usuário
-- olhando uma tela vazia, não pelo sistema.
--
-- Esta migration fecha os dois buracos:
--
--   1. `statement_timeout = 20min` declarado dentro do CREATE. Folga sobre os
--      ~15 min do pior caminho feliz, sem ser ilimitado — se um dia a rodada
--      passar disso, o certo é ela ser interrompida e alertar, não correr para
--      sempre segurando conexão.
--
--   2. Alerta novo `sync_grade_incompleta`, disparado quando o laço termina sem
--      ter coberto o horizonte inteiro. Diferente do alerta por bloco, este
--      pergunta "a rodada chegou ao fim?" — que é exatamente a pergunta que
--      ninguém estava fazendo. O laço agora também protege o próprio orçamento
--      de tempo: ao ultrapassar LIMITE_RODADA, para de propósito e alerta, em
--      vez de ser morto pelo statement_timeout no meio de um bloco.
--
-- Deliberadamente FORA de escopo: mudar a ordem da fila ou pular blocos com
-- `visto_em` recente. O laço recomeça em "hoje" todo dia, então re-sincroniza as
-- primeiras semanas (já atualizadas) antes de chegar às últimas (defasadas) —
-- é desperdício real, mas com o timeout corrigido a rodada inteira cabe no
-- orçamento, e otimizar isso agora seria consertar o que ainda não dói.
-- ============================================================================

insert into public.alertas_regras
  (codigo, modulo, nome, setor_destino, prioridade, tolerancia_minutos)
values
  ('sync_grade_incompleta', 'sync', 'Sincronização da grade não cobriu o horizonte', 'admin', 'alta', 0)
on conflict (codigo) do nothing;

create or replace function public.fn_sync_grade_csv_em_lotes()
returns void
language plpgsql
security definer
set search_path = public
-- Ver o cabeçalho desta migration: sem isto a função é morta no primeiro bloco.
-- Declarado AQUI, e não por ALTER FUNCTION, porque ALTER não sobrevive ao
-- próximo CREATE OR REPLACE (20260824050000 pagou essa conta).
set statement_timeout = '20min'
as $$
declare
  v_hoje         date := (now() at time zone 'America/Sao_Paulo')::date;
  -- Mesma fórmula de getDefaultRange() em supabase/functions/sync-grade-csv/index.ts:
  -- fim do mês seguinte ao atual.
  v_fim          date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + interval '2 months' - interval '1 day')::date;
  v_chunk_inicio date := v_hoje;
  v_chunk_fim    date;
  v_token        text;
  v_tentativa    int;
  v_request_id   bigint;
  v_status_code  int;
  v_error_msg    text;
  v_espera       int;
  v_ok           boolean;
  v_inicio_rodada timestamptz := clock_timestamp();
  -- Orçamento próprio, menor que o statement_timeout acima. Estourar este limite
  -- é uma parada ORDENADA (com alerta); estourar o statement_timeout seria uma
  -- morte no meio de um bloco, que é o que esta migration existe para evitar.
  v_limite_rodada interval := interval '17 minutes';
  v_interrompida  boolean := false;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cron_service_role_key';

  while v_chunk_inicio <= v_fim loop
    -- Antes de começar mais um bloco, checa se ainda há tempo para ele. Um bloco
    -- leva de 1 a 7 minutos; começar um sem orçamento é garantir uma morte suja.
    if clock_timestamp() - v_inicio_rodada > v_limite_rodada then
      v_interrompida := true;
      exit;
    end if;

    v_chunk_fim := least(v_chunk_inicio + 6, v_fim);
    v_ok := false;

    <<tentativas>>
    for v_tentativa in 1..3 loop
      v_status_code := null;
      v_error_msg   := null;

      v_request_id := net.http_post(
        url     := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/sync-grade-csv',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_token,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object('data_inicio', v_chunk_inicio::text, 'data_fim', v_chunk_fim::text),
        timeout_milliseconds := 120000
      );

      -- Espera síncrona pela resposta real (net.http_post só enfileira e
      -- retorna na hora). Poll a cada 2s por até 130s — 10s de folga sobre o
      -- timeout_milliseconds acima, tempo suficiente para o pg_net terminar de
      -- gravar a linha de resposta mesmo quando a chamada expira no limite.
      for v_espera in 1..65 loop
        perform pg_sleep(2);
        select r.status_code, r.error_msg
          into v_status_code, v_error_msg
          from net._http_response r
         where r.id = v_request_id;
        exit when v_status_code is not null or v_error_msg is not null;
      end loop;

      if v_status_code = 200 then
        v_ok := true;
        exit tentativas;
      end if;

      -- Pequena pausa antes de tentar de novo — não faz sentido reatacar no
      -- mesmo instante em que acabou de falhar.
      if v_tentativa < 3 then
        perform pg_sleep(5);
      end if;
    end loop tentativas;

    if not v_ok then
      with novo as (
        insert into public.alertas (
          modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
          titulo, descricao, prioridade, status, setor_destino, fingerprint
        ) values (
          'sync', 'sync_grade_falhou', 'sistema', 'sync_grade_chunk',
          concat(v_chunk_inicio::text, '_', v_chunk_fim::text),
          jsonb_build_object(
            'data_inicio', v_chunk_inicio::text, 'data_fim', v_chunk_fim::text,
            'status_code', v_status_code, 'error_msg', v_error_msg
          ),
          concat('Grade futura não sincronizou: ', v_chunk_inicio::text, ' a ', v_chunk_fim::text),
          concat(
            'As 3 tentativas falharam. Último resultado: ',
            coalesce('HTTP ' || v_status_code::text, coalesce(v_error_msg, 'sem resposta')),
            '. A grade desse período pode estar desatualizada até a próxima rodada — considere reexecutar manualmente.'
          ),
          'alta', 'aberto', 'admin',
          -- Inclui v_hoje: o mesmo intervalo de datas pode voltar a aparecer em
          -- rodadas de dias diferentes (a janela desliza a partir de "hoje"), e
          -- cada rodada que falhar merece seu próprio alerta, não um só que
          -- nunca mais reabre depois de resolvido.
          concat_ws('|', 'sync_grade_csv', v_hoje::text, v_chunk_inicio::text, v_chunk_fim::text)
        )
        on conflict do nothing
        returning id
      )
      insert into public.alertas_eventos (
        alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao
      )
      select
        novo.id, 'sync_grade_chunk', concat(v_chunk_inicio::text, '_', v_chunk_fim::text),
        'deteccao', 'sistema', 'Sistema',
        concat('Sistema detectou falha ao sincronizar o bloco ', v_chunk_inicio::text, ' a ', v_chunk_fim::text, ' após 3 tentativas.')
      from novo;
    end if;

    v_chunk_inicio := v_chunk_fim + 1;
  end loop;

  -- ─── A rodada cobriu o horizonte inteiro? ─────────────────────────────────
  --
  -- A pergunta que faltava. O alerta por bloco só enxerga bloco que FALHOU;
  -- bloco não alcançado é invisível para ele, e foi assim que 12 dias de grade
  -- defasada passaram sem ninguém saber. Aqui o critério é outro: sobrou
  -- horizonte por percorrer?
  if v_interrompida or v_chunk_inicio <= v_fim then
    with novo as (
      insert into public.alertas (
        modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
        titulo, descricao, prioridade, status, setor_destino, fingerprint
      ) values (
        'sync', 'sync_grade_incompleta', 'sistema', 'sync_grade_rodada',
        v_hoje::text,
        jsonb_build_object(
          'parou_em',        v_chunk_inicio::text,
          'horizonte_fim',   v_fim::text,
          'dias_faltantes',  (v_fim - v_chunk_inicio) + 1,
          'duracao_segundos', round(extract(epoch from (clock_timestamp() - v_inicio_rodada)))
        ),
        concat('Grade futura sincronizada só até ', (v_chunk_inicio - 1)::text),
        concat(
          'A rodada parou em ', v_chunk_inicio::text, ', mas o horizonte vai até ', v_fim::text,
          ' — faltaram ', ((v_fim - v_chunk_inicio) + 1)::text, ' dias. ',
          'A grade desse período está desatualizada e as telas que dependem dela ',
          '(cronograma/indicadores, ocupação de paciente) podem aparecer vazias.'
        ),
        'alta', 'aberto', 'admin',
        concat_ws('|', 'sync_grade_incompleta', v_hoje::text)
      )
      on conflict do nothing
      returning id
    )
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao
    )
    select
      novo.id, 'sync_grade_rodada', v_hoje::text,
      'deteccao', 'sistema', 'Sistema',
      concat('Sistema detectou rodada incompleta: parou em ', v_chunk_inicio::text, ', horizonte ia até ', v_fim::text, '.')
    from novo;
  end if;
end;
$$;

comment on function public.fn_sync_grade_csv_em_lotes() is
  'Sincroniza a grade futura da TiTa em blocos de 7 dias, um por vez, esperando a resposta real de cada net.http_post (não só o enfileiramento). Até 3 tentativas por bloco; se todas falharem, abre alerta sync_grade_falhou. Se a rodada terminar sem cobrir o horizonte inteiro, abre alerta sync_grade_incompleta. O statement_timeout de 20min é declarado DENTRO do CREATE de propósito: sem ele a função era morta no primeiro bloco (incidente de 2026-09-01, outubro inteiro sem grade), e posto por ALTER FUNCTION ele não sobreviveria ao próximo CREATE OR REPLACE.';
