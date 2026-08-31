-- =============================================================================
-- Resumo diário da Auditoria ASSIM — a leitura de gestão por intervalo
-- =============================================================================
-- A aba `/auditoria-assim?tab=auditoria` entrega o dia. Faltava a pergunta de
-- gestão: quantas glosas no mês, na semana, num intervalo qualquer. Somar isso
-- ao vivo é o caminho que derruba o sistema — ver o diagnóstico de 24/08:
-- o pool do PostgREST é de 10 conexões e a role `authenticated` corta em 8 s,
-- então uma tela que segura conexão por segundos faz TUDO virar 504.
--
-- E não é hipótese: `get_auditoria_assim_periodo` já estoura o statement_timeout
-- numa janela de SETE DIAS (a semana de 01–07/08/2026 teve de ser rodada dia a
-- dia — ver 20260821000000, linhas 158-162). Um mês ao vivo não existe.
--
-- A SOLUÇÃO É O PADRÃO QUE JÁ FUNCIONA AQUI
-- Mesmo desenho de 20260708010000 (cache do dashboard): tabela com RLS ligada e
-- SEM policy, refresh pesado em SECURITY DEFINER rodando por cron, leitura por
-- RPC trivial. O cálculo caro sai do caminho do usuário e passa a rodar
-- serializado e previsível, nunca em estouro simultâneo.
--
-- A DECISÃO DE DESENHO QUE IMPORTA: O SQL NÃO SABE O QUE É UM CARD
-- Os onze KPIs da tela NÃO são calculados no banco. Desde a otimização que
-- eliminou o 3º round-trip, eles são derivados em TypeScript
-- (frontend/components/auditoria-assim/kpisAuditoria.ts). Se esta migration
-- reescrevesse essa regra em SQL, "37 glosas" no modal e "37 glosas" no card
-- passariam a ser dois números com duas definições — e divergiriam no primeiro
-- estado novo que alguém acrescentasse a só um dos lados.
--
-- Por isso a tabela guarda a `situacao` CRUA, do jeito que a RPC devolve, e a
-- contagem por combinação de dimensões. Quem transforma situação em card
-- continua sendo o mesmo TypeScript que a tela diária usa, agora somando com
-- peso em vez de somar de um em um. É a mesma disciplina de `situacoes.ts`, um
-- nível acima.
--
-- E É POR ISSO QUE A GRANULARIDADE É FINA
-- Uma linha por dia com onze colunas responderia "quantas glosas" e mais nada.
-- Guardando (data, situação, token, TUSS, terapia, sala, código de glosa), a
-- MESMA consulta responde o total, a evolução no tempo e a quebra por
-- motivo/terapia/unidade. O volume não cobra por isso: o número de combinações
-- distintas num dia é limitado pelo número de sessões daquele dia, então um mês
-- fica na casa de poucos milhares de linhas estreitas.
--
-- NÃO SE GUARDA `unidade`, SE GUARDA `sala_nome`
-- O de-para sala→unidade vive em `mapearUnidade`
-- (frontend/lib/cronograma/comparativoSessoes.ts) e é o mesmo que o resto do
-- sistema aplica. Traduzir aqui criaria uma segunda cópia da regra, que
-- envelhece sozinha e em silêncio. Guardando a sala crua, o front reusa o
-- helper que já existe — inclusive o descarte de "Consertar Unidade no
-- Sistema", que é falha de cadastro e não unidade.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────────────────────
-- Os textos anuláveis entram como '—' e não como NULL: NULL não se compara a
-- NULL, então uma PK com NULL deixaria o ON CONFLICT passar batido e a cada
-- refresh a mesma combinação viraria uma linha nova. O sentinela é o que faz a
-- chave ser realmente uma chave.
-- `paciente_id` e `paciente_nome` entram na chave porque a tela precisa buscar
-- por nome, e porque "quais pacientes mais geram glosa" é a pergunta gerencial
-- seguinte à contagem. O custo é aceitável e medido em desenho: o paciente com
-- duas sessões da mesma terapia, sala e situação no mesmo dia continua
-- COLAPSANDO numa linha com `sessoes = 2`, então a granularidade fica na ordem
-- de uma linha por sessão distinta, não por sessão.
--
-- Os dois juntos, e não só o nome: homônimo existe nesta base (está anotado em
-- `PacientePendencias`), e somar duas pessoas diferentes numa linha só porque
-- se chamam igual seria errar calado. O id separa; o nome é o que se lê.
CREATE TABLE IF NOT EXISTS public.auditoria_assim_resumo_diario (
  data           date        NOT NULL,
  paciente_id    text        NOT NULL,
  paciente_nome  text        NOT NULL,
  situacao       text        NOT NULL,
  teve_token     boolean     NOT NULL,
  codigo_tuss    text        NOT NULL,
  terapia        text        NOT NULL,
  sala_nome      text        NOT NULL,
  codigo_glosa   text        NOT NULL,
  sessoes        integer     NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  -- O dia já passou da janela de atraso e não muda mais. Ver a nota do cron.
  fechado        boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (data, paciente_id, situacao, teve_token, codigo_tuss, terapia, sala_nome, codigo_glosa)
);

-- A PK já começa por `data`, mas o índice dela é composto de sete colunas; para
-- a leitura por intervalo (o único predicado que o modal usa) um índice estreito
-- em `data` é bem mais barato de varrer.
CREATE INDEX IF NOT EXISTS idx_auditoria_resumo_data
  ON public.auditoria_assim_resumo_diario (data);

ALTER TABLE public.auditoria_assim_resumo_diario ENABLE ROW LEVEL SECURITY;

-- RLS ligada e SEM policy, como em dashboard_kpis_cache: só as funções
-- SECURITY DEFINER (owner = postgres) leem e escrevem. O Supabase concede
-- INSERT/UPDATE/DELETE a `anon` em toda tabela nova do schema public, então o
-- revoke não é zelo — é desfazer uma concessão automática.
REVOKE ALL ON public.auditoria_assim_resumo_diario FROM anon;
REVOKE ALL ON public.auditoria_assim_resumo_diario FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. refresh_auditoria_assim_resumo(de, ate)
-- ─────────────────────────────────────────────────────────────────────────────
-- O LAÇO DIA A DIA É DELIBERADO, E É O CONTRÁRIO DE UM DESCUIDO.
--
-- Chamar `get_auditoria_assim_periodo(de, ate)` uma vez parece óbvio e é o
-- caminho errado: sete dias de uma vez estouram o statement_timeout (registrado
-- em 20260821000000) e `get_tokens_mensal` já precisou de um fix de timeout pelo
-- mesmo motivo. A função é `LANGUAGE sql STABLE` sem security definer, sem
-- search_path e sem statement_timeout próprios — ela corre sob os limites de
-- quem chama. Aqui, no cron com dono `postgres`, não existe o corte de 8 s da
-- role `authenticated`, e é exatamente por isso que o laço funciona neste lugar
-- e a chamada larga não funcionaria em lugar nenhum.
--
-- O que se compra pagando essa lentidão em segundo plano: o resumo é
-- byte-idêntico ao que a tela mostraria naquele dia, porque chama AS MESMAS
-- DUAS RPCs que a tela chama. Nenhuma regra reescrita, nenhuma chance de
-- divergir. (O laço equivalente em `get_candidatas_vinculo` custou 55 s — mas
-- ali ele estava no caminho do usuário, que é a diferença inteira.)
--
-- `statement_timeout` vai declarado DENTRO do CREATE: posto por ALTER FUNCTION
-- ele morre calado no próximo CREATE OR REPLACE, que foi como get_tokens_mensal
-- perdeu o dele uma vez.
CREATE OR REPLACE FUNCTION public.refresh_auditoria_assim_resumo(
  p_de     date,
  p_ate    date,
  p_forcar boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20min'
AS $$
DECLARE
  v_dia        date := p_de;
  v_gravadas   integer := 0;
  v_no_dia     integer;
  -- 45 dias é a janela de atraso já medida para a evolução chegar. Depois dela
  -- o dia para de mudar e não precisa mais ser recontado.
  v_corte      date := current_date - 45;
BEGIN
  WHILE v_dia <= p_ate LOOP
    -- Dia fechado não se recalcula. É o que impede a passada larga do cron de
    -- crescer sem limite conforme a base envelhece: ela custa sempre o mesmo,
    -- porque só toca a janela ainda aberta.
    IF p_forcar OR NOT EXISTS (
      SELECT 1 FROM public.auditoria_assim_resumo_diario r
      WHERE r.data = v_dia AND r.fechado
    ) THEN
      -- DELETE + INSERT, não upsert: um dia pode PERDER sessões (reagendamento,
      -- linha desativada na grade). Só o upsert deixaria a combinação antiga
      -- para trás, e ela seguiria sendo somada para sempre.
      DELETE FROM public.auditoria_assim_resumo_diario WHERE data = v_dia;

      WITH sessoes AS (
        SELECT
          r.paciente_id,
          r.paciente_nome,
          r.hora_inicial,
          r.situacao,
          r.teve_token,
          r.codigo_tuss,
          r.terapias      AS terapia,
          r.codigo_erro   AS codigo_glosa
        FROM public.get_auditoria_assim(v_dia) r

        UNION ALL

        -- As faltas vêm de uma RPC separada e são sintetizadas aqui do mesmo
        -- jeito que `listarFaltasAuditoria` faz no cliente. Elas não colidem
        -- com as linhas acima: `get_auditoria_assim` já faz o anti-join contra
        -- a fila, então uma sessão que virou falta não aparece dos dois lados.
        SELECT
          f.paciente_id,
          f.paciente_nome,
          f.hora_inicial,
          CASE WHEN f.tipo_falta ILIKE '%terapeuta%'
               THEN 'FALTA_TERAPEUTA' ELSE 'FALTA' END,
          NULL::boolean,
          f.tuss,
          f.terapia_nome,
          NULL::text
        FROM public.get_faltas_auditoria_assim(v_dia) f
      ),
      -- A sala sai de agenda_tita, que é onde ela sempre morou — nem a auditoria
      -- nem autorizacoes_assim carregam unidade. Recortada PRIMEIRO pelo dia,
      -- vira um punhado de linhas (usa idx_agenda_tita_data_ativo), e só então
      -- se cruza com as sessões. Fazendo assim, o cast de paciente_id acontece
      -- sobre esse punhado e não sobre a tabela inteira — nenhum índice é
      -- perdido, que é a armadilha de `paciente_id::bigint` documentada em
      -- 20260824020000.
      --
      -- `ativo = true` não é zelo: sem ele a linha reagendada continua
      -- respondendo e a sessão aparece em duas salas ao mesmo tempo.
      salas AS (
        SELECT
          a.paciente_id::text AS paciente_id,
          a.hora_inicial,
          min(a.sala_nome)    AS sala_nome
        FROM public.agenda_tita a
        WHERE a.data_atendimento = v_dia
          AND a.ativo = true
        GROUP BY a.paciente_id, a.hora_inicial
      )
      INSERT INTO public.auditoria_assim_resumo_diario
        (data, paciente_id, paciente_nome, situacao, teve_token, codigo_tuss,
         terapia, sala_nome, codigo_glosa, sessoes, atualizado_em, fechado)
      SELECT
        v_dia,
        COALESCE(NULLIF(btrim(s.paciente_id), ''), '—'),
        COALESCE(NULLIF(btrim(s.paciente_nome), ''), '—'),
        s.situacao,
        COALESCE(s.teve_token, false),
        COALESCE(NULLIF(btrim(s.codigo_tuss), ''), '—'),
        COALESCE(NULLIF(btrim(s.terapia), ''), '—'),
        COALESCE(NULLIF(btrim(sl.sala_nome), ''), '—'),
        COALESCE(NULLIF(btrim(s.codigo_glosa), ''), '—'),
        count(*),
        now(),
        v_dia < v_corte
      FROM sessoes s
      LEFT JOIN salas sl
        ON sl.paciente_id = s.paciente_id
       AND sl.hora_inicial = s.hora_inicial
      -- Linha sem situação não existe no vocabulário da tela e não pode virar
      -- um card fantasma no modal.
      WHERE s.situacao IS NOT NULL
      GROUP BY
        COALESCE(NULLIF(btrim(s.paciente_id), ''), '—'),
        COALESCE(NULLIF(btrim(s.paciente_nome), ''), '—'),
        s.situacao,
        COALESCE(s.teve_token, false),
        COALESCE(NULLIF(btrim(s.codigo_tuss), ''), '—'),
        COALESCE(NULLIF(btrim(s.terapia), ''), '—'),
        COALESCE(NULLIF(btrim(sl.sala_nome), ''), '—'),
        COALESCE(NULLIF(btrim(s.codigo_glosa), ''), '—');

      GET DIAGNOSTICS v_no_dia = ROW_COUNT;
      v_gravadas := v_gravadas + v_no_dia;
    END IF;

    v_dia := v_dia + 1;
  END LOOP;

  RETURN v_gravadas;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_auditoria_assim_resumo(de, ate) — a leitura do modal
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT trivial na tabela: é a razão de a tela abrir instantânea. O teto de
-- 400 dias existe porque o campo "de" é digitado à mão — um ano errado pediria
-- a base inteira e transformaria a tela leve numa consulta pesada de novo.
--
-- A ORDENAÇÃO NÃO É ENFEITE — É O QUE TORNA A PAGINAÇÃO CORRETA.
-- O PostgREST corta a resposta em `max_rows = 1000` (supabase/config.toml), e o
-- cliente pagina com `.range()`. Sem uma ordenação TOTAL, duas páginas
-- consecutivas podem repetir e pular linhas em silêncio — o mesmo defeito que
-- fez a paginação da fila perder 16% dos registros sem avisar ninguém. Por isso
-- a cláusula abaixo ordena por todas as colunas da chave primária, que juntas
-- são únicas por construção.
CREATE OR REPLACE FUNCTION public.get_auditoria_assim_resumo(p_de date, p_ate date)
RETURNS TABLE(
  data          date,
  paciente_id   text,
  paciente_nome text,
  situacao      text,
  teve_token    boolean,
  codigo_tuss   text,
  terapia       text,
  sala_nome     text,
  codigo_glosa  text,
  sessoes       integer,
  atualizado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
  SELECT r.data, r.paciente_id, r.paciente_nome, r.situacao, r.teve_token,
         r.codigo_tuss, r.terapia, r.sala_nome, r.codigo_glosa, r.sessoes,
         r.atualizado_em
  FROM public.auditoria_assim_resumo_diario r
  WHERE r.data BETWEEN p_de AND p_ate
    AND (p_ate - p_de) <= 400
  ORDER BY r.data, r.paciente_id, r.situacao, r.teve_token, r.codigo_tuss,
           r.terapia, r.sala_nome, r.codigo_glosa;
$$;

GRANT EXECUTE ON FUNCTION public.get_auditoria_assim_resumo(date, date)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_auditoria_assim_resumo(date, date, boolean) TO service_role;

-- O EXECUTE implícito a PUBLIC é o que a auditoria de advisors apontou como
-- causa-raiz de 47 de 55 funções expostas. Não repetir aqui.
REVOKE EXECUTE ON FUNCTION public.get_auditoria_assim_resumo(date, date)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_auditoria_assim_resumo(date, date, boolean) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Semeadura e agendamento
-- ─────────────────────────────────────────────────────────────────────────────
-- Semeia só os últimos 7 dias para a tela não nascer vazia. O histórico é
-- trabalho do backfill em lotes (supabase/snippets/), que não deve prender esta
-- migration.
SELECT public.refresh_auditoria_assim_resumo(current_date - 7, current_date);

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-auditoria-assim-resumo-recente');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-auditoria-assim-resumo-janela');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- A cada 15 min em horário comercial: os últimos 7 dias. É o frescor que a
-- tela de gestão precisa (o combinado com o usuário foi 15–30 min).
SELECT cron.schedule(
  'refresh-auditoria-assim-resumo-recente',
  '*/15 9-23 * * *',
  $cron$SELECT public.refresh_auditoria_assim_resumo(current_date - 7, current_date)$cron$
);

-- Uma vez por noite: a janela de 45 dias ainda aberta. Existe porque
-- autorização e glosa CHEGAM ATRASADAS — a glosa vem do sync do relatório, não
-- do atendimento. Sem esta passada, um dia fechado há três semanas nunca seria
-- recontado e o mês passado ficaria congelado errado. Os dias já marcados
-- `fechado` são pulados dentro da função, então o custo não cresce com o tempo.
SELECT cron.schedule(
  'refresh-auditoria-assim-resumo-janela',
  '20 3 * * *',
  $cron$SELECT public.refresh_auditoria_assim_resumo(current_date - 45, current_date)$cron$
);
