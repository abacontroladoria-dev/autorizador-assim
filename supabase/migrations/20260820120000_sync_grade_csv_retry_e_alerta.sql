-- ============================================================================
-- sync-grade-csv: retry + alerta quando um bloco falha em silêncio
-- ----------------------------------------------------------------------------
-- Incidente de 2026-08-20: a rodada das 05:00 UTC (sync-grade-csv-daily) falhou
-- com HTTP 500 nos 6 blocos da grade FUTURA (nenhum chegou a gravar), e ninguém
-- percebeu porque `cron.job_run_details.status = 'succeeded'` só confirma que o
-- SQL enfileirou a chamada em `net.http_post` — nunca o resultado real da
-- chamada HTTP (esse resultado mora em `net._http_response`, tabela de retenção
-- curta, já vazia horas depois quando fomos olhar). A grade futura ficou 1 dia
-- inteiro desatualizada: um horário ocupado (profissional 18413, paciente
-- "Horário Bloqueado") foi ofertado como livre em cronograma/ocupacao-paciente
-- (ver [[project-grade-tita-status-divergente-mariana]] na memória do agente).
--
-- Esta migration reescreve fn_sync_grade_csv_em_lotes() para:
--
--   1. Esperar SINCRONAMENTE a resposta de cada net.http_post (poll em
--      net._http_response) em vez de disparar os ~9-11 blocos em sequência
--      apertada sem saber o resultado de nenhum. Efeito colateral bom: os
--      blocos passam a rodar em SÉRIE de verdade (um só começa depois que o
--      anterior terminou ou expirou) — a rodada de hoje disparou as 6 chamadas
--      quase simultâneas e TODAS morreram com tempo de execução parecido
--      (~98s), o que é compatível com elas competindo entre si por recurso.
--   2. Tentar até 3 vezes por bloco antes de desistir dele.
--   3. Se as 3 tentativas falharem, abrir um alerta na Central de Alertas
--      (mesma infra de 20260730100000_create_alertas_infra.sql, já usada pelos
--      alertas automáticos da ASSIM) em vez de falhar em silêncio.
--      setor_destino='admin': a policy de leitura já dá a quem tem papel
--      admin/diretoria/autorizacao visão de TODOS os alertas, não só os do
--      próprio setor — não precisa de setor novo nem de mudança na UI.
--
-- Deliberadamente FORA de escopo: reduzir o tamanho do bloco de 7 dias. Testei
-- manualmente o MESMO bloco que falhou hoje de manhã (2026-08-27→2026-09-02) e
-- ele rodou limpo em 54s — não há evidência de que 7 dias seja grande demais em
-- si; a falha de hoje foi pontual. Sem retry, o sistema não tinha como
-- distinguir "bloco grande demais" de "instabilidade de um dia" — retry +
-- alerta cobre os dois casos sem precisar decidir qual foi.
-- ============================================================================

-- Regra nova na Central de Alertas (mesma tabela de catálogo da ASSIM).
insert into public.alertas_regras
  (codigo, modulo, nome, setor_destino, prioridade, tolerancia_minutos)
values
  ('sync_grade_falhou', 'sync', 'Sincronização da grade futura falhou', 'admin', 'alta', 0)
on conflict (codigo) do nothing;

create or replace function public.fn_sync_grade_csv_em_lotes()
returns void
language plpgsql
security definer
set search_path = public
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
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'cron_service_role_key';

  while v_chunk_inicio <= v_fim loop
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
end;
$$;

comment on function public.fn_sync_grade_csv_em_lotes() is
  'Sincroniza a grade futura da TiTa em blocos de 7 dias, um por vez, esperando a resposta real de cada net.http_post (não só o enfileiramento). Até 3 tentativas por bloco; se todas falharem, abre alerta em public.alertas (regra sync_grade_falhou) em vez de falhar em silêncio. Ver comentário no topo desta migration para o incidente que motivou a mudança.';
