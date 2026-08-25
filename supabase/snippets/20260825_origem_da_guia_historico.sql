-- =============================================================================
-- A origem da guia no HISTÓRICO: dá para deduzir, ou fica NULL?
-- =============================================================================
--
-- `fila_autorizacoes.numero_autorizacao_origem` (migration 20260825000000) só é escrita
-- a partir de 25/08/2026. Tudo que veio antes fica NULL, e a tela não mostra rótulo — o
-- que é honesto, mas apaga a resposta justamente onde há mais dado para conferir.
--
-- Este snippet NÃO escreve nada. Ele mede se dois discriminantes que já existem no dado
-- separam robô de relatório com nitidez suficiente para justificar um backfill. Se
-- separarem, o backfill vem depois, em snippet próprio com dry-run (no formato de
-- 20260821_backfill_forma_do_relatorio.sql). Se não separarem, o histórico fica NULL e
-- pronto: a disciplina do de-para do `biofacial` vale aqui igual — código desconhecido
-- não vira chute.
--
-- ── OS DOIS DISCRIMINANTES, E POR QUE SÃO DOIS ───────────────────────────────────
--
-- (A) `completed_at` NULO, com guia e status 'concluido'.
--     `sync_assim_results` só passou a escrever `completed_at` em
--     20260814120000_sync_assim_conclui_pendente.sql. ANTES dessa data ele carimbava a
--     guia e o status e NÃO tocava em `completed_at` — enquanto
--     `robo_concluir_tarefa` SEMPRE grava `completed_at = now()`. Então, no período
--     anterior a 14/08/2026, "linha concluída com guia e sem completed_at" é linha que
--     o robô não concluiu. `reconciliar_guias_por_janela` também nunca escreveu
--     `completed_at`, e cai no mesmo balde — o que está certo, porque ele também é
--     guia vinda do extrato.
--
-- (B) `completed_at` EXATAMENTE igual ao `horario_autorizacao` convertido.
--     De 14/08/2026 em diante o sync grava
--     `completed_at = (data_execucao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'`
--     e `horario_autorizacao = data_execucao`. Os dois saem do MESMO valor, então a
--     igualdade é exata, ao segundo. O robô grava `completed_at = now()`, que é sempre
--     DEPOIS do instante lido no recibo — o RPA ainda espera a resposta do modal de
--     forma de validação, com timeout de até 10 minutos.
--
-- A previsão a confirmar é uma distribuição BIMODAL do delta: um pico cravado em zero
-- (sync) e um espalhamento positivo (robô). Se o pico em zero vazar para o outro lado —
-- por exemplo se houver robô com delta 0 porque o modal foi respondido no mesmo segundo
-- — o discriminante (B) não serve e o bloco 4 vai mostrar isso.
--
-- ── ATENÇÃO AOS FUSOS ────────────────────────────────────────────────────────────
-- `fila_autorizacoes` mistura dois fusos na mesma linha: `horario_autorizacao` está em
-- hora de São Paulo e `completed_at`/`started_at`/`created_at` em UTC, todos como
-- `timestamp without time zone`. Toda comparação abaixo converte explicitamente, com a
-- MESMA fórmula que o sync usa. Comparar cru dá um delta de 3 horas e a leitura inteira
-- fica errada, calada.

-- ---------------------------------------------------------------------------
-- Bloco 0 — o tamanho do problema
-- ---------------------------------------------------------------------------
-- Quantas linhas têm guia de verdade e nenhuma origem registrada? É a população que um
-- backfill atingiria. Linha de presença ('N/A') não é autorização ASSIM e fica fora de
-- tudo neste arquivo.
SELECT
  count(*)                                                          AS com_guia_sem_origem,
  min(data_atendimento)                                             AS mais_antiga,
  max(data_atendimento)                                             AS mais_recente,
  count(*) FILTER (WHERE data_atendimento <  DATE '2026-08-14')     AS antes_do_corte,
  count(*) FILTER (WHERE data_atendimento >= DATE '2026-08-14')     AS depois_do_corte
FROM public.fila_autorizacoes
WHERE numero_autorizacao IS NOT NULL
  AND numero_autorizacao <> 'N/A'
  AND numero_autorizacao_origem IS NULL;

-- ---------------------------------------------------------------------------
-- Bloco 1 — discriminante (A): completed_at nulo, no período em que ele valia
-- ---------------------------------------------------------------------------
-- Antes de 14/08/2026 o sync não escrevia completed_at e o robô sempre escrevia.
-- Espera-se `sem_completed_at` > 0 e concentrado no passado; se der zero, o
-- discriminante (A) não existe no estoque e o bloco 5 é o que sobra.
SELECT
  date_trunc('month', data_atendimento)::date                       AS mes,
  count(*)                                                          AS linhas_com_guia,
  count(*) FILTER (WHERE completed_at IS NULL)                      AS sem_completed_at,
  count(*) FILTER (WHERE completed_at IS NOT NULL)                  AS com_completed_at,
  round(100.0 * count(*) FILTER (WHERE completed_at IS NULL) / count(*), 1)
                                                                    AS pct_sem
FROM public.fila_autorizacoes
WHERE numero_autorizacao IS NOT NULL
  AND numero_autorizacao <> 'N/A'
  AND status = 'concluido'
GROUP BY 1
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- Bloco 2 — discriminante (B): a distribuição do delta
-- ---------------------------------------------------------------------------
-- O histograma que decide tudo. Se o desenho estiver certo, `delta = 0` concentra as
-- linhas do sync e nada mais, e as faixas positivas concentram o robô.
WITH base AS (
  SELECT
    f.id,
    f.data_atendimento,
    f.started_at,
    extract(epoch FROM (
      f.completed_at
      - ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
    ))::bigint AS delta_seg
  FROM public.fila_autorizacoes f
  WHERE f.numero_autorizacao IS NOT NULL
    AND f.numero_autorizacao <> 'N/A'
    AND f.completed_at        IS NOT NULL
    AND f.horario_autorizacao IS NOT NULL
)
SELECT
  CASE
    WHEN delta_seg =  0                        THEN '00 · exatamente zero'
    WHEN delta_seg <  0                        THEN '01 · NEGATIVO (investigar)'
    WHEN delta_seg <= 5                        THEN '02 · 1 a 5 s'
    WHEN delta_seg <= 60                        THEN '03 · 6 a 60 s'
    WHEN delta_seg <= 300                       THEN '04 · 1 a 5 min'
    WHEN delta_seg <= 900                       THEN '05 · 5 a 15 min'
    ELSE                                             '06 · acima de 15 min'
  END                                                               AS faixa,
  count(*)                                                          AS linhas,
  count(*) FILTER (WHERE started_at IS NULL)                        AS started_at_nulo,
  count(*) FILTER (WHERE started_at IS NOT NULL)                    AS started_at_preenchido,
  min(data_atendimento)                                             AS de,
  max(data_atendimento)                                             AS ate
FROM base
GROUP BY 1
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- Bloco 3 — a testemunha independente: started_at
-- ---------------------------------------------------------------------------
-- `started_at` é escrito SÓ por `robo_buscar_tarefa`, no mesmo UPDATE que grava
-- 'processando'. Guia sem `started_at` é guia que o robô nunca foi buscar — ambiguidade
-- zero, sem depender de fuso nem de versão do sync. A contrapartida é a cobertura: é um
-- subconjunto, porque a linha do incidente de 25/08 (RPA pegou, deu erro, atendente foi
-- ao portal) TEM started_at e ainda assim a guia veio do relatório. Por isso ele serve
-- de testemunha, não de regra.
SELECT
  count(*)                                                          AS com_guia,
  count(*) FILTER (WHERE started_at IS NULL)                        AS robo_nunca_pegou,
  count(*) FILTER (WHERE started_at IS NULL AND completed_at IS NULL)
                                                                    AS nunca_pegou_e_sem_completed,
  count(*) FILTER (WHERE started_at IS NOT NULL AND status = 'erro')
                                                                    AS pegou_e_deu_erro
FROM public.fila_autorizacoes
WHERE numero_autorizacao IS NOT NULL
  AND numero_autorizacao <> 'N/A';

-- ---------------------------------------------------------------------------
-- Bloco 4 — os dois discriminantes concordam?
-- ---------------------------------------------------------------------------
-- ESTE é o bloco que autoriza ou proíbe o backfill. A tabela cruzada tem de ser quase
-- diagonal:
--
--   delta = 0  &  started_at NULL      -> sync, sem dúvida         (esperado: muitos)
--   delta > 0  &  started_at NOT NULL  -> robô, sem dúvida         (esperado: muitos)
--   delta = 0  &  started_at NOT NULL  -> o caso do incidente de 25/08: o robô pegou,
--                                         falhou, e o sync trouxe a guia. Legítimo, e
--                                         é exatamente o que a coluna nova existe para
--                                         registrar. Conferir se o `status` destes
--                                         conta essa história (erro/pendente antes de
--                                         virar concluido).
--   delta > 0  &  started_at NULL      -> A CÉLULA QUE MATA O PLANO. Se ela for grande,
--                                         alguma outra coisa escreve completed_at e a
--                                         regra (B) não é confiável. Investigar antes
--                                         de qualquer UPDATE.
WITH base AS (
  SELECT
    (extract(epoch FROM (
      f.completed_at
      - ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
    ))::bigint = 0)                    AS delta_zero,
    (f.started_at IS NULL)             AS robo_nunca_pegou,
    f.status,
    f.data_atendimento
  FROM public.fila_autorizacoes f
  WHERE f.numero_autorizacao IS NOT NULL
    AND f.numero_autorizacao <> 'N/A'
    AND f.completed_at        IS NOT NULL
    AND f.horario_autorizacao IS NOT NULL
)
SELECT
  delta_zero,
  robo_nunca_pegou,
  count(*)                                                          AS linhas,
  string_agg(DISTINCT status, ', ' ORDER BY status)                  AS status_vistos,
  min(data_atendimento)                                             AS de,
  max(data_atendimento)                                             AS ate
FROM base
GROUP BY 1, 2
ORDER BY 1 DESC, 2 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 4b — amostra da célula perigosa, para olhar linha por linha
-- ---------------------------------------------------------------------------
-- Se o bloco 4 mostrar `delta > 0 AND started_at NULL` com volume, é aqui que se
-- descobre o porquê. Rodar mesmo que o volume seja pequeno: 20 linhas custam nada e
-- uma delas costuma explicar o padrão inteiro.
SELECT
  f.id,
  f.data_atendimento,
  f.horario,
  f.paciente_nome,
  f.status,
  f.machine_id,
  f.criado_por,
  f.numero_autorizacao,
  f.horario_autorizacao,
  f.completed_at,
  f.started_at,
  extract(epoch FROM (
    f.completed_at
    - ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
  ))::bigint                                                        AS delta_seg
FROM public.fila_autorizacoes f
WHERE f.numero_autorizacao IS NOT NULL
  AND f.numero_autorizacao <> 'N/A'
  AND f.completed_at        IS NOT NULL
  AND f.horario_autorizacao IS NOT NULL
  AND f.started_at          IS NULL
  AND extract(epoch FROM (
        f.completed_at
        - ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
      ))::bigint <> 0
ORDER BY f.data_atendimento DESC, f.horario DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- Bloco 5 — o que o backfill classificaria, se for aprovado
-- ---------------------------------------------------------------------------
-- PRÉVIA, não escrita. A regra combinada aplicada ao estoque, para ver o rateio antes
-- de decidir. `indefinido` é feature, não falha: é a fatia que fica NULL, e ela precisa
-- ficar NULL — a tela cala nessas linhas em vez de inventar.
--
-- Nota sobre a ordem dos ramos: 'relatorio' vem antes de 'robo' porque os testes de
-- sync são POSITIVOS (completed_at ausente ou exatamente igual) e o de robô é o resto.
-- Invertendo, todo delta 0 do sync viraria 'robo'.
SELECT
  CASE
    WHEN f.completed_at IS NULL                              THEN 'relatorio (sem completed_at)'
    WHEN f.horario_autorizacao IS NOT NULL
     AND extract(epoch FROM (
           f.completed_at
           - ((f.horario_autorizacao AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
         ))::bigint = 0                                      THEN 'relatorio (delta zero)'
    WHEN f.horario_autorizacao IS NOT NULL                   THEN 'robo (delta positivo)'
    ELSE                                                          'indefinido (sem horario_autorizacao)'
  END                                                               AS classificacao,
  count(*)                                                          AS linhas,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1)                AS pct,
  min(f.data_atendimento)                                           AS de,
  max(f.data_atendimento)                                           AS ate
FROM public.fila_autorizacoes f
WHERE f.numero_autorizacao IS NOT NULL
  AND f.numero_autorizacao <> 'N/A'
  AND f.numero_autorizacao_origem IS NULL
GROUP BY 1
ORDER BY 2 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 6 — sanidade do que a migration nova está gravando
-- ---------------------------------------------------------------------------
-- Rodar alguns dias DEPOIS de 20260825000000 estar em produção. É o teste de que o
-- write-once funciona: se 'relatorio' dominar as linhas com `started_at` preenchido e
-- `status` concluído pelo robô, o primeiro ramo do CASE do sync não está pegando e a
-- autoria do robô está sendo sobrescrita a cada rodada.
SELECT
  f.numero_autorizacao_origem,
  count(*)                                                          AS linhas,
  count(*) FILTER (WHERE f.started_at IS NULL)                      AS robo_nunca_pegou,
  count(*) FILTER (WHERE f.started_at IS NOT NULL)                  AS robo_pegou,
  string_agg(DISTINCT f.status, ', ' ORDER BY f.status)              AS status_vistos
FROM public.fila_autorizacoes f
WHERE f.data_atendimento >= DATE '2026-08-25'
  AND f.numero_autorizacao IS NOT NULL
  AND f.numero_autorizacao <> 'N/A'
GROUP BY 1
ORDER BY 2 DESC;
