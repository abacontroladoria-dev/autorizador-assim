-- =============================================================================
-- Depois de aplicar 20260825000000 e 20260825010000 — conferência e livro-caixa
-- =============================================================================
-- Rodar na ordem. Os blocos 1 a 4 só leem; o bloco 5 escreve (livro-caixa).

-- ---------------------------------------------------------------------------
-- Bloco 1 — OS GRANTS DA VIEW  (o mais provável de ter quebrado)
-- ---------------------------------------------------------------------------
-- `20260825010000` faz DROP VIEW + CREATE VIEW em vw_central_pacientes, e o DROP LEVA OS
-- GRANTS EMBORA. Se o schema não tiver default privileges cobrindo isso, /central-pacientes
-- responde 403 — a tela abre vazia, sem erro visível.
--
-- Esperado: linhas para anon, authenticated e service_role com SELECT. Se vier VAZIO,
-- rodar o bloco 1b.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name   = 'vw_central_pacientes'
ORDER BY grantee, privilege_type;

-- Bloco 1b — SÓ SE o bloco 1 vier vazio. Restaura o que a view já tinha antes; não
-- amplia acesso para papel nenhum.
-- GRANT SELECT ON public.vw_central_pacientes TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bloco 2 — as leituras respondem? (aridade)
-- ---------------------------------------------------------------------------
-- `get_auditoria_assim` é wrapper `SELECT *` do `_periodo`. Se as duas não tivessem
-- ganhado a coluna juntas, ISTO estouraria com erro de aridade — e é a tela principal
-- da Conferência. As quatro têm de devolver número, qualquer número.
SELECT 'get_auditoria_assim'        AS fonte, count(*) FROM public.get_auditoria_assim(CURRENT_DATE)
UNION ALL
SELECT 'get_auditoria_assim_periodo',      count(*) FROM public.get_auditoria_assim_periodo(CURRENT_DATE, CURRENT_DATE)
UNION ALL
SELECT 'listar_central_pacientes',         count(*) FROM public.listar_central_pacientes(CURRENT_DATE)
UNION ALL
SELECT 'vw_central_pacientes (hoje)',      count(*) FROM public.vw_central_pacientes WHERE data_atendimento = CURRENT_DATE;

-- E os consumidores que listam colunas por nome — não deviam ter sido afetados, mas é
-- barato provar. get_tokens_mensal é o que mais depende do `_periodo`.
SELECT count(*) AS tokens_do_mes
FROM public.get_tokens_mensal(date_trunc('month', CURRENT_DATE)::date);

-- ---------------------------------------------------------------------------
-- Bloco 3 — a coluna existe e a função devolve o campo
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='fila_autorizacoes' AND column_name='numero_autorizacao_origem') AS coluna_na_tabela,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='vw_central_pacientes' AND column_name='numero_autorizacao_origem') AS coluna_na_view,
  (SELECT count(*) FROM pg_get_function_result('public.get_auditoria_assim(date)'::regprocedure)
    AS t(x) WHERE x ILIKE '%guia_origem%')                                             AS guia_origem_no_retorno;

-- ---------------------------------------------------------------------------
-- Bloco 4 — está gravando? (rodar algumas horas depois, com movimento do dia)
-- ---------------------------------------------------------------------------
-- O que se espera ver, e o que cada desvio significa:
--
--   'robo'      com started_at preenchido  -> normal, é a maioria
--   'relatorio' com started_at NULO        -> o robô nunca pegou; guia veio do extrato
--   'relatorio' com started_at PREENCHIDO  -> o caso do incidente: o RPA pegou, falhou,
--                                             e a guia foi tirada no portal. É exatamente
--                                             o que a coluna existe para registrar.
--   NULL        com guia                   -> só deve aparecer em sessão de ANTES de hoje
--
-- ALERTA: se 'relatorio' dominar as linhas com started_at preenchido E status concluído
-- pelo robô, o write-once do sync não está pegando e a autoria do robô está sendo
-- sobrescrita a cada rodada. Nesse caso, conferir o primeiro ramo do CASE em
-- sync_assim_results.
SELECT
  COALESCE(numero_autorizacao_origem, '(nulo)')          AS origem,
  count(*)                                               AS linhas,
  count(*) FILTER (WHERE started_at IS NULL)             AS robo_nunca_pegou,
  count(*) FILTER (WHERE started_at IS NOT NULL)         AS robo_pegou,
  string_agg(DISTINCT status, ', ' ORDER BY status)       AS status_vistos
FROM public.fila_autorizacoes
WHERE data_atendimento >= CURRENT_DATE
  AND numero_autorizacao IS NOT NULL
  AND numero_autorizacao <> 'N/A'
GROUP BY 1
ORDER BY 2 DESC;

-- ---------------------------------------------------------------------------
-- Bloco 5 — LIVRO-CAIXA (escreve)
-- ---------------------------------------------------------------------------
-- Aplicação pelo SQL Editor não registra nada em supabase_migrations.schema_migrations.
-- Sem estas linhas, o próximo `db push` tenta reaplicar as duas — e a 20260825010000
-- faria DROP VIEW numa view que outras coisas já leem, no meio do dia.
-- Ver reference_db_push_blast_radius: ausente do livro-caixa = tratada como não executada.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260825000000', 'origem_da_guia'),
  ('20260825010000', 'origem_da_guia_nas_leituras')
ON CONFLICT (version) DO NOTHING;

-- Confirmação: as duas têm de aparecer.
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260825000000', '20260825010000')
ORDER BY version;
