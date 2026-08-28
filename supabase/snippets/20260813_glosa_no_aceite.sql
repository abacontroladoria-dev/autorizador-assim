-- ============================================================
-- ⚠️  NAO RODE ESTE ARQUIVO INTEIRO. Use
--     snippets/20260820_glosa_no_aceite_faltante_remoto.sql.
--
-- Rodar este aqui hoje FALHA em
--   42P13: cannot change return type of existing function
--   HINT: Use DROP FUNCTION listar_central_autorizacoes(date) first.
--
-- E o Postgres impedindo um retrocesso, nao um defeito: este arquivo
-- e de 2026-08-13, anterior a 20260814130000, que acrescentou
-- `criado_por` a listar_central_autorizacoes. O CREATE OR REPLACE
-- daqui devolveria a funcao a 24 colunas e apagaria o "Solicitado
-- por" da /solicitar.
--
-- Alem disso, o essencial deste lote JA ESTA EM PRODUCAO (medido em
-- 2026-08-20): robo_concluir_tarefa aceita p_status_assim,
-- listar_central_autorizacoes ja devolve criado_por com os ramos de
-- glosa embutidos, e ha linhas status='glosa' na fila desde 03/08.
-- O arquivo fica como registro do que foi desenhado.
-- ============================================================
--
-- Glosa reconhecida no aceite
--
-- Empacota as tres migrations 20260813130000/130100/130200 para
-- colar de uma vez no SQL Editor.
--
-- O QUE MUDA
-- Quando a ASSIM recusa, ela devolve um recibo igual ao de aceite,
-- so que com "BENEFICIO REJEITADO" e o motivo colado no TUSS
-- ("1013 - CADASTRO DO BENEFICIARIO COM PROBLEMAS"). O robo nao
-- conhecia essa tela: queimava os 120s de espera e a linha ia para
-- 'erro', jogando fora a guia e o horario que estavam ali. Agora ele
-- le tudo e grava status='glosa'.
--
-- ORDEM IMPORTA. Rode ISTO **antes** de publicar a versao 1.1.5 do
-- robo. A frota 1.1.4 chama robo_concluir_tarefa com 7 argumentos
-- nomeados; contra a funcao nova (8, com default) essa chamada
-- continua resolvendo. Na ordem inversa, toda maquina do campo para
-- de concluir tarefa ate o auto-update passar.
--
-- Tudo ou nada: se der erro, nada e aplicado.
-- ============================================================

begin;

-- ============================================================================
-- migration 20260813130000_robo_conclui_glosa
-- ============================================================================

-- robo_concluir_tarefa passa a aceitar 'glosa' e a gravar o motivo em status_assim.
--
-- POR QUE
-- Quando a ASSIM recusa, ela devolve um recibo igual ao de sucesso, só que com
-- "BENEFICIO REJEITADO" no lugar de "BENEFICIO PROCESSADO" — e com guia, data/hora e
-- o motivo ("TUSS 1 22070384 - (1013) CADASTRO DO BENEFICIARIO COM PROBLEMAS") todos
-- na tela. O robô não conhecia essa tela: esperava os 120s inteiros, o timeout virava
-- "a recepção não clicou em enviar" e a linha ia para 'erro', jogando fora a guia e o
-- horário. A glosa só era reconhecida no dia seguinte, quando o robô do relatório
-- trazia situacao='GLOSA' para autorizacoes_assim.
--
-- 'glosa' já era aceito por chk_status desde 20260528120000 — o que faltava era o robô
-- poder gravá-lo. O comentário do bloco 5 de 20260813100200 dizia que glosa era
-- "decisão humana"; com o recibo lido na tela, ela passa a ser leitura de fato.
--
-- POR QUE O DROP DA ASSINATURA ANTIGA
-- O parâmetro novo tem DEFAULT. Sem o DROP ficariam duas funções (7 e 8 argumentos) e
-- a chamada do PostgREST com 7 nomes casaria com as duas — erro de função ambígua.
-- O CREATE é OR REPLACE para a migration poder ser aplicada duas vezes sem estourar
-- "function already exists with same argument types" na segunda.
--
-- ORDEM DE IMPLANTAÇÃO
-- Aplicar ANTES de publicar a versão 1.1.5 do robô. A frota 1.1.4 chama por nome, com
-- 7 argumentos; contra esta função de 8 com default, essa chamada continua resolvendo.
-- Na ordem inversa, toda máquina do campo pararia de concluir tarefa até o auto-update
-- passar.

DROP FUNCTION IF EXISTS public.robo_concluir_tarefa(
  text, uuid, text, text, text, timestamp, text
);

CREATE OR REPLACE FUNCTION public.robo_concluir_tarefa(
  p_token               text,
  p_fila_id             uuid,
  p_status              text,
  p_numero_autorizacao  text      DEFAULT NULL,
  p_forma_autorizacao   text      DEFAULT NULL,
  p_horario_autorizacao timestamp DEFAULT NULL,
  p_error_message       text      DEFAULT NULL,
  p_status_assim        text      DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_afetadas   int;
BEGIN
  -- 'cancelado' e 'falta' seguem fora do alcance do robô: são decisões humanas,
  -- tomadas na tela. 'glosa' entrou porque é leitura do recibo, não decisão.
  IF p_status NOT IN ('concluido', 'concluido_sem_guia', 'erro', 'glosa') THEN
    RAISE EXCEPTION 'status nao permitido ao robo: %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.fila_autorizacoes
     SET status              = p_status,
         numero_autorizacao  = coalesce(p_numero_autorizacao, numero_autorizacao),
         horario_autorizacao = coalesce(p_horario_autorizacao, horario_autorizacao),
         forma_autorizacao   = coalesce(p_forma_autorizacao, forma_autorizacao),
         -- Sem forma escolhida, validacao_finalizada_em fica nula de propósito:
         -- é o que deixa a pendência visível e preenchível depois pela rota
         -- /api/fila-autorizacoes/validacao, em vez de fingir que foi resolvida.
         validacao_finalizada_em = CASE
                                     WHEN p_forma_autorizacao IS NOT NULL THEN now()
                                     ELSE validacao_finalizada_em
                                   END,
         -- Mesma coluna e mesmo formato que sync_assim_results usa quando o
         -- relatório chega ("1601-REINCIDENCIA NO ATEN"). Aqui chega horas antes.
         status_assim        = coalesce(p_status_assim, status_assim),
         assim_updated_at    = CASE
                                 WHEN p_status_assim IS NOT NULL THEN now()
                                 ELSE assim_updated_at
                               END,
         -- Glosa não é erro: sem problema relatado, error_message é limpo, do
         -- mesmo jeito que num aceite. O motivo da recusa mora em status_assim.
         error_message       = CASE
                                 WHEN p_status IN ('concluido', 'glosa')
                                  AND p_error_message IS NULL
                                 THEN NULL ELSE coalesce(p_error_message, error_message)
                               END,
         completed_at        = now(),
         updated_at          = now()
   WHERE id = p_fila_id
     AND machine_id = v_machine_id;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END;
$$;

-- Grants refeitos: o DROP levou os da assinatura antiga junto.
REVOKE EXECUTE ON FUNCTION public.robo_concluir_tarefa(text, uuid, text, text, text, timestamp, text, text) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.robo_concluir_tarefa(text, uuid, text, text, text, timestamp, text, text) TO anon;

-- ============================================================================
-- migration 20260813130100_solicitar_reconhece_glosa
-- ============================================================================

-- Recriação FIEL da definição vigente de listar_central_autorizacoes
-- (20260805170200_ma_auths_escopo_por_data.sql, cópia byte a byte) com DUAS linhas de
-- diferença, ambas no SELECT externo, para a tela reconhecer 'glosa'.
--
-- POR QUE
-- Quando a ASSIM recusa, o robô agora lê o recibo ("BENEFICIO REJEITADO") e grava
-- status='glosa' com guia, horário e motivo — ver 20260813130000_robo_conclui_glosa.sql.
-- Sem as duas linhas abaixo, essa linha cairia no ELSE 'sem_acao' do CASE: o card
-- ficaria em /solicitar sem selo nenhum, com o botão Autorizar habilitado, como se
-- nada tivesse acontecido. Antes desta entrega ela ficava marcada como 'erro', que
-- também era mentira — a solicitação foi processada, o convênio é que recusou.
--
--   (1) status_final ganha 'glosa', para o Controle de Pacientes e a /autorizacoes
--       nomearem o que aconteceu.
--   (2) mostrar_na_tela = false, decisão do usuário: a glosa é desfecho, então o
--       paciente sai de /solicitar como sai um concluído. Refazer a solicitação
--       depois de corrigir o cadastro passa a ser pela /autorizacoes (executarRobo,
--       que devolve a linha para 'pendente').
--
-- Nada muda em listar_central_pacientes: o CASE de status_operacional lá termina em
-- ELSE COALESCE(fa.status, 'pendente'), então 'glosa' já passa inteiro.

CREATE OR REPLACE FUNCTION public.listar_central_autorizacoes(p_data date)
 RETURNS TABLE(paciente_id bigint, paciente_nome text, cpf text, data_nascimento date, data_atendimento date, horario time without time zone, terapias text[], sala_nome text[], profissionais text[], codigos_tuss text[], agendamentos text[], convenio_nome text, convenio_id bigint, empresa text, matricula text, dep text, crm text, nome_medico text, horario_autorizacao timestamp without time zone, ultima_autorizacao_anterior timestamp without time zone, status_final text, mostrar_na_tela boolean, tipo_fluxo text, cancelado_por_nome text)
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
    SELECT max(fa2.horario_autorizacao)
    FROM   public.fila_autorizacoes fa2
    WHERE  fa2.paciente_id::bigint = b.paciente_id
      AND  fa2.data_atendimento    = b.data_atendimento
      AND  fa2.horario             < b.horario
      AND  fa2.status              = 'concluido'
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
  uf.cancelado_por_nome

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

-- ============================================================================
-- migration 20260813130200_alerta_glosa_no_aceite
-- ============================================================================

-- ============================================================================
-- O alerta de glosa deixa de esperar o relatório da ASSIM
-- ----------------------------------------------------------------------------
-- Recriação FIEL de 20260730100200_alertas_regra_assim_cron.sql — SÓ a função; o
-- bloco de cron.schedule daquela migration não é repetido, o agendamento
-- 'alertas-assim-avaliar' continua valendo como está.
--
-- POR QUE
-- Até aqui a glosa só era conhecida quando o robô do relatório trazia
-- situacao='GLOSA' para autorizacoes_assim — no dia seguinte. Agora o robô do
-- autorizador lê a recusa no próprio recibo do aceite ("BENEFICIO REJEITADO",
-- com guia, horário e o motivo "1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS") e
-- grava fila.status='glosa' na hora (20260813130000). Esta migration ensina o
-- avaliador a enxergar esse sinal, e o alerta passa a nascer às 15:43 em vez de
-- no dia seguinte.
--
-- DUAS MUDANÇAS, as duas dentro da função:
--   (1) a CTE fila_com_guia vira fila_desfecho e carrega também o sinal de glosa
--       e o motivo, sem perder nada do que já fazia;
--   (2) um ramo novo em `avaliado`, DEPOIS dos testes de s.situacao — o relatório
--       sempre vence a leitura de tela, porque a rejeição diz "sujeito a análise
--       posterior" e a ASSIM pode liberar depois.
--
-- O fingerprint não muda, então quando o relatório chegar confirmando a glosa o
-- `on conflict do nothing` impede duplicata e a classe continua a mesma — o
-- alerta não é encerrado e reaberto.
-- ----------------------------------------------------------------------------
-- Cabeçalho original preservado abaixo, por ser onde a regra está explicada.
-- ----------------------------------------------------------------------------
-- Depende de 20260730100000_create_alertas_infra.sql e …100100_alertas_rpcs.sql.
--
-- REGRA DE NEGÓCIO (definida pelo usuário):
--   Todo agendamento do TiTa NASCE pendente. Só é tratado como concluído quando
--   tem GUIA VÁLIDA ou FALTA (ou cancelamento). Portanto:
--
--     CONCLUÍDO = guia válida ∪ falta ∪ cancelamento
--     PENDENTE  = todo o resto (o complemento, não apenas 'NAO_SOLICITADA')
--
-- Isso é mais amplo do que a leitura ingênua de get_auditoria_assim. Usar
-- `situacao <> 'NAO_SOLICITADA'` como fim de pendência encerraria o alerta assim
-- que a recepção apenas ENFILEIRASSE o pedido (situacao vira 'SINCRONIZANDO'),
-- deixando o atendimento terminar o dia sem guia e sem pendência aberta — exatamente
-- a falha que este módulo existe para impedir. Também encerraria em 'GLOSA', que é
-- recusa do convênio, não desfecho.
--
-- COMO SE SABE QUE TEM GUIA VÁLIDA — duas fontes, e a primeira é a melhor:
--   1. fila_autorizacoes: no aceite, o robô grava status='concluido' +
--      numero_autorizacao=<guia> (ver robo-autorizador/rpa.js:314-319). É o sinal
--      mais cedo e mais confiável, porque não depende do match posicional.
--   2. autorizacoes_assim via get_auditoria_assim -> situacao='LIBERADA'.
--
-- get_auditoria_assim NÃO conhece fila.numero_autorizacao nem fila.status, e não
-- vamos alterá-la: ela é a RPC da aba Auditoria e precisa ficar preservada. Então a
-- fonte (1) é consultada aqui, ao lado da RPC, só para efeito de alerta.
--
-- DUAS REGRAS, DUAS CLASSES DE PENDÊNCIA:
--   pendente_sem_desfecho -> regra assim_sem_desfecho (média, tolerância 50min)
--   pendente_glosa        -> regra assim_glosa        (alta,  tolerância 0)
-- Um bloco que sai de "sem desfecho" para "glosa" fecha o primeiro alerta e abre o
-- segundo: são problemas diferentes, com ações diferentes. O histórico não se perde
-- porque a timeline (get_alerta_historico) é por ENTIDADE, não por alerta.
--
-- POR QUE NÃO TRIGGER EM autorizacoes_assim: aquela tabela é escrita por um robô
-- externo a este repositório. Um trigger ali refaria o match posicional por linha e,
-- se falhasse, travaria as escritas do robô. O cron reconcilia a cada 10 min sem
-- tocar no caminho de escrita dele.
--
-- ATENÇÃO: get_auditoria_assim passou a ser dependência de ESCRITA. Mudar o que ela
-- classifica muda quais alertas nascem e quais se encerram.
-- ============================================================================

create or replace function public.fn_alertas_avaliar_assim(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agora_local timestamp;
  v_gerados     integer := 0;
  v_encerrados  integer := 0;
  v_regras      integer;
begin
  select count(*) into v_regras
  from public.alertas_regras
  where modulo = 'assim' and ativo
    and codigo in ('assim_sem_desfecho', 'assim_glosa');

  if v_regras = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma regra assim ativa');
  end if;

  -- TIMEZONE — a armadilha desta função.
  -- O cron roda em UTC, mas hora_inicial de agenda_tita é hora de PAREDE local
  -- (America/Sao_Paulo, UTC-3). Comparar (p_data + hora_inicial) direto com now()
  -- erraria em 3 horas.
  v_agora_local := (now() at time zone 'America/Sao_Paulo');

  with
  -- Regras ativas + a classe de pendência que cada uma sustenta.
  regras as (
    select r.codigo, r.setor_destino, r.prioridade, r.tolerancia_minutos, r.nome,
           case r.codigo
             when 'assim_sem_desfecho' then 'pendente_sem_desfecho'
             when 'assim_glosa'        then 'pendente_glosa'
           end as classe_alvo
    from public.alertas_regras r
    where r.modulo = 'assim' and r.ativo
      and r.codigo in ('assim_sem_desfecho', 'assim_glosa')
  ),

  src as (
    select bloco_id, paciente_nome, hora_inicial, codigo_tuss, terapias, profissionais,
           empresa, matricula, dep, situacao, token, guia, codigo_erro, descricao_erro,
           observacao
    from public.get_auditoria_assim(p_data)
  ),

  -- Desfecho que o robô colheu na tela do aceite. Agrupado porque a chave da fila
  -- (empresa/matricula/dep/tuss/horario) pode ter mais de uma linha histórica.
  --
  -- Dois sinais, não um. `tem_guia_aceite` é o que esta CTE já entregava (guia
  -- vinculada a uma conclusão) e continua idêntico — o filtro de status saiu do
  -- WHERE e virou condição do bool_or para não excluir a linha de glosa antes de
  -- olhar para ela. `tem_glosa` é o sinal novo: a ASSIM recusou, e isso foi lido
  -- no recibo, não no relatório.
  fila_desfecho as (
    select f.empresa, f.matricula, f.dep, f.tuss, f.horario,
           bool_or(f.status = 'concluido' and f.numero_autorizacao is not null)
                                                                  as tem_guia_aceite,
           bool_or(f.status = 'glosa')                             as tem_glosa,
           -- Só de linha com desfecho. Sem o filter, o WHERE afrouxado deixaria
           -- entrar guia de linha em 'erro'/'cancelado', que a versão anterior
           -- desta CTE nunca enxergou.
           max(f.numero_autorizacao) filter (
             where f.status in ('concluido', 'glosa')
           )                                                       as numero_autorizacao,
           max(f.status_assim) filter (where f.status = 'glosa')   as motivo_glosa
    from public.fila_autorizacoes f
    where f.data_atendimento = p_data
    group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
  ),

  -- Classifica cada bloco do dia. 'concluido' encerra; as duas classes
  -- 'pendente_*' sustentam a regra correspondente.
  avaliado as (
    select
      s.*,
      fd.numero_autorizacao as guia_fila,
      fd.motivo_glosa,
      case
        -- (1) guia colhida no aceite pelo robô
        when fd.tem_guia_aceite                      then 'concluido'
        -- (2) autorizacoes_assim confirmou liberação, ou o atendimento foi cancelado
        when s.situacao in ('LIBERADA', 'CANCELADA') then 'concluido'
        -- (3) convênio respondeu recusando
        when s.situacao = 'GLOSA'                    then 'pendente_glosa'
        -- (4) recusa lida pelo robô no recibo do aceite, antes de o relatório
        --     existir. Vem DEPOIS de (2) de propósito: o recibo diz "sujeito a
        --     análise posterior", então uma liberação no relatório tem que poder
        --     desfazer esta classificação.
        when fd.tem_glosa                            then 'pendente_glosa'
        -- (5) NAO_SOLICITADA, SINCRONIZANDO, RETORNO_NAO_CONFIRMADO e qualquer
        --     estado futuro: nada de guia, nada de falta -> continua pendente
        else                                              'pendente_sem_desfecho'
      end as classe
    from src s
    left join fila_desfecho fd
      on  fd.empresa  = s.empresa
      and fd.matricula = s.matricula
      and fd.dep      = s.dep
      and fd.tuss     = s.codigo_tuss
      and fd.horario  = s.hora_inicial
  ),

  -- ── Passo 1: gerar ─────────────────────────────────────────────────────────
  novos as (
    insert into public.alertas (
      modulo, regra_codigo, origem, entidade_tipo, entidade_id, entidade_ref,
      titulo, descricao, prioridade, status, setor_destino, fingerprint
    )
    select
      'assim', g.codigo, 'sistema', 'atendimento', a.bloco_id,
      -- token/guia/codigo_erro entram no snapshot porque a Luana lê esses números
      -- INLINE na planilha que este módulo substitui — para contestar uma glosa ela
      -- precisa da guia recusada e do código do erro na própria linha, sem abrir
      -- detalhe. Em 'pendente_sem_desfecho' vêm nulos por definição (não há guia);
      -- em 'pendente_glosa' vêm preenchidos pelo match com autorizacoes_assim.
      jsonb_build_object(
        'paciente_nome', a.paciente_nome,
        'data',          p_data::text,
        'hora',          to_char(a.hora_inicial, 'HH24:MI'),
        'terapia',       a.terapias,
        'profissional',  a.profissionais,
        'tuss',          a.codigo_tuss,
        'token',         a.token,
        'guia',          coalesce(a.guia, a.guia_fila),
        -- Na glosa antecipada não existe codigo_erro (ele vem do relatório). O
        -- motivo lido no recibo já chega no formato "1013-CADASTRO ...", então o
        -- código é o que vem antes do primeiro hífen.
        'codigo_erro',   coalesce(a.codigo_erro, split_part(a.motivo_glosa, '-', 1)),
        'situacao',      a.situacao
      ),
      g.nome,
      case
        when a.classe = 'pendente_glosa' then
          concat('A ASSIM recusou a autorização de ',
                 coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'), '. ',
                 coalesce(nullif(a.codigo_erro, '') || ' - ', ''),
                 -- Só o primeiro hífen vira separador: o resto pertence ao texto
                 -- do motivo e não pode ser tocado.
                 coalesce(a.descricao_erro,
                          regexp_replace(a.motivo_glosa, '^(\d+)-', '\1 - '),
                          'Sem descrição do erro.'))
        else
          concat('Atendimento de ', coalesce(a.paciente_nome, 'paciente não identificado'),
                 ' às ', to_char(a.hora_inicial, 'HH24:MI'),
                 ' não possui guia válida, falta registrada nem cancelamento.')
      end,
      g.prioridade, 'aberto', g.setor_destino,
      concat_ws('|', 'assim', g.codigo, a.bloco_id)
    from avaliado a
    join regras g on g.classe_alvo = a.classe
    -- Tolerância zero = alerta imediato, sem esperar a hora da sessão (glosa é
    -- resposta do convênio e pode chegar antes do atendimento acontecer).
    where g.tolerancia_minutos = 0
       or (p_data + a.hora_inicial)
          + (g.tolerancia_minutos * interval '1 minute') <= v_agora_local
    on conflict do nothing
    returning id, entidade_tipo, entidade_id, regra_codigo
  ),
  ev_novos as (
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome, descricao
    )
    select n.id, n.entidade_tipo, n.entidade_id, 'deteccao', 'sistema', 'Sistema',
      case n.regra_codigo
        when 'assim_glosa' then 'Sistema detectou autorização recusada pela ASSIM.'
        else 'Sistema detectou atendimento sem desfecho operacional.'
      end
    from novos n
    returning 1
  ),

  -- ── Passo 2: reconciliar ────────────────────────────────────────────────────
  -- Encerra o alerta cuja condição deixou de valer. Compara contra a classe ALVO
  -- da própria regra, então cobre três transições: virou concluído, mudou de classe
  -- (sem desfecho -> glosa, ou o contrário), ou o bloco saiu da agenda (falta,
  -- cancelamento, ativo=false).
  encerraveis as (
    select a.id, a.entidade_tipo, a.entidade_id, a.regra_codigo,
           av.classe, av.situacao, av.token, av.guia, av.guia_fila
    from public.alertas a
    join regras g       on g.codigo = a.regra_codigo
    left join avaliado av on av.bloco_id = a.entidade_id
    where a.status <> 'resolvido'
      and a.entidade_ref ->> 'data' = p_data::text
      and (av.bloco_id is null or av.classe <> g.classe_alvo)
  ),
  fechados as (
    update public.alertas a set
      status        = 'resolvido',
      resolvido_em  = now(),
      resolucao     = 'automatico',
      atualizado_em = now()
    from encerraveis e
    where a.id = e.id
    returning a.id, e.entidade_tipo, e.entidade_id,
              e.classe, e.situacao, e.token, e.guia, e.guia_fila
  ),
  ev_fechados as (
    insert into public.alertas_eventos (
      alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_nome,
      descricao, metadata
    )
    select
      f.id, f.entidade_tipo, f.entidade_id,
      case when f.classe = 'concluido' then 'robo' else 'encerramento' end,
      case when f.classe = 'concluido' then 'robo' else 'sistema'      end,
      case when f.classe = 'concluido' then 'Robô' else 'Sistema'      end,
      -- A CLASSE decide a frase, e só depois o token/guia detalham. A ordem importa:
      -- uma linha de GLOSA também tem `guia` preenchida, então testar guia primeiro
      -- fazia um alerta reclassificado como glosa anunciar "Robô encontrou
      -- autorização" — o oposto do que aconteceu.
      case f.classe
        when 'concluido' then
          case
            when coalesce(f.token, '') <> '' then
              concat('Robô encontrou autorização. Token ', f.token,
                     case when f.guia is not null then concat(' · Guia ', f.guia) else '' end)
            when coalesce(f.guia, f.guia_fila) is not null then
              concat('Robô encontrou autorização. Guia ', coalesce(f.guia, f.guia_fila))
            else 'Guia válida registrada para o atendimento.'
          end
        when 'pendente_glosa'        then 'A ASSIM respondeu recusando. Reclassificado como glosa.'
        when 'pendente_sem_desfecho' then 'Atendimento voltou a ficar sem guia válida.'
        else 'Atendimento saiu da lista de pendências (falta, cancelamento ou sessão removida da agenda).'
      end,
      jsonb_build_object(
        'classe',   f.classe,
        'situacao', f.situacao,
        'token',    f.token,
        'guia',     coalesce(f.guia, f.guia_fila),
        'motivo',   case when f.classe is null then 'fora_da_agenda' else f.classe end
      )
    from fechados f
    returning 1
  )
  select
    (select count(*) from ev_novos),
    (select count(*) from ev_fechados)
  into v_gerados, v_encerrados;

  return jsonb_build_object(
    'ok',         true,
    'data',       p_data,
    'gerados',    v_gerados,
    'encerrados', v_encerrados
  );
end;
$$;

grant execute on function public.fn_alertas_avaliar_assim(date) to authenticated;

comment on function public.fn_alertas_avaliar_assim(date) is
  'Gera e encerra alertas ASSIM para uma data. Concluído = guia válida (fila.numero_autorizacao ou situacao LIBERADA) ∪ falta ∪ cancelamento; pendente é o complemento. Idempotente. Chamada pelo cron alertas-assim-avaliar.';

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260813130000','robo_conclui_glosa'),
  ('20260813130100','solicitar_reconhece_glosa'),
  ('20260813130200','alerta_glosa_no_aceite')
on conflict (version) do nothing;

commit;

-- ============================================================
-- Conferencia
-- ============================================================

-- 1. robo_concluir_tarefa tem 8 argumentos, esta em anon e NAO em
--    authenticated, e nao ficou sobrecarga de 7 para trás.
select p.oid::regprocedure                                as assinatura,
       has_function_privilege('anon', p.oid, 'EXECUTE')    as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'robo_concluir_tarefa';

-- 2. A allow-list aceita glosa e recusa o resto. Nao grava nada:
--    o fila_id inexistente faz o UPDATE nao achar linha.
--    Esperado: erro 22023 na segunda, nao na primeira.
--    (rodar com um token real de maquina)
-- select public.robo_concluir_tarefa('<token>', gen_random_uuid(), 'glosa');
-- select public.robo_concluir_tarefa('<token>', gen_random_uuid(), 'cancelado');

-- 3. Sessoes em glosa do dia: status_final e mostrar_na_tela.
--    Esperado: 'glosa' e false.
-- select paciente_nome, status_final, mostrar_na_tela
-- from public.listar_central_autorizacoes(current_date)
-- where status_final = 'glosa';

-- 4. O alerta de glosa nasce na mesma passada, com guia e codigo do erro.
-- select public.fn_alertas_avaliar_assim(current_date);
-- select titulo, descricao, entidade_ref->>'guia' as guia,
--        entidade_ref->>'codigo_erro' as codigo_erro
-- from public.alertas
-- where regra_codigo = 'assim_glosa' and status <> 'resolvido';
