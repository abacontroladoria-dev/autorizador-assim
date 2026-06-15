-- Rastreia quem cancelou uma solicitação na fila de autorizações.
--
-- Mudanças:
--   1. Colunas cancelado_por_nome / cancelado_em em fila_autorizacoes.
--   2. vw_central_autorizacoes passa a expor cancelado_por_nome e a mapear
--      o status 'cancelado' explicitamente em status_final (antes caía em
--      'sem_acao', o que escondia o badge "Cancelada por: X" após reload).

ALTER TABLE public.fila_autorizacoes
  ADD COLUMN IF NOT EXISTS cancelado_por_nome text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz;

create or replace view "public"."vw_central_autorizacoes" as  WITH base AS (
         SELECT ag.paciente_id,
            ag.paciente_nome,
            ag.cpf,
            ag.data_nascimento,
            ag.data_atendimento,
            ag.hora_inicial AS horario,
            array_agg(DISTINCT ag.terapia_nome) AS terapias,
            array_agg(DISTINCT ag.sala_nome) AS sala_nome,
            array_agg(DISTINCT ag.profissional_nome) AS profissionais,
            array_agg(DISTINCT ag.codigo_tuss) AS codigos_tuss,
            array_agg(DISTINCT (ag.tita_agendamento_id)::text) AS agendamentos,
            ag.convenio_nome,
            ag.convenio_id,
            ag.empresa,
            ag.matricula,
            ag.dep,
            ag.crm,
            ag.nome_medico
           FROM public.agenda_tita_autorizacao ag
          WHERE ((lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text, 'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text, 'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text, 'técnico terapêutico particular'::text, 'triagem'::text])) AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text) AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text))
          GROUP BY ag.paciente_id, ag.paciente_nome, ag.cpf, ag.data_nascimento, ag.data_atendimento, ag.hora_inicial, ag.convenio_nome, ag.convenio_id, ag.empresa, ag.matricula, ag.dep, ag.crm, ag.nome_medico
        ), match_assim AS (
         SELECT DISTINCT vw_match_autorizacoes_assim.paciente_id,
            vw_match_autorizacoes_assim.data_atendimento,
            vw_match_autorizacoes_assim.hora_inicial AS horario,
            vw_match_autorizacoes_assim.status_assim,
            vw_match_autorizacoes_assim.data_execucao
           FROM public.vw_match_autorizacoes_assim
        ), ultima_fila AS (
         SELECT DISTINCT ON (fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario) fila_autorizacoes.paciente_id,
            fila_autorizacoes.data_atendimento,
            fila_autorizacoes.horario,
            fila_autorizacoes.status,
            fila_autorizacoes.horario_autorizacao,
            fila_autorizacoes.cancelado_por_nome,
            fila_autorizacoes.created_at
           FROM public.fila_autorizacoes
          ORDER BY fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario, fila_autorizacoes.created_at DESC
        )
 SELECT b.paciente_id,
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
    ( SELECT max(ma2.data_execucao) AS max
           FROM match_assim ma2
          WHERE ((ma2.paciente_id = b.paciente_id) AND (ma2.data_atendimento = b.data_atendimento) AND (ma2.horario < b.horario))) AS ultima_autorizacao_anterior,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN 'autorizado_externo'::text
            WHEN (uf.status = 'concluido'::text) THEN 'concluido'::text
            WHEN (uf.status = 'concluido_sem_guia'::text) THEN 'concluido_sem_guia'::text
            WHEN (uf.status = 'falta'::text) THEN 'falta'::text
            WHEN (uf.status = 'processando'::text) THEN 'processando'::text
            WHEN (uf.status = 'pendente'::text) THEN 'pendente'::text
            WHEN (uf.status = 'cancelado'::text) THEN 'cancelado'::text
            WHEN (uf.status = 'erro'::text) THEN 'erro'::text
            ELSE 'sem_acao'::text
        END AS status_final,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN false
            WHEN (uf.status = ANY (ARRAY['concluido'::text, 'falta'::text, 'concluido_sem_guia'::text])) THEN false
            ELSE true
        END AS mostrar_na_tela,
        CASE
            WHEN (lower(COALESCE(b.convenio_nome, ''::text)) ~~ '%assim%'::text) THEN 'autorizacao'::text
            ELSE 'presenca'::text
        END AS tipo_fluxo,
    uf.cancelado_por_nome
   FROM ((base b
     LEFT JOIN match_assim ma ON (((ma.paciente_id = b.paciente_id) AND (ma.data_atendimento = b.data_atendimento) AND (ma.horario = b.horario))))
     LEFT JOIN ultima_fila uf ON ((((uf.paciente_id)::bigint = b.paciente_id) AND (uf.data_atendimento = b.data_atendimento) AND (uf.horario = b.horario))));
