-- ultima_autorizacao_anterior parava de enxergar quando a recepção autorizava
-- FORA DE ORDEM.
--
-- Incidente de 21/08/2026: paciente com sessões às 13:00 e 13:40. Às 12:58 a
-- atendente pediu a das 13:40 (a segunda antes da primeira) e o robô autorizou.
-- Às 13:02 outra atendente pediu a das 13:00 e a tela DEIXOU PASSAR — quatro
-- minutos depois da autorização anterior. No portal, a ASSIM avisou que o
-- beneficiário já tinha sido identificado dentro do intervalo de 30 minutos
-- (verificarIntervaloAtendimento(), ver robo-autorizador/rpa.js:120-121); a
-- atendente fechou a janela e a linha ficou em 'erro'.
--
-- O guarda existe desde sempre em solicitar/page.tsx ("Aguarde 30 minutos desde
-- a última autorização"), e mede a coisa certa — o RELÓGIO, via
-- horario_autorizacao. O que estava errado era o CONJUNTO que ele recebia:
--
--     AND fa2.horario < b.horario     -- só sessões mais cedo
--
-- Isso presume que a clínica autoriza na ordem do cronograma. Autorizada
-- primeiro a das 13:40, o card das 13:00 calculava a "última autorização
-- anterior" ignorando-a, porque 13:40 < 13:00 é falso. Voltava NULL, e
-- podeSolicitar() liberava no primeiro `if (!ultima)`.
--
-- A regra da ASSIM não conhece a ordem das sessões: ela olha o intervalo entre
-- as identificações do beneficiário. Então o conjunto certo é QUALQUER outro
-- horário do mesmo paciente no mesmo dia.
--
-- Muda também o significado do rótulo "Última autorização: HH:MM" no card, que
-- passa a ser a última autorização do paciente no dia — que é o que a recepção
-- precisa saber para decidir se pode pedir agora.
--
-- ATENÇÃO À ORDEM: recriação FIEL de 20260814130000_central_autorizacoes_criado_por
-- (que por sua vez parte de 20260813130100, com o reconhecimento de glosa). Se
-- aquelas ainda não estiverem em produção, esta traz o lote junto — é o mesmo
-- bloco pendente, mas fica dito aqui. A única diferença é a subquery de
-- ultima_autorizacao_anterior.

DROP FUNCTION IF EXISTS public.listar_central_autorizacoes(date);

CREATE OR REPLACE FUNCTION public.listar_central_autorizacoes(p_data date)
 RETURNS TABLE(paciente_id bigint, paciente_nome text, cpf text, data_nascimento date, data_atendimento date, horario time without time zone, terapias text[], sala_nome text[], profissionais text[], codigos_tuss text[], agendamentos text[], convenio_nome text, convenio_id bigint, empresa text, matricula text, dep text, crm text, nome_medico text, horario_autorizacao timestamp without time zone, ultima_autorizacao_anterior timestamp without time zone, status_final text, mostrar_na_tela boolean, tipo_fluxo text, cancelado_por_nome text, criado_por text)
 LANGUAGE sql
 STABLE
AS $function$

WITH

-- ── usuario_atual ────────────────────────────────────────────────────────────
-- Subquery escalar garante sempre 1 linha (unidades = NULL quando auth.uid()
-- não bate com nenhum usuário, ex.: chamadas via service_role) — se fosse um
-- SELECT direto com WHERE, 0 linhas aqui zerariam todo o CROSS JOIN abaixo.
usuario_atual AS (
  SELECT (SELECT unidades FROM public.usuarios WHERE id = auth.uid()) AS unidades
),

-- ── fallback_pat ───────────────────────────────────────────────────────────────
fallback_pat AS (
  SELECT
    p.paciente_id,
    ag.cpf,
    ag.data_nascimento,
    ag.convenio_id,
    ag.convenio_nome,
    ag.numero_carteirinha,
    substring(ag.numero_carteirinha, 1, 6)                          AS empresa,
    substring(ag.numero_carteirinha, 7, 7)                          AS matricula,
    right(regexp_replace(ag.numero_carteirinha, '\D', '', 'g'), 2)  AS dep
  FROM (
    SELECT DISTINCT paciente_id
    FROM   public.agenda_tita_autorizacao
    WHERE  data_atendimento = p_data
      AND  (cpf IS NULL OR numero_carteirinha IS NULL OR convenio_id IS NULL)
  ) p
  CROSS JOIN LATERAL (
    SELECT cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha
    FROM   public.agenda_tita
    WHERE  paciente_id = p.paciente_id
      AND  (cpf IS NOT NULL OR numero_carteirinha IS NOT NULL)
    ORDER BY
      (origem = 'grade')                                      DESC,
      (cpf IS NOT NULL AND numero_carteirinha IS NOT NULL)    DESC,
      updated_at                                              DESC
    LIMIT 1
  ) ag
),

-- ── raw_slots ──────────────────────────────────────────────────────────────────
raw_slots AS (
  SELECT
    ag.paciente_id,
    ag.paciente_nome,
    ag.cpf,
    ag.data_nascimento,
    ag.data_atendimento,
    ag.hora_inicial,
    ag.terapia_nome,
    ag.sala_nome,
    ag.profissional_nome,
    ag.codigo_tuss,
    ag.tita_agendamento_id,
    ag.convenio_nome,
    ag.convenio_id,
    ag.empresa,
    ag.matricula,
    ag.dep,
    ag.crm,
    ag.nome_medico,
    fp.cpf              AS fp_cpf,
    fp.data_nascimento  AS fp_data_nascimento,
    fp.convenio_id      AS fp_convenio_id,
    fp.convenio_nome    AS fp_convenio_nome,
    fp.empresa          AS fp_empresa,
    fp.matricula        AS fp_matricula,
    fp.dep              AS fp_dep
  FROM public.agenda_tita_autorizacao ag
  LEFT JOIN fallback_pat fp ON fp.paciente_id = ag.paciente_id
  CROSS JOIN usuario_atual ua
  WHERE ag.data_atendimento = p_data
    AND lower(COALESCE(ag.terapia_nome, '')) <> ALL (ARRAY[
          'aplicador aba escola'::text, 'aplicador aba casa'::text,
          'aplicador suporte'::text, 'apoio operacional'::text,
          'especialista técnico de área'::text, 'estágio'::text,
          'facilitador técnico'::text, 'operações clínicas'::text,
          'supervisão aba'::text, 'técnico terapêutico particular'::text,
          'triagem'::text])
    AND lower(COALESCE(ag.paciente_nome, '')) <> 'horário bloqueado'::text
    AND lower(COALESCE(ag.sala_nome,     '')) !~~ '%sala teste%'::text
    AND (
      ua.unidades IS NULL
      OR cardinality(ua.unidades) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(ua.unidades) un
        WHERE ag.sala_nome ILIKE '%' || un || '%'
      )
    )
),

-- ── base ───────────────────────────────────────────────────────────────────────
base AS (
  SELECT
    rs.paciente_id,
    rs.paciente_nome,
    COALESCE(rs.cpf,             rs.fp_cpf)            AS cpf,
    COALESCE(rs.data_nascimento, rs.fp_data_nascimento) AS data_nascimento,
    rs.data_atendimento,
    rs.hora_inicial                                     AS horario,
    array_agg(DISTINCT rs.terapia_nome)                 AS terapias,
    array_agg(DISTINCT rs.sala_nome)                    AS sala_nome,
    array_agg(DISTINCT rs.profissional_nome)            AS profissionais,
    array_agg(DISTINCT rs.codigo_tuss)                  AS codigos_tuss,
    array_agg(DISTINCT (rs.tita_agendamento_id)::text)  AS agendamentos,
    COALESCE(rs.convenio_nome, rs.fp_convenio_nome)     AS convenio_nome,
    COALESCE(rs.convenio_id,   rs.fp_convenio_id)       AS convenio_id,
    COALESCE(rs.empresa,       rs.fp_empresa)           AS empresa,
    COALESCE(rs.matricula,     rs.fp_matricula)         AS matricula,
    COALESCE(rs.dep,           rs.fp_dep)               AS dep,
    rs.crm,
    rs.nome_medico
  FROM raw_slots rs
  GROUP BY
    rs.paciente_id, rs.paciente_nome,
    COALESCE(rs.cpf,             rs.fp_cpf),
    COALESCE(rs.data_nascimento, rs.fp_data_nascimento),
    rs.data_atendimento, rs.hora_inicial,
    COALESCE(rs.convenio_nome, rs.fp_convenio_nome),
    COALESCE(rs.convenio_id,   rs.fp_convenio_id),
    COALESCE(rs.empresa,       rs.fp_empresa),
    COALESCE(rs.matricula,     rs.fp_matricula),
    COALESCE(rs.dep,           rs.fp_dep),
    rs.crm, rs.nome_medico
),

-- ── ma_blocos ──────────────────────────────────────────────────────────────────
ma_blocos AS (
  SELECT
    rs.paciente_id,
    rs.data_atendimento,
    rs.hora_inicial,
    rs.codigo_tuss,
    rs.matricula,
    rs.dep,
    min(rs.tita_agendamento_id)  AS tita_agendamento_id,
    row_number() OVER (
      PARTITION BY rs.matricula, rs.dep, rs.data_atendimento, rs.codigo_tuss
      ORDER BY rs.hora_inicial
    )                            AS ordem_consumo
  FROM raw_slots rs
  GROUP BY
    rs.paciente_id, rs.data_atendimento, rs.hora_inicial,
    rs.codigo_tuss, rs.matricula, rs.dep
),

-- ── ma_consumos_falta ──────────────────────────────────────────────────────────
ma_consumos_falta AS (
  SELECT DISTINCT
    bo.matricula,
    bo.dep,
    bo.data_atendimento,
    bo.codigo_tuss,
    bo.ordem_consumo
  FROM ma_blocos bo
  JOIN public.fila_autorizacoes fa
    ON  fa.matricula          = bo.matricula
    AND COALESCE(fa.dep, '')  = COALESCE(bo.dep, '')
    AND fa.data_atendimento   = bo.data_atendimento
    AND fa.horario            = bo.hora_inicial
    AND fa.tuss               = bo.codigo_tuss
    AND fa.status             = 'falta'
),

-- ── ma_auths ───────────────────────────────────────────────────────────────────
-- (item 5) NOT EXISTS: exclui guias já vinculadas a uma fila (numero_autorizacao),
-- para o pareamento posicional não capturar guia retroativa no atendimento de hoje.
-- Escopado por data (±7d de data_execucao) porque o número da guia recicla — ver
-- cabeçalho desta migration.
ma_auths AS (
  SELECT
    aa.paciente_id,
    aa.matricula_limpa                  AS matricula,
    right(aa.matricula, 2)              AS dep,
    aa.codigo_tuss,
    aa.data_execucao,
    date(aa.data_execucao)              AS data_atendimento,
    row_number() OVER (
      PARTITION BY aa.matricula_limpa, right(aa.matricula, 2),
                   date(aa.data_execucao), aa.codigo_tuss
      ORDER BY aa.data_execucao
    )                                   AS ordem_autorizacao
  FROM public.autorizacoes_assim aa
  WHERE date(aa.data_execucao) = p_data
    AND NOT EXISTS (
      SELECT 1
      FROM public.fila_autorizacoes fa
      WHERE fa.numero_autorizacao = aa.guia
        AND fa.data_atendimento BETWEEN (date(aa.data_execucao) - 7)
                                    AND (date(aa.data_execucao) + 7)
    )
),

-- ── ma_matches_ext ─────────────────────────────────────────────────────────────
ma_matches_ext AS (
  SELECT
    bo.paciente_id,
    bo.data_atendimento,
    bo.hora_inicial           AS horario,
    an.data_execucao
  FROM ma_blocos bo
  JOIN ma_auths an
    ON  an.matricula              = bo.matricula
    AND COALESCE(an.dep, '')      = COALESCE(bo.dep, '')
    AND an.data_atendimento       = bo.data_atendimento
    AND an.codigo_tuss            = bo.codigo_tuss
    AND an.ordem_autorizacao      = bo.ordem_consumo
),

-- ── ma_matches_falta ───────────────────────────────────────────────────────────
ma_matches_falta AS (
  SELECT
    bo.paciente_id,
    bo.data_atendimento,
    bo.hora_inicial                       AS horario,
    NULL::timestamp without time zone     AS data_execucao
  FROM ma_blocos bo
  JOIN ma_consumos_falta cf
    ON  cf.matricula              = bo.matricula
    AND COALESCE(cf.dep, '')      = COALESCE(bo.dep, '')
    AND cf.data_atendimento       = bo.data_atendimento
    AND cf.codigo_tuss            = bo.codigo_tuss
    AND cf.ordem_consumo          = bo.ordem_consumo
),

-- ── match_assim ────────────────────────────────────────────────────────────────
-- Referenciado 1x no SELECT externo (só no LEFT JOIN pra status_final/mostrar_na_tela)
-- — ultima_autorizacao_anterior passou a ler direto de fila_autorizacoes abaixo.
match_assim AS (
  SELECT * FROM ma_matches_ext
  UNION ALL
  SELECT * FROM ma_matches_falta
),

-- ── ultima_fila ────────────────────────────────────────────────────────────────
ultima_fila AS (
  SELECT DISTINCT ON (paciente_id, data_atendimento, horario)
    paciente_id,
    data_atendimento,
    horario,
    status,
    horario_autorizacao,
    cancelado_por_nome,
    criado_por,
    created_at
  FROM public.fila_autorizacoes
  WHERE data_atendimento = p_data
  ORDER BY paciente_id, data_atendimento, horario, created_at DESC
)

SELECT
  b.paciente_id,
  b.paciente_nome,
  b.cpf,
  b.data_nascimento,
  b.data_atendimento,
  b.horario,
  b.terapias,
  b.sala_nome,
  b.profissionais,
  b.codigos_tuss,
  b.agendamentos,
  b.convenio_nome,
  b.convenio_id,
  b.empresa,
  b.matricula,
  b.dep,
  b.crm,
  b.nome_medico,
  uf.horario_autorizacao,
  (
    -- A ASSIM conta o intervalo no RELÓGIO, não na ordem do cronograma: por isso
    -- aqui entra QUALQUER outro horário do paciente no dia (`<>`, não `<`).
    -- COALESCE porque nem toda linha autorizada tem horario_autorizacao — quando
    -- não tem, completed_at serve, convertido de UTC para hora de São Paulo (a
    -- tabela guarda os dois fusos: horario_autorizacao é wall time de SP e
    -- completed_at é UTC).
    SELECT max(COALESCE(
             fa2.horario_autorizacao,
             (fa2.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'
           ))
    FROM   public.fila_autorizacoes fa2
    WHERE  fa2.paciente_id::bigint = b.paciente_id
      AND  fa2.data_atendimento    = b.data_atendimento
      AND  fa2.horario            <> b.horario
      AND  (
             fa2.horario_autorizacao IS NOT NULL
             OR (
               fa2.status IN ('concluido', 'concluido_sem_guia', 'glosa')
               AND fa2.completed_at IS NOT NULL
             )
           )
  ) AS ultima_autorizacao_anterior,
  CASE
    WHEN ma.paciente_id IS NOT NULL                                        THEN 'autorizado_externo'::text
    WHEN uf.status = 'concluido'::text                                     THEN 'concluido'::text
    WHEN uf.status = 'concluido_sem_guia'::text                            THEN 'concluido_sem_guia'::text
    WHEN uf.status = 'falta'::text                                         THEN 'falta'::text
    WHEN uf.status = 'processando'::text                                   THEN 'processando'::text
    WHEN uf.status = 'pendente'::text                                      THEN 'pendente'::text
    WHEN uf.status = 'cancelado'::text                                     THEN 'cancelado'::text
    -- Recusa da ASSIM lida no recibo do aceite. Fica ANTES de 'erro' só por
    -- leitura; os dois são mutuamente exclusivos.
    WHEN uf.status = 'glosa'::text                                         THEN 'glosa'::text
    WHEN uf.status = 'erro'::text                                          THEN 'erro'::text
    ELSE 'sem_acao'::text
  END AS status_final,
  CASE
    WHEN ma.paciente_id IS NOT NULL                                        THEN false
    WHEN uf.status = ANY(ARRAY['concluido'::text,'falta'::text,'concluido_sem_guia'::text,'glosa'::text]) THEN false
    ELSE true
  END AS mostrar_na_tela,
  CASE
    WHEN lower(COALESCE(b.convenio_nome, '')) ~~ '%assim%'::text          THEN 'autorizacao'::text
    ELSE 'presenca'::text
  END AS tipo_fluxo,
  uf.cancelado_por_nome,
  uf.criado_por

FROM base b
LEFT JOIN match_assim ma
  ON  ma.paciente_id      = b.paciente_id
  AND ma.data_atendimento = b.data_atendimento
  AND ma.horario          = b.horario
LEFT JOIN ultima_fila uf
  ON  uf.paciente_id::bigint = b.paciente_id
  AND uf.data_atendimento    = b.data_atendimento
  AND uf.horario             = b.horario

ORDER BY b.horario ASC;

$function$;
