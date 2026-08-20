-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Identico a supabase/migrations/20260820100000_tokens_mensal_inclui_erro_facial.sql
-- (CREATE OR REPLACE, mesma assinatura -- nao precisa de DROP).
--
-- Depois de rodar, registrar no livro-caixa (bloco final deste arquivo).

-- =============================================================================
-- 20260820100000_tokens_mensal_inclui_erro_facial.sql
-- =============================================================================
-- Conferência de filipetas: a lista mensal passa a incluir as sessões validadas
-- como "Erro no Reconhecimento Facial", não só as que tiveram token.
--
-- O QUE MUDA E POR QUÊ
--
-- A recepção escolhe a forma de validação no modal do robô
-- (`OPCOES_VALIDACAO` em robo-autorizador/rpa.js) e ela é gravada em
-- fila_autorizacoes.forma_autorizacao. Duas dessas formas deixam papel para
-- conferir depois: o token (filipeta) e o erro de reconhecimento facial. A tela
-- diária já trata as duas igual; esta função ainda enxergava só a primeira.
--
-- O DESENHO CONTINUA O MESMO, COM DUAS SEMENTES EM VEZ DE UMA
--
-- 20260819150000 trocou "calcula o mês inteiro e joga 99% fora" por "parte do
-- token e só puxa o que ele precisa": as CHAVES DE PARTIÇÃO
-- (empresa, matricula, dep, dia, tuss) das autorizações com filipeta viram o
-- funil que restringe os dois lados do match. Aqui a semente ganha uma segunda
-- origem — as sessões com erro facial, que vêm da fila e precisam da
-- carteirinha da agenda para virar chave.
--
-- A invariante que faz o funil ser seguro é preservada: filtramos PARTIÇÕES
-- INTEIRAS, nunca linhas soltas dentro de uma partição, então o pareamento por
-- ordem (ordem_sessao <-> ordem_autorizacao) numera cada partição sobrevivente
-- exatamente como a auditoria diária numera. Ampliar o conjunto de partições
-- não mexe na numeração das que já entravam.
--
-- O recorte de erro facial é por LINHA e acontece no fim, junto do
-- `mt.teve_token = true` — partição ampla para o match, filtro fino para o que
-- aparece.
--
-- Enquanto não houver nenhuma linha com essa forma no mês, o resultado é
-- idêntico ao de hoje: `chaves_facial` vem vazia e o OR do WHERE final nunca é
-- verdadeiro. Não há regressão possível na lista de tokens.
--
-- `token` volta NULL nessas linhas (não houve filipeta com número) e
-- `forma_autorizacao` é o que diz por que a sessão está na lista — o frontend
-- escreve "Erro no Reconhecimento Facial" no lugar do número.
--
-- Mesma assinatura e mesmas colunas: CREATE OR REPLACE sem DROP.
--
-- O `SET statement_timeout` volta explícito: CREATE OR REPLACE não herda o
-- proconfig da definição anterior, então o ALTER FUNCTION de 20260819140000 se
-- perdeu silenciosamente no CREATE OR REPLACE de 20260819150000. Declarado
-- aqui, sobrevive à próxima substituição.

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
  chaves AS (
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_token
    UNION
    SELECT empresa, matricula_base, dep, dia, codigo_tuss FROM chaves_facial
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
    mt.guia,
    mt.token,
    mt.data_execucao,
    fo.criado_por,
    fo.forma_autorizacao
  FROM blocos_auditoria b
  JOIN match_temporal mt ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.paciente_id      = b.paciente_id
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  WHERE (
      mt.teve_token = true
      OR fo.forma_autorizacao ILIKE '%reconhecimento facial%'
    )
    AND COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY b.data_atendimento, b.hora_inicial, b.paciente_nome
$function$
;

-- =============================================================================
-- Registro no livro-caixa (depois que tudo acima rodou sem erro)
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260820100000', 'tokens_mensal_inclui_erro_facial')
ON CONFLICT (version) DO NOTHING;
