-- =============================================================================
-- A Conferência de Filipetas passa a enxergar a guia VINCULADA, não só a fila
-- =============================================================================
-- Base: 20260828170000_conferencia_filipetas_consome_reclassificacao.sql (a
-- definição vigente, já aplicada em produção). Corpo idêntico, exceto:
--
--   1. uma CTE nova (`vinculos_mes` + `chaves_vinculo`), a terceira semente do
--      funil de partições;
--   2. um LATERAL novo (`vin`) no SELECT final, que traz teve_token/token/forma
--      da guia VINCULADA;
--   3. o WHERE final passa a considerar `vin` também, não só `mt`/`fo`.
--
-- `RETURNS TABLE` não muda uma vírgula — mesmas colunas, valores diferentes —
-- então CREATE OR REPLACE basta e o frontend não muda.
--
-- O BUG
-- Sessão coberta por vínculo (GLOSA_RESOLVIDA) continuava fora da Conferência
-- de Filipetas mesmo quando a guia que resolveu a glosa teve erro de
-- reconhecimento facial ou token — os dois casos que deixam papel na recepção.
-- É o MESMO bug que 20260827000003/000004 corrigiram em
-- get_auditoria_assim_periodo, agora do lado de get_tokens_mensal, que é uma
-- reimplementação própria e nunca herdou aquela correção (ver o histórico de
-- 20260828170000).
--
-- CASO REAL (KOURTNEY SAVINO LOPE, 03/08/2026, bloco
-- 11649_2026-08-03_22070435_11:20:00) — o mesmo de sempre:
--
--   guia  9229   status glosa   forma_autorizacao 'QR Code'   <- na FILA
--   guia 15032   Liberado       biofacial '1-ERRO NO RECONHECIMENTO FA'  <- VINCULADA
--
-- Medido depois de aplicar 20260828170000: get_auditoria_assim('2026-08-03')
-- já devolvia forma_autorizacao = 'Erro no Reconhecimento Facial' para este
-- bloco (a correção da RPC diária funcionou). Mas
-- get_tokens_mensal('2026-08-01') continuava sem essa linha.
--
-- A CAUSA, em duas camadas independentes
--
--   a) FUNIL DE ENTRADA — nenhuma das duas sementes alcança esta partição.
--      `chaves_token` exige autorizacoes_assim.teve_token = true, e nem a 9229
--      nem a 15032 têm token (a 15032 tem ERRO FACIAL, não token). `chaves_facial`
--      lê `fila_autorizacoes.forma_autorizacao` DIRETO — e essa coluna guarda
--      'QR Code', a resposta original de quem atendeu a guia GLOSADA. A fila
--      nunca soube do vínculo, então a chave desta partição nunca entra em
--      `chaves`, e a sessão nem chega a ser considerada.
--
--   b) SELECT FINAL — mesmo se a chave entrasse, `match_temporal` pareia por
--      POSIÇÃO (ordem_sessao <-> ordem_autorizacao) e devolveria a guia 9229
--      (a glosada), porque a 15032 sai do pool posicional pelo NOT EXISTS de
--      `autorizacoes_vinculos` — ela pertence a um bloco específico, não compete
--      mais por posição. Sem um LATERAL dedicado à guia vinculada, o SELECT
--      final leria `mt.teve_token`/`fo.forma_autorizacao` da guia ERRADA.
--
-- A CORREÇÃO
--   Semente 3 (`chaves_vinculo`): parte de autorizacoes_vinculos ativos deste
--   mês, junta autorizacoes_assim da guia VINCULADA (não a original) e testa
--   teve_token/biofacial ali — exatamente o que decide "há papel a conferir".
--
--   LATERAL `vin` no SELECT final: por bloco (não por partição), busca o
--   vínculo ativo e os três campos da guia vinculada. `guia`/`token` exibidos
--   passam a COALESCE(vin.*, mt.*) — vínculo primeiro, fallback posicional para
--   todo bloco sem vínculo (a esmagadora maioria, inalterada).
--
-- O QUE ESTA MIGRATION NÃO MUDA, DE PROPÓSITO
--   * O funil de partições continua filtrando PARTIÇÃO INTEIRA, nunca linha
--     solta — `chaves_vinculo` só AMPLIA o conjunto de partições que entram no
--     funil, não muda a numeração de nenhuma partição que já entrava.
--   * Bloco sem vínculo: `vin` vem tudo NULL, o COALESCE cai no mesmo valor de
--     `mt`/`fo` de sempre. Comportamento idêntico ao de hoje.
--   * A reclassificação (20260828170000) continua por cima de tudo: um bloco
--     com vínculo E reclassificado ainda sai pela mesma condição
--     `ovr.situacao_nova IS NULL` (as duas camadas não coexistem na prática,
--     mas a ordem de avaliação não depende disso).
--
-- VERIFICAÇÃO
--   1. O caso real, que hoje está ausente:
--        SELECT bloco_id, guia, token, forma_autorizacao
--          FROM get_tokens_mensal('2026-08-01')
--         WHERE bloco_id = '11649_2026-08-03_22070435_11:20:00';
--      Esperado: UMA linha, guia 15032 (a vinculada — não a 9229 da fila),
--      forma_autorizacao = 'Erro no Reconhecimento Facial'.
--
--   2. Bloco sem vínculo não muda — comparar contagem total antes e depois:
--        SELECT count(*) FROM get_tokens_mensal('2026-08-01');
--      Só deve SUBIR pela quantidade de blocos com vínculo ativo cuja guia
--      vinculada tem token/erro facial e que hoje não aparecem:
--        SELECT count(*) FROM public.autorizacoes_vinculos v
--          JOIN public.autorizacoes_assim aa ON aa.guia = v.guia
--         WHERE v.desfeito_em IS NULL AND v.tipo = 'vinculo'
--           AND date(aa.data_execucao) >= date_trunc('month', CURRENT_DATE)::date
--           AND (aa.teve_token = true
--                OR public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token)
--                     ILIKE '%reconhecimento facial%');
--      (rodar ANTES de aplicar — é o tamanho esperado do aumento)
--
--   3. get_auditoria_assim('2026-08-26') do Benjamim Vilazio continua sem
--      regressão (a exclusão por reclassificação de 20260828170000 é
--      inalterada):
--        SELECT bloco_id, situacao FROM get_auditoria_assim('2026-08-26')
--         WHERE paciente_nome ILIKE '%Benjamim Vilazio%';
--      Esperado: FALTA, e o bloco continua ausente de get_tokens_mensal.
-- =============================================================================

-- Sem DROP: o RETURNS TABLE é idêntico ao vigente.

CREATE OR REPLACE FUNCTION public.get_tokens_mensal(p_mes date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, terapias text, profissionais text, guia text, token text, data_execucao timestamp with time zone, criado_por text, forma_autorizacao text)
 LANGUAGE sql
 STABLE
 SET statement_timeout TO '30s'
AS $function$
  WITH auth_mes AS (
    SELECT
      aa.guia, aa.matricula, aa.data_execucao, aa.status, aa.codigo_tuss,
      aa.codigo_erro, aa.descricao_erro, aa.teve_token, aa.token, aa.updated_at,
      split_part(aa.matricula, '.', 1) AS empresa,
      split_part(aa.matricula, '.', 2) AS matricula_base,
      split_part(aa.matricula, '.', 3) AS dep,
      date(aa.data_execucao)           AS dia
    FROM autorizacoes_assim aa
    WHERE date(aa.data_execucao) >= date_trunc('month', p_mes)::date
      AND date(aa.data_execucao) <  (date_trunc('month', p_mes) + interval '1 month')::date
  ),
  -- Semente 1: partições que tiveram filipeta.
  chaves_token AS (
    SELECT DISTINCT empresa, matricula_base, dep, dia, codigo_tuss
    FROM auth_mes
    WHERE teve_token = true
  ),
  -- Semente 2: sessões validadas com erro de reconhecimento facial. A forma
  -- vive na fila (é onde a recepção grava), e a fila não tem carteirinha —
  -- então a chave de partição vem da agenda, pela mesma derivação usada no
  -- resto da função. ILIKE por tolerância a acento/caixa da opção gravada.
  fila_facial AS (
    SELECT DISTINCT f.paciente_id, f.data_atendimento, f.tuss
    FROM fila_autorizacoes f
    WHERE f.data_atendimento >= date_trunc('month', p_mes)::date
      AND f.data_atendimento <  (date_trunc('month', p_mes) + interval '1 month')::date
      AND f.forma_autorizacao ILIKE '%reconhecimento facial%'
  ),
  chaves_facial AS (
    SELECT DISTINCT
      substring(at.numero_carteirinha, 1, 6)                         AS empresa,
      substring(at.numero_carteirinha, 7, 7)                         AS matricula_base,
      right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)  AS dep,
      at.data_atendimento                                            AS dia,
      public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
    FROM agenda_tita at
    JOIN fila_facial ff
      ON  ff.paciente_id::bigint = at.paciente_id
      AND ff.data_atendimento    = at.data_atendimento
    WHERE at.ativo = true
      AND at.convenio_nome ILIKE '%assim%'
      AND public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome)
            IS NOT DISTINCT FROM ff.tuss
  ),
  -- Semente 3: blocos cobertos por vínculo cuja guia VINCULADA teve filipeta ou
  -- erro facial. A fila (Semente 2) só enxerga a forma que a RECEPÇÃO gravou
  -- para a guia GLOSADA — nunca sabe que aquela glosa foi resolvida por outra
  -- guia. A chave de partição vem de agenda_tita, pela mesma derivação das
  -- outras sementes.
  vinculos_mes AS (
    SELECT
      v.bloco_id, v.guia,
      aa.teve_token, aa.biofacial
    FROM public.autorizacoes_vinculos v
    JOIN public.autorizacoes_assim aa ON aa.guia = v.guia
    WHERE v.desfeito_em IS NULL
      AND v.tipo = 'vinculo'
      AND date(aa.data_execucao) >= date_trunc('month', p_mes)::date
      AND date(aa.data_execucao) <  (date_trunc('month', p_mes) + interval '1 month')::date
      AND (
        aa.teve_token = true
        OR public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token)
             ILIKE '%reconhecimento facial%'
      )
  ),
  chaves_vinculo AS (
    SELECT DISTINCT
      substring(at.numero_carteirinha, 1, 6)                         AS empresa,
      substring(at.numero_carteirinha, 7, 7)                         AS matricula_base,
      right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)  AS dep,
      at.data_atendimento                                            AS dia,
      public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
    FROM agenda_tita at
    JOIN vinculos_mes vm
      ON  vm.bloco_id = concat_ws('_', at.paciente_id, at.data_atendimento,
            public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome),
            at.hora_inicial)
    WHERE at.ativo = true
      AND at.convenio_nome ILIKE '%assim%'
  ),
  chaves AS (
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_token
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_facial
    WHERE codigo_tuss IS NOT NULL
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_vinculo
    WHERE codigo_tuss IS NOT NULL
  ),
  dias_alvo AS (
    SELECT DISTINCT dia FROM chaves
  ),
  autorizacoes AS (
    SELECT
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao,
      a.updated_at, a.teve_token, a.token, a.codigo_tuss,
      a.empresa, a.matricula_base, a.dep,
      row_number() OVER (
        PARTITION BY a.empresa, a.matricula_base, a.dep, a.dia, a.codigo_tuss
        ORDER BY a.data_execucao
      ) AS ordem_autorizacao
    FROM auth_mes a
    JOIN chaves k
      ON  k.empresa        = a.empresa
      AND k.matricula_base = a.matricula_base
      AND k.dep            = a.dep
      AND k.dia            = a.dia
      AND k.codigo_tuss    IS NOT DISTINCT FROM a.codigo_tuss
  ),
  blocos_auditoria AS (
    WITH agenda_tita_tuss AS (
      SELECT
        at.paciente_id,
        at.paciente_nome,
        at.data_atendimento,
        at.hora_inicial,
        at.terapia_nome,
        at.terapia_exibicao_nome,
        at.profissional_nome,
        at.convenio_nome,
        at.numero_carteirinha,
        substring(at.numero_carteirinha, 1, 6)                                   AS empresa,
        substring(at.numero_carteirinha, 7, 7)                                   AS matricula,
        right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)           AS dep,
        public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) AS codigo_tuss
      FROM agenda_tita at
      WHERE at.data_atendimento IN (SELECT dia FROM dias_alvo)
        AND at.ativo = true
        AND at.convenio_nome ILIKE '%assim%'
        AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
        -- Semi-join contra o conjunto de carteirinhas alvo: derruba a maior
        -- parte das linhas ANTES dos NOT EXISTS caros abaixo.
        AND EXISTS (
          SELECT 1 FROM chaves k
          WHERE k.empresa        = substring(at.numero_carteirinha, 1, 6)
            AND k.matricula_base = substring(at.numero_carteirinha, 7, 7)
            AND k.dep            = right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2)
        )
    ),
    agenda_filtrada AS (
      SELECT a.*
      FROM agenda_tita_tuss a
      WHERE a.codigo_tuss IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM config_regras_terapias r
          WHERE r.categoria = 'BLACKLIST_AUTORIZACAO'
            AND r.ativo = true
            AND a.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
        )
    ),
    agenda_sem_falta AS (
      SELECT a.*
      FROM agenda_filtrada a
      WHERE NOT EXISTS (
        SELECT 1 FROM fila_autorizacoes f
        WHERE f.paciente_id::bigint = a.paciente_id
          AND f.data_atendimento = a.data_atendimento
          AND f.horario = a.hora_inicial
          AND (
            upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
            OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
          )
      )
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Escola%'
        AND a.terapia_nome NOT ILIKE '%Aplicador ABA Casa%'
        AND a.terapia_nome NOT ILIKE '%Aplicador Suporte%'
        AND a.terapia_nome NOT ILIKE '%Supervisão ABA%'
    )
    SELECT
      concat_ws('_', asf.paciente_id, asf.data_atendimento, asf.codigo_tuss, asf.hora_inicial) AS bloco_id,
      asf.paciente_id::text,
      asf.paciente_nome,
      asf.empresa,
      asf.matricula,
      asf.dep,
      asf.data_atendimento,
      asf.hora_inicial,
      asf.codigo_tuss,
      string_agg(DISTINCT asf.terapia_exibicao_nome, ' | ' ORDER BY asf.terapia_exibicao_nome) AS terapias,
      string_agg(DISTINCT asf.profissional_nome,     ' | ' ORDER BY asf.profissional_nome)     AS profissionais
    FROM agenda_sem_falta asf
    -- convenio_nome entra no GROUP BY só para manter paridade exata com
    -- get_auditoria_assim_periodo: sem ele, dois convênios "assim" grafados
    -- diferente fundiriam num bloco só e mudariam a numeração do pareamento.
    GROUP BY asf.paciente_id, asf.paciente_nome, asf.empresa, asf.matricula, asf.dep,
             asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss, asf.convenio_nome
  ),
  fila_operacional AS (
    SELECT DISTINCT ON (f.paciente_id, f.data_atendimento, f.horario, f.tuss)
      f.paciente_id, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      f.criado_por,
      f.forma_autorizacao
    FROM fila_autorizacoes f
    WHERE f.data_atendimento IN (SELECT dia FROM dias_alvo)
      AND NOT (
        upper(COALESCE(f.status_assim, '')) LIKE '%FALTA%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%PACIENTE%'
        OR upper(COALESCE(f.tipo_falta, '')) LIKE '%TERAPEUTA%'
      )
    ORDER BY f.paciente_id, f.data_atendimento, f.horario, f.tuss,
             COALESCE(f.updated_at, f.created_at) DESC
  ),
  match_temporal AS (
    WITH sessoes AS (
      SELECT
        b1.*,
        row_number() OVER (
          PARTITION BY b1.empresa, b1.matricula, b1.dep, b1.data_atendimento, b1.codigo_tuss
          ORDER BY b1.hora_inicial
        ) AS ordem_sessao
      FROM blocos_auditoria b1
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.teve_token, a.token, a.data_execucao
    FROM sessoes s
    LEFT JOIN autorizacoes a
      ON  a.empresa        = s.empresa
      AND a.matricula_base = s.matricula
      AND a.dep            = s.dep
      AND date(a.data_execucao) = s.data_atendimento
      AND a.codigo_tuss    = s.codigo_tuss
      AND a.ordem_autorizacao = s.ordem_sessao
    ORDER BY s.bloco_id, a.updated_at DESC
  )
  SELECT
    b.bloco_id,
    b.paciente_id,
    b.paciente_nome,
    b.data_atendimento,
    b.hora_inicial,
    b.codigo_tuss,
    b.terapias,
    b.profissionais,
    -- ── Guia, token e forma seguem o vínculo quando ele existe ────────────────
    -- Mesma ordem que get_auditoria_assim_periodo estabeleceu em 20260827000004:
    -- vínculo primeiro (é quem de fato autorizou e deixou o papel), posicional
    -- como fallback de sempre. Bloco sem vínculo não muda — `vin.*` vem tudo
    -- NULL e o COALESCE cai direto no valor de `mt`.
    COALESCE(vin.guia, mt.guia)             AS guia,
    COALESCE(vin.token, mt.token)           AS token,
    mt.data_execucao,
    fo.criado_por,
    -- ── Ordem do COALESCE: vínculo PRIMEIRO ────────────────────────────────
    -- Mesmo erro que 20260827000003 cometeu e 20260827000004 corrigiu na RPC
    -- diária: `fo.forma_autorizacao` é a resposta que a recepção deu para a
    -- guia GLOSADA (aqui, 'QR Code' da 9229) e nunca é nula quando a sessão foi
    -- solicitada pelo Pulsar — então um COALESCE com `fo` na frente nunca chega
    -- a avaliar `vin`. O vínculo tem de vir primeiro; `fo` continua como
    -- fallback para todo bloco sem vínculo, que é a maioria.
    COALESCE(
      public.forma_validacao_do_biofacial(vin.biofacial, vin.teve_token),
      fo.forma_autorizacao
    )                                        AS forma_autorizacao
  FROM blocos_auditoria b
  JOIN match_temporal mt ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.paciente_id      = b.paciente_id
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  -- ── Vínculo ativo deste bloco ──────────────────────────────────────────────
  -- Mesmo desenho do LATERAL `vin` de get_auditoria_assim_periodo: por bloco,
  -- não por partição, porque o vínculo é uma afirmação sobre UMA sessão.
  LEFT JOIN LATERAL (
    SELECT v.guia, aa2.teve_token, aa2.token, aa2.biofacial
    FROM public.autorizacoes_vinculos v
    JOIN public.autorizacoes_assim aa2 ON aa2.guia = v.guia
    WHERE v.bloco_id = b.bloco_id
      AND v.desfeito_em IS NULL
      AND v.tipo = 'vinculo'
    LIMIT 1
  ) vin ON true
  -- ── Reclassificação manual ────────────────────────────────────────────────
  -- A mesma tabela que get_auditoria_assim_periodo já consome desde
  -- 20260827000001, e que esta função passou a consumir em 20260828170000.
  -- Nenhum destino de reclassificação mantém o bloco como "papel a conferir".
  LEFT JOIN LATERAL (
    SELECT o.situacao_nova
    FROM public.auditoria_situacao_overrides o
    WHERE o.bloco_id = b.bloco_id
      AND o.desfeito_em IS NULL
    LIMIT 1
  ) ovr ON true
  WHERE (
      COALESCE(vin.teve_token, mt.teve_token) = true
      OR fo.forma_autorizacao ILIKE '%reconhecimento facial%'
      OR public.forma_validacao_do_biofacial(vin.biofacial, vin.teve_token)
           ILIKE '%reconhecimento facial%'
    )
    AND ovr.situacao_nova IS NULL
    AND COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY b.data_atendimento, b.hora_inicial, b.paciente_nome
$function$
;

comment on function public.get_tokens_mensal(date) is
  'Conferência de Filipetas: sessões do mês com token ou erro de reconhecimento facial (considerando a guia VINCULADA quando existe vínculo ativo, não só a fila), exceto as cobertas por reclassificação manual ativa (public.auditoria_situacao_overrides).';
