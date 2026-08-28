-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Idêntico a supabase/migrations/20260819110000_detalhamento_atendimento_auditoria_assim.sql
-- (duas tabelas novas + recriação de get_auditoria_assim com 3 colunas extras).
-- Idempotente de ponta a ponta: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS
-- antes de cada CREATE POLICY. Pode rodar o arquivo inteiro de novo sem editar
-- nada, mesmo que uma tentativa anterior já tenha criado tabelas/policies.
--
-- Correção (mesmo dia, arquivo atualizado): o join de fila_operacional usava
-- empresa/matricula/dep (parseados da carteirinha vs. gravados direto em
-- fila_autorizacoes) — chave frágil que casava errado silenciosamente e
-- devolvia criado_por/forma_autorizacao/horario_autorizacao nulos mesmo com a
-- linha existindo. Trocado para paciente_id+data+horario+tuss, mesmo padrão
-- comprovado em vw_central_pacientes (20260805170100). Se você já rodou a
-- versão anterior deste arquivo, rode de novo a partir do DROP FUNCTION —
-- é idempotente e vai substituir a função pela versão corrigida.
--
-- Depois de rodar, registrar no livro-caixa (bloco final deste arquivo).

-- =============================================================================
-- 20260819110000_detalhamento_atendimento_auditoria_assim.sql
-- =============================================================================

create table if not exists public.auditoria_atendimento_notas (
  id                uuid primary key default gen_random_uuid(),
  bloco_id          text not null unique,
  texto             text not null,
  criado_por        uuid references auth.users,
  criado_em         timestamptz not null default now(),
  atualizado_por    uuid references auth.users,
  atualizado_por_nome text,
  atualizado_em     timestamptz not null default now()
);

alter table public.auditoria_atendimento_notas enable row level security;

drop policy if exists "auditoria_atendimento_notas_all" on public.auditoria_atendimento_notas;
create policy "auditoria_atendimento_notas_all" on public.auditoria_atendimento_notas
  for all to authenticated using (true) with check (true);

create table if not exists public.auditoria_token_conferencias (
  id                  uuid primary key default gen_random_uuid(),
  bloco_id            text not null unique,
  conferido           boolean not null default false,
  conferido_por       uuid references auth.users,
  conferido_por_nome  text,
  conferido_em        timestamptz
);

alter table public.auditoria_token_conferencias enable row level security;

drop policy if exists "auditoria_token_conferencias_all" on public.auditoria_token_conferencias;
create policy "auditoria_token_conferencias_all" on public.auditoria_token_conferencias
  for all to authenticated using (true) with check (true);

DROP FUNCTION IF EXISTS public.get_auditoria_assim(date);

CREATE OR REPLACE FUNCTION public.get_auditoria_assim(p_data date)
 RETURNS TABLE(bloco_id text, paciente_id text, paciente_nome text, empresa text, matricula text, dep text, carteirinha text, data_atendimento date, hora_inicial time without time zone, codigo_tuss text, convenio_nome text, terapias text, profissionais text, quantidade_sessoes bigint, guia text, status_assim text, codigo_erro text, descricao_erro text, data_execucao timestamp with time zone, autorizacao_updated_at timestamp with time zone, diferenca_minutos numeric, situacao text, prioridade integer, dias_atraso integer, possui_autorizacao boolean, possui_solicitacao boolean, observacao text, motivo_glosa text, teve_token boolean, token text, criado_por text, forma_autorizacao text, horario_autorizacao timestamp without time zone)
 LANGUAGE sql
 STABLE
AS $function$
  WITH blocos_auditoria AS (
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
      WHERE at.data_atendimento = p_data
        AND at.ativo = true
        AND at.convenio_nome ILIKE '%assim%'
        AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo','Notificação Prévia'])
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
          AND f.data_atendimento = p_data
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
      concat_ws('.', asf.empresa, asf.matricula, asf.dep) AS carteirinha,
      asf.data_atendimento,
      asf.hora_inicial,
      asf.codigo_tuss,
      asf.convenio_nome,
      string_agg(DISTINCT asf.terapia_exibicao_nome, ' | ' ORDER BY asf.terapia_exibicao_nome) AS terapias,
      string_agg(DISTINCT asf.profissional_nome,     ' | ' ORDER BY asf.profissional_nome)     AS profissionais,
      count(*) AS quantidade_sessoes
    FROM agenda_sem_falta asf
    GROUP BY asf.paciente_id, asf.paciente_nome, asf.empresa, asf.matricula, asf.dep,
             asf.data_atendimento, asf.hora_inicial, asf.codigo_tuss, asf.convenio_nome
  ),
  fila_operacional AS (
    SELECT DISTINCT ON (f.paciente_id, f.data_atendimento, f.horario, f.tuss)
      f.empresa, f.matricula, f.dep, f.paciente_id, f.data_atendimento, f.horario,
      f.tuss AS codigo_tuss,
      COALESCE(f.updated_at, f.created_at) AS ultimo_updated_at,
      f.criado_por,
      f.forma_autorizacao,
      f.horario_autorizacao
    FROM fila_autorizacoes f
    WHERE f.data_atendimento = p_data
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
        b1.bloco_id, b1.paciente_id, b1.paciente_nome, b1.empresa, b1.matricula, b1.dep,
        b1.carteirinha, b1.data_atendimento, b1.hora_inicial, b1.codigo_tuss,
        b1.convenio_nome, b1.terapias, b1.profissionais, b1.quantidade_sessoes,
        row_number() OVER (
          PARTITION BY b1.empresa, b1.matricula, b1.dep, b1.data_atendimento, b1.codigo_tuss
          ORDER BY b1.hora_inicial
        ) AS ordem_sessao
      FROM blocos_auditoria b1
    ),
    autorizacoes AS (
      SELECT
        aa.guia, aa.matricula, aa.paciente_nome, aa.data_execucao, aa.data_autorizacao,
        aa.status, aa.codigo_tuss, aa.codigo_erro, aa.descricao_erro,
        aa.teve_token, aa.updated_at, aa.token, aa.status_tratado, aa.matricula_limpa, aa.paciente_id,
        split_part(aa.matricula, '.', 1)               AS empresa,
        split_part(aa.matricula, '.', 2)               AS matricula_base,
        split_part(aa.matricula, '.', 3)               AS dep,
        row_number() OVER (
          PARTITION BY split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                       split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
          ORDER BY aa.data_execucao
        ) AS ordem_autorizacao
      FROM autorizacoes_assim aa
      WHERE date(aa.data_execucao) = p_data
    )
    SELECT DISTINCT ON (s.bloco_id)
      s.bloco_id,
      a.guia, a.status, a.codigo_erro, a.descricao_erro, a.data_execucao, a.updated_at,
      a.teve_token, a.token,
      EXTRACT(epoch FROM a.data_execucao::time - s.hora_inicial) / 60 AS diferenca_minutos
    FROM sessoes s
    LEFT JOIN autorizacoes a
      ON  a.empresa        = s.empresa
      AND a.matricula_base  = s.matricula
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
    b.empresa,
    b.matricula,
    b.dep,
    b.carteirinha,
    b.data_atendimento,
    b.hora_inicial,
    b.codigo_tuss,
    b.convenio_nome,
    b.terapias,
    b.profissionais,
    b.quantidade_sessoes,
    mt.guia,
    mt.status                                             AS status_assim,
    mt.codigo_erro,
    mt.descricao_erro,
    mt.data_execucao,
    mt.updated_at                                         AS autorizacao_updated_at,
    mt.diferenca_minutos,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
                                                          THEN 'GLOSA'
      WHEN mt.status = 'Liberado *'                      THEN 'CANCELADA'
      WHEN mt.status = 'Liberado'                        THEN 'LIBERADA'
      WHEN fo.matricula IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
                                                          THEN 'SINCRONIZANDO'
      WHEN fo.matricula IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
                                                          THEN 'RETORNO_NAO_CONFIRMADO'
      ELSE                                                     'NAO_SOLICITADA'
    END                                                   AS situacao,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *'])) THEN 2
      WHEN mt.status = 'Liberado *'                      THEN 5
      WHEN mt.status = 'Liberado'                        THEN 6
      WHEN fo.matricula IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes' THEN 4
      WHEN fo.matricula IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes') THEN 3
      ELSE 1
    END                                                   AS prioridade,
    (CURRENT_DATE - b.data_atendimento)::integer          AS dias_atraso,
    (mt.status = 'Liberado')                              AS possui_autorizacao,
    (fo.matricula IS NOT NULL)                            AS possui_solicitacao,
    CASE
      WHEN mt.codigo_erro IS NOT NULL
        OR (mt.status IS NOT NULL AND mt.status <> ALL (ARRAY['Liberado','Liberado *']))
        THEN concat('Glosa: ',
               COALESCE(mt.codigo_erro, mt.status, 'Erro não identificado'),
               CASE WHEN mt.descricao_erro IS NOT NULL THEN concat(' - ', mt.descricao_erro) ELSE '' END)
      WHEN mt.status = 'Liberado' AND mt.teve_token = true
        THEN concat('TOKEN - ', mt.token)
      WHEN mt.status = 'Liberado'    THEN 'Autorização confirmada pela ASSIM'
      WHEN mt.status = 'Liberado *'  THEN 'Autorização cancelada'
      WHEN fo.matricula IS NOT NULL
        AND fo.ultimo_updated_at IS NOT NULL
        AND (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) <= INTERVAL '10 minutes'
        THEN 'Solicitação enviada. Aguardando sincronização com a ASSIM.'
      WHEN fo.matricula IS NOT NULL
        AND (fo.ultimo_updated_at IS NULL
             OR (now() - (fo.ultimo_updated_at AT TIME ZONE 'UTC')) > INTERVAL '10 minutes')
        THEN 'Solicitação enviada, mas o retorno da ASSIM ainda não foi confirmado.'
      ELSE 'Nenhuma solicitação encontrada'
    END                                                   AS observacao,
    agm.motivo_glosa,
    mt.teve_token,
    mt.token,
    fo.criado_por,
    fo.forma_autorizacao,
    fo.horario_autorizacao
  FROM blocos_auditoria b
  LEFT JOIN match_temporal mt        ON mt.bloco_id = b.bloco_id
  LEFT JOIN fila_operacional fo
    ON  fo.paciente_id      = b.paciente_id
    AND fo.data_atendimento = b.data_atendimento
    AND fo.codigo_tuss      = b.codigo_tuss
    AND fo.horario          = b.hora_inicial
  LEFT JOIN auditoria_glosa_motivos agm ON agm.bloco_id = b.bloco_id
  WHERE COALESCE(b.terapias, '') NOT ILIKE '%Equoterapia%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Fisioterapia Aquática%'
    AND COALESCE(b.terapias, '') NOT ILIKE '%Avaliação Neuropsicológica%'
  ORDER BY prioridade, hora_inicial
$function$
;

-- =============================================================================
-- Registro no livro-caixa (depois que tudo acima rodou sem erro)
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260819110000', 'detalhamento_atendimento_auditoria_assim')
ON CONFLICT (version) DO NOTHING;
