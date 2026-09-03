-- =============================================================================
-- `forma_autorizacao` diz o que a ASSIM respondeu, não o que a recepção clicou
-- =============================================================================
-- Base: 20260903000000_filipeta_por_dispositivo_indisponivel.sql (a definição
-- vigente, aplicada em 2026-09-03). Corpo idêntico, exceto UMA linha.
--
-- O BUG
-- Na Conferência de Filipetas, `forma_autorizacao` mostrava o clique da
-- recepção mesmo quando o relatório da ASSIM dizia outra coisa. Medido em
-- produção logo depois de aplicar a 20260903000000, nas 6 sessões que entraram
-- pela regra nova do `8-` (todas com `teve_token = false` e `token = null`):
--
--   10/08 15:40  guia 130052  lia 'Token'
--   10/08 15:40  guia 129631  lia 'Dispositivo indisponível'
--   10/08 15:40  guia 129712  lia 'Token'
--   11/08 16:20  guia 156361  lia 'Token'
--   12/08 10:00  guia 166324  lia 'Dispositivo indisponível'
--   18/08 15:00  guia 278475  lia 'QR Code'
--
-- Quatro das seis afirmam 'Token' ou 'QR Code' numa sessão SEM token. As duas
-- que acertaram acertaram por coincidência — a recepção clicou o mesmo que a
-- ASSIM veio a responder.
--
-- Não é exclusivo do `8-` sem token: entre as 57 linhas que já entravam pela
-- Semente 1, duas leem 'Erro no Reconhecimento Facial' TENDO token (guias 78387
-- e 166677). Mesma causa.
--
-- A CAUSA
-- O COALESCE tinha dois ramos e pulava o do meio:
--
--   COALESCE(
--     forma_validacao_do_biofacial(vin.biofacial, vin.teve_token),  -- só o VÍNCULO
--     fo.forma_autorizacao                                          -- a INTENÇÃO
--   )
--
-- Bloco sem vínculo — a maioria — tem `vin.*` todo nulo e cai direto em
-- `fo.forma_autorizacao`, que é o que a recepção escolheu no modal do robô
-- ANTES de a ASSIM responder (a mesma natureza de "intenção, não resposta" que
-- 20260902110000:20-32 descreve para o gate de recusa). O biofacial da guia
-- pareada por POSIÇÃO — a resposta de fato — não era consultado em lugar
-- nenhum, apesar de `mt.biofacial` já estar carregado desde a 20260903000000.
--
-- A CORREÇÃO
-- Uma linha: o posicional entra no meio, e a intenção da recepção desce para
-- último recurso.
--
--   COALESCE(
--     forma_validacao_do_biofacial(vin.biofacial, vin.teve_token),  -- vínculo
--     forma_validacao_do_biofacial(mt.biofacial,  mt.teve_token),   -- posicional (NOVA)
--     fo.forma_autorizacao                                          -- intenção
--   )
--
-- É a MESMA precedência que `guia` e `token` já usam duas linhas acima
-- (`COALESCE(vin.*, mt.*)`), fixada em 20260827000004: vínculo primeiro porque
-- é quem de fato autorizou; posicional como o fallback de sempre. Aqui só se
-- acrescenta o degrau que faltava — a ordem existente não muda.
--
-- `fo.forma_autorizacao` CONTINUA no COALESCE, e de propósito: quando a ASSIM
-- não respondeu (RETORNO_NAO_CONFIRMADO, `mt` todo nulo) o registro da recepção
-- é a única evidência que existe. E `forma_validacao_do_biofacial` devolve NULL
-- para código desconhecido (4, 5, 6, 7 e qualquer coisa nova — ver
-- 20260821080000:44-49, "código desconhecido não vira chute"), então nesses
-- casos o COALESCE também desce sozinho para a intenção em vez de mostrar vazio.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- Não muda QUAIS sessões entram na Conferência: o WHERE final fica intocado,
-- incluindo o ramo do `8-` da 20260903000000. Só muda o RÓTULO exibido numa
-- coluna. Nenhuma linha entra, nenhuma sai.
--
-- Também não toca `fila_autorizacoes.forma_autorizacao`: o dado gravado pela
-- recepção continua lá, intacto, e segue sendo o que o período em paralelo
-- (20260821080000:51-58) compara contra o relatório.
--
-- BLAST RADIUS
-- `get_tokens_mensal` é lida pela página de Conferência de Filipetas e não
-- alimenta faturamento. A coluna afetada é informativa.
--
-- ATENÇÃO a um consumidor que casa por TEXTO: `get_tokens_mensal` NÃO é quem
-- filtra `forma_autorizacao ILIKE '%reconhecimento facial%'` — quem faz isso é
-- a Semente 2, que lê `fila_autorizacoes` direto (`fila_facial`), não esta
-- coluna de saída. Logo a mudança de rótulo não altera nenhuma seleção.
--
-- CONTRAPROVA (rodar depois; esperado: as 6 linhas do `8-` sem token passam a
-- ler 'Dispositivo indisponível', e o total do mês NÃO muda)
--   select forma_autorizacao, count(*)
--   from public.get_tokens_mensal('2026-08-01') t
--   join public.autorizacoes_assim aa on aa.guia = t.guia
--   where split_part(btrim(coalesce(aa.biofacial,'')), '-', 1) = '8'
--     and aa.teve_token is distinct from true
--   group by 1;
--
--   select count(*) from public.get_tokens_mensal('2026-08-01');
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
      -- Projetado a partir de 20260903000000: as Sementes 1-3 nunca precisaram
      -- do biofacial de uma guia sem vínculo; a Semente 4 precisa.
      aa.biofacial,
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
        -- Prefixo `8-`, com ou sem token (20260903000000).
        OR split_part(btrim(COALESCE(aa.biofacial, '')), '-', 1) = '8'
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
  -- Semente 4: partições cujo biofacial diz `8-DISPOSITIVO INDISPONIVEL`,
  -- COM OU SEM TOKEN. Sem dispositivo a ASSIM cai no #checkBday e emite a
  -- filipeta (20260821080000:101-105): o papel é consequência do `8-`, e o
  -- token é consequência do papel. Quando o token existe a Semente 1 já pegava;
  -- quando não existe (9 de 106 casos medidos em 21/08/2026) a partição não
  -- entrava por porta nenhuma, e a sessão sumia calada.
  --
  -- Casa pelo PREFIXO: o rótulo vem truncado em 25 chars e o vocabulário não é
  -- fechado (reference_biofacial_no_extrato_assim).
  chaves_dispositivo AS (
    SELECT DISTINCT empresa, matricula_base, dep, dia, codigo_tuss
    FROM auth_mes
    WHERE split_part(btrim(COALESCE(biofacial, '')), '-', 1) = '8'
  ),
  chaves AS (
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_token
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_facial
    WHERE codigo_tuss IS NOT NULL
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_vinculo
    WHERE codigo_tuss IS NOT NULL
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_dispositivo
    WHERE codigo_tuss IS NOT NULL
  ),
  dias_alvo AS (
    SELECT DISTINCT dia FROM chaves
  ),
  autorizacoes AS (
    SELECT
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao,
      a.updated_at, a.teve_token, a.token, a.codigo_tuss,
      -- Carregado a partir de 20260903000000 para o WHERE final poder ler o
      -- biofacial da guia pareada por POSIÇÃO (e não só o da vinculada).
      a.biofacial,
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
      -- `a.biofacial` carregado a partir de 20260903000000.
      a.guia, a.status, a.teve_token, a.token, a.data_execucao, a.biofacial
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
      -- Degrau que faltava (20260903010000): o biofacial da guia pareada por
      -- POSIÇÃO. Sem ele, bloco sem vínculo caía direto em `fo` e a tela
      -- mostrava o clique da recepção no lugar da resposta da ASSIM — 4 das 6
      -- linhas do `8-` sem token liam 'Token'/'QR Code' sem ter token.
      public.forma_validacao_do_biofacial(mt.biofacial,  mt.teve_token),
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
      -- ── O ramo da FILA exclui a RECUSA ───────────────────────────────────
      -- Ver o cabeçalho desta migration: `fo.forma_autorizacao` é intenção da
      -- recepção, registrada ANTES da resposta da ASSIM. Sob recusa não saiu
      -- filipeta, e pedir conferência de um papel inexistente não tem resposta
      -- possível.
      --
      -- O teste de `vin.guia` preserva a Semente 3 — bloco com vínculo não é
      -- julgado pelo status da guia glosada que `mt` pareou.
      OR (
        fo.forma_autorizacao ILIKE '%reconhecimento facial%'
        AND vin.guia IS NULL
        -- Testa RECUSA, não liberação — e a diferença entre as duas é o que
        -- salva 19 linhas de julho/2026. Sem guia pareada, `mt.status` é NULL:
        -- a resposta da ASSIM é DESCONHECIDA, não negativa. É o
        -- RETORNO_NAO_CONFIRMADO, onde o registro da recepção é a única
        -- evidência que existe e o papel provavelmente está lá. Só a recusa
        -- explícita prova que filipeta não saiu.
        --
        -- Mesma forma do CASE de `situacao` em get_auditoria_assim_periodo
        -- (`status <> ALL (ARRAY[...])`), para as duas RPCs classificarem a
        -- resposta da ASSIM pela mesma régua. 'Liberado *' (cancelada) fica:
        -- a guia existiu e o papel saiu antes do cancelamento.
        AND NOT (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado', 'Liberado *']))
      )
      OR public.forma_validacao_do_biofacial(vin.biofacial, vin.teve_token)
           ILIKE '%reconhecimento facial%'
      -- ── `8-DISPOSITIVO INDISPONIVEL` exige filipeta (20260903000000) ─────
      -- Vínculo primeiro, posicional como fallback — a mesma precedência de
      -- guia/token/forma acima. Sem gate de recusa: biofacial é campo do
      -- RELATÓRIO da ASSIM (resposta), não do modal da recepção (intenção);
      -- ver o cabeçalho desta migration.
      --
      -- Pelo PREFIXO, não pelo rótulo de `forma_validacao_do_biofacial`, que
      -- devolve 'Token' quando o `8-` veio com token e perderia 97 dos 106
      -- casos medidos — justamente o inverso do pedido.
      OR split_part(btrim(COALESCE(vin.biofacial, mt.biofacial, '')), '-', 1) = '8'
    )
    AND ovr.situacao_nova IS NULL
    AND COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY b.data_atendimento, b.hora_inicial, b.paciente_nome
$function$
;

comment on function public.get_tokens_mensal(date) is
  'Conferência de Filipetas: sessões do mês com filipeta, erro de reconhecimento facial ou biofacial 8-DISPOSITIVO INDISPONIVEL (com ou sem token, porque o papel do #checkBday e consequencia do 8- e nao do token) que a ASSIM não RECUSOU (considerando a guia VINCULADA quando existe vínculo ativo, não só a fila), exceto as cobertas por reclassificação manual ativa (public.auditoria_situacao_overrides). Sessão recusada não deixa papel e por isso não entra; sessão SEM resposta da ASSIM (retorno não confirmado) entra, porque ali o papel provavelmente existe. forma_autorizacao segue a ordem vinculo -> posicional -> fila: os dois primeiros sao a RESPOSTA da ASSIM (biofacial do relatorio), a fila e a INTENCAO da recepcao e so vale quando a ASSIM nao respondeu ou trouxe codigo desconhecido.';
