-- Fase 2.3 — Aplicação em lote das colunas de execução.
--
-- Por que uma RPC em vez de UPDATE pelo PostgREST:
--
--   • cada linha recebe valores DIFERENTES, então o `.update().in(...)` do
--     supabase-js (que aplica o mesmo patch a todas) não serve;
--   • um UPDATE por linha seriam centenas de round-trips por fatia;
--   • upsert por `id` não serve porque o PostgREST envia INSERT ... ON CONFLICT,
--     e o INSERT esbarraria no NOT NULL de `data` antes de o conflito existir.
--
-- Um jsonb_to_recordset resolve em uma ida só, com o UPDATE decidido pelo banco.
-- O trigger de congelamento continua valendo linha a linha: se algum dia esta
-- função tentar mexer em coluna de identidade, o banco recusa a fatia inteira.
--
-- A Edge Function só manda linhas cujo conteúdo de execução realmente mudou —
-- linha idêntica não vira escrita. Isso não é economia cosmética: esta tabela já
-- apareceu no diagnóstico de Disk IO do projeto, e reescrever 14 mil linhas por
-- dia para reconfirmar os mesmos valores geraria WAL à toa.

CREATE OR REPLACE FUNCTION public.fn_aplicar_execucao_grade(p_linhas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF p_linhas IS NULL OR jsonb_array_length(p_linhas) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.csv_grades_profissionais g
     SET status_execucao             = e.status_execucao,
         justificativa               = e.justificativa,
         possui_tratativa            = e.possui_tratativa,
         tratativa_profissional_id   = e.tratativa_profissional_id,
         tratativa_profissional_nome = e.tratativa_profissional_nome,
         tratativa_criada_em         = e.tratativa_criada_em,
         tratativa_origem            = e.tratativa_origem,
         evolucao_vinculo            = e.evolucao_vinculo,
         criado_em_tita              = e.criado_em_tita,
         excluido_em_tita            = e.excluido_em_tita,
         visto_em                    = now()
    FROM jsonb_to_recordset(p_linhas) AS e(
           id                          uuid,
           status_execucao             text,
           justificativa               text,
           possui_tratativa            boolean,
           tratativa_profissional_id   bigint,
           tratativa_profissional_nome text,
           tratativa_criada_em         timestamptz,
           tratativa_origem            text,
           evolucao_vinculo            text,
           criado_em_tita              timestamptz,
           excluido_em_tita            timestamptz
         )
   WHERE g.id = e.id;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$$;

COMMENT ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) IS
  'Aplica em lote as colunas de execução de csv_grades_profissionais (status_execucao, justificativa, tratativa_*, evolucao_vinculo, criado_em_tita, excluido_em_tita), casando por id. Chamada pela Edge Function sync-grade-csv em modo "execucao". Não insere, não inativa e não toca em coluna de identidade — o trigger trg_congelar_grade_passada recusaria.';

REVOKE ALL ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aplicar_execucao_grade(jsonb) TO service_role;
