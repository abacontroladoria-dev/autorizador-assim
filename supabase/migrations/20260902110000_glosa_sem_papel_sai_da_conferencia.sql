-- =============================================================================
-- Sessão GLOSADA não deixa filipeta — sai da Conferência
-- =============================================================================
-- Base: 20260828180000_tokens_mensal_segue_a_guia_vinculada.sql (a definição
-- vigente). Corpo idêntico, exceto UMA linha do WHERE final — o ramo do erro
-- facial, que passa a excluir a autorização RECUSADA.
--
-- O BUG
-- Sessão recusada pela ASSIM aparecia na Conferência de Filipetas pedindo
-- conferência de um papel que não existe. A recepção não tem o que conferir:
-- a ASSIM não liberou, então não saiu filipeta nenhuma.
--
-- CASO REAL (BERNARDO FREIRES PESSOA OTERIO, 31/08/2026, Psicologia ABA 13:40,
-- bloco 11548_2026-08-31_22070384_13:40:00):
--
--   guia 478997   status '1013-CADASTRO DO BENEFICI'   <- RECUSADA
--   fila_autorizacoes.forma_autorizacao = 'Erro no Reconhecimento Facial'
--   teve_token = false, token = null
--
-- A CAUSA
-- `fo.forma_autorizacao` guarda o que a recepção ESCOLHEU no modal do robô
-- (OPCOES_VALIDACAO em robo-autorizador/rpa.js) — uma declaração de intenção,
-- registrada ANTES de a ASSIM responder. Ela diz "tentei validar por
-- reconhecimento facial e deu erro", não "a ASSIM liberou e saiu papel". Sob
-- recusa as duas leituras divergem: houve a tentativa, não houve a liberação.
--
-- Por que o ramo do TOKEN (linha 399 da base) não precisa da mesma guarda:
-- `teve_token`/`token` vêm de `autorizacoes_assim` — o relatório da ASSIM.
-- Existir token ali já é prova de que a autorização saiu; o papel é
-- consequência do `8-` do biofacial (ver reference_biofacial_no_extrato_assim).
-- Só o ramo da FILA opina sobre um fato que a ASSIM ainda não confirmou, e por
-- isso só ele carece do gate.
--
-- Mesma razão para `vin.biofacial` (linha 401) ficar intocado: biofacial é
-- campo do relatório, e a guia vinculada é por definição a que autorizou.
--
-- A CORREÇÃO
-- O ramo da fila passa a excluir a RECUSA na ponta da ASSIM:
--
--   OR (fo.forma_autorizacao ILIKE '%reconhecimento facial%'
--       AND vin.guia IS NULL
--       AND NOT (mt.status IS NOT NULL
--                AND mt.status <> ALL (ARRAY['Liberado', 'Liberado *'])))
--
-- RECUSA EXPLÍCITA, não "ausência de liberação" — e a diferença entre as duas
-- é o coração desta migration. A primeira versão deste gate era
-- `mt.status IN ('Liberado','Liberado *')`, que parece equivalente e não é:
-- derrubava 19 linhas legítimas de julho/2026 (medido, ver BLAST RADIUS).
--
-- `mt.status` é o status da guia pareada por posição em `match_temporal`:
--
--   'Liberado'    -> liberou, saiu papel, fica.
--   'Liberado *'  -> CANCELADA. É veredito, não ausência (ver
--                    project_vinculo_na_grade). Fica porque a guia EXISTIU e o
--                    papel saiu antes do cancelamento — a recepção tem o que
--                    conferir, e a filipeta é justamente o que documenta o
--                    cancelamento numa contestação.
--   NULL          -> nenhuma guia pareou: a ASSIM não respondeu. Resposta
--                    DESCONHECIDA, não negativa. É o RETORNO_NAO_CONFIRMADO,
--                    onde o registro da recepção é a ÚNICA evidência que existe
--                    e o papel provavelmente está lá. FICA.
--   qualquer outro-> recusa explícita: nada a conferir, SAI. Só aqui.
--
-- A forma `<> ALL (ARRAY[...])` é a mesma do CASE de `situacao` em
-- get_auditoria_assim_periodo, para as duas RPCs classificarem a resposta da
-- ASSIM pela mesma régua.
--
-- O teste de `vin.guia` é o que preserva a Semente 3 de 20260828180000: bloco
-- coberto por vínculo não deve ser julgado pelo status da guia GLOSADA que
-- `mt` pareou — ele já entra pelos ramos de `vin`, que leem o relatório da guia
-- que de fato autorizou. Sem essa cláusula, o gate novo desfaria em silêncio a
-- correção do caso KOURTNEY SAVINO LOPE.
--
-- BLAST RADIUS — simulado em 2026-09-02 sobre jul+ago+set/2026, aplicando o
-- predicado novo em JS sobre os dados reais das duas RPCs, dia a dia
-- (get_auditoria_assim_periodo trunca em 1000 linhas num range de mês inteiro:
-- ver reference_postgrest_max_rows_1000; o laço diário contornou, 17.026 blocos):
--
--   jul: 53 linhas na conferência -> 53  (sai 0; as 19 RETORNO_NAO_CONFIRMADO
--                                        de 14/07 são exatamente as que o gate
--                                        errado matava)
--   ago: 99                       -> 98  (sai 1: o Bernardo)
--   set: 15                       -> 15  (sai 0)
--
--   1 linha em 167. Nenhuma linha legítima é perdida.
--
-- Os totais por mês OSCILAM entre medições (agosto deu 104, 101 e 99 em ~3
-- minutos) porque o sync e o robô escrevem durante o dia. O que a conferência
-- abaixo fixa é o INVARIANTE, não o número: cai exatamente 1, e é o bloco do
-- Bernardo.
--
-- CONFERÊNCIA 1 (esperado: 0 linhas depois de aplicar)
--   select bloco_id, paciente_nome, data_atendimento, hora_inicial
--   from public.get_tokens_mensal('2026-08-01')
--   where bloco_id = '11548_2026-08-31_22070384_13:40:00';
--
-- CONFERÊNCIA 2 — as sem-resposta de julho sobrevivem (esperado: 49 no dia,
-- das quais 19 são RETORNO_NAO_CONFIRMADO — estas são as que o gate errado
-- mataria; as outras 30 são LIBERADA e nunca estiveram em risco).
--
-- Medido em produção 2026-09-03, depois de aplicar: 49 no dia, 19 + 30.
-- Contar só o dia dá 49, NÃO 19 — 19 é o subconjunto sem resposta da ASSIM.
--   select count(*) from public.get_tokens_mensal('2026-07-01')
--   where data_atendimento = '2026-07-14';
--
-- Para isolar as 19 (o subconjunto que importa), cruze com a RPC diária:
--   with c as (select * from public.get_tokens_mensal('2026-07-01')
--              where data_atendimento = '2026-07-14')
--   select a.situacao, count(*)
--   from c join public.get_auditoria_assim_periodo('2026-07-14','2026-07-14') a
--     on a.bloco_id = c.bloco_id
--   group by a.situacao;
--   -- esperado: RETORNO_NAO_CONFIRMADO 19, LIBERADA 30
--
-- CONTRAPROVA (esperado: diferença de exatamente 1 em agosto, medida na mesma
-- sessão para o número não drifar entre as duas leituras)
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
    )
    AND ovr.situacao_nova IS NULL
    AND COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY b.data_atendimento, b.hora_inicial, b.paciente_nome
$function$
;

comment on function public.get_tokens_mensal(date) is
  'Conferência de Filipetas: sessões do mês com filipeta ou erro de reconhecimento facial que a ASSIM não RECUSOU (considerando a guia VINCULADA quando existe vínculo ativo, não só a fila), exceto as cobertas por reclassificação manual ativa (public.auditoria_situacao_overrides). Sessão recusada não deixa papel e por isso não entra; sessão SEM resposta da ASSIM (retorno não confirmado) entra, porque ali o papel provavelmente existe.';
