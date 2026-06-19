-- Enriquecimento de registros tita_csv com dados de beneficiário
--
-- Problema: registros com origem='tita_csv' chegam ao agenda_tita com
-- cpf=null, convenio_id=null, numero_carteirinha=null porque o CSV do TITA
-- expõe apenas dados de grade. Esses campos nulos bloqueiam o fluxo RPA
-- (empresa/matricula/dep vazios antes de interagir com ASSIM).
--
-- Solução:
--   1. Backfill: copia dados do registro mais confiável do mesmo paciente
--   2. Trigger BEFORE INSERT: enriquece novos tita_csv na hora da inserção
--   3. Trigger AFTER INSERT: reconcilia tita_csv quando um grade chega depois
--   4. Atualiza vw_central_autorizacoes para usar COALESCE com fallback
--
-- Prioridade de fonte: grade > dados completos > mais recente

-- ============================================================================
-- Parte 1: Backfill de registros já existentes
-- ============================================================================

UPDATE public.agenda_tita dest
SET
  cpf                = COALESCE(dest.cpf,                src.cpf),
  data_nascimento    = COALESCE(dest.data_nascimento,    src.data_nascimento),
  convenio_id        = COALESCE(dest.convenio_id,        src.convenio_id),
  convenio_nome      = COALESCE(dest.convenio_nome,      src.convenio_nome),
  numero_carteirinha = COALESCE(dest.numero_carteirinha, src.numero_carteirinha),
  updated_at         = NOW()
FROM (
  SELECT DISTINCT ON (a1.id)
    a1.id AS dest_id,
    a2.cpf,
    a2.data_nascimento,
    a2.convenio_id,
    a2.convenio_nome,
    a2.numero_carteirinha
  FROM public.agenda_tita a1
  JOIN public.agenda_tita a2
    ON  a2.paciente_id = a1.paciente_id
    AND a2.id         != a1.id
    AND (a2.cpf IS NOT NULL OR a2.numero_carteirinha IS NOT NULL)
  WHERE a1.origem = 'tita_csv'
    AND (a1.cpf IS NULL OR a1.numero_carteirinha IS NULL)
  ORDER BY
    a1.id,
    (a2.origem = 'grade') DESC,
    (a2.cpf IS NOT NULL AND a2.numero_carteirinha IS NOT NULL) DESC,
    a2.updated_at DESC
) src
WHERE dest.id = src.dest_id;

-- ============================================================================
-- Parte 2: Trigger BEFORE INSERT para novos registros tita_csv
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_enrich_tita_csv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  src RECORD;
BEGIN
  IF NEW.cpf IS NULL OR NEW.numero_carteirinha IS NULL THEN
    SELECT cpf, data_nascimento, convenio_id, convenio_nome, numero_carteirinha
    INTO src
    FROM public.agenda_tita
    WHERE paciente_id = NEW.paciente_id
      AND (cpf IS NOT NULL OR numero_carteirinha IS NOT NULL)
    ORDER BY
      (origem = 'grade') DESC,
      (cpf IS NOT NULL AND numero_carteirinha IS NOT NULL) DESC,
      updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      NEW.cpf                := COALESCE(NEW.cpf,                src.cpf);
      NEW.data_nascimento    := COALESCE(NEW.data_nascimento,    src.data_nascimento);
      NEW.convenio_id        := COALESCE(NEW.convenio_id,        src.convenio_id);
      NEW.convenio_nome      := COALESCE(NEW.convenio_nome,      src.convenio_nome);
      NEW.numero_carteirinha := COALESCE(NEW.numero_carteirinha, src.numero_carteirinha);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrich_tita_csv ON public.agenda_tita;

CREATE TRIGGER trg_enrich_tita_csv
BEFORE INSERT ON public.agenda_tita
FOR EACH ROW
WHEN (NEW.origem = 'tita_csv')
EXECUTE FUNCTION public.fn_enrich_tita_csv();

-- ============================================================================
-- Parte 2b: Trigger AFTER INSERT no grade para reconciliar tita_csv atrasado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_reconcile_tita_csv_after_grade()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.agenda_tita
  SET
    cpf                = COALESCE(cpf,                NEW.cpf),
    data_nascimento    = COALESCE(data_nascimento,    NEW.data_nascimento),
    convenio_id        = COALESCE(convenio_id,        NEW.convenio_id),
    convenio_nome      = COALESCE(convenio_nome,      NEW.convenio_nome),
    numero_carteirinha = COALESCE(numero_carteirinha, NEW.numero_carteirinha),
    updated_at         = NOW()
  WHERE origem = 'tita_csv'
    AND paciente_id = NEW.paciente_id
    AND (cpf IS NULL OR numero_carteirinha IS NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_tita_csv_after_grade ON public.agenda_tita;

CREATE TRIGGER trg_reconcile_tita_csv_after_grade
AFTER INSERT ON public.agenda_tita
FOR EACH ROW
WHEN (NEW.origem = 'grade' AND (NEW.cpf IS NOT NULL OR NEW.numero_carteirinha IS NOT NULL))
EXECUTE FUNCTION public.fn_reconcile_tita_csv_after_grade();

-- ============================================================================
-- Parte 3: Atualizar vw_central_autorizacoes com COALESCE e fallback
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_central_autorizacoes AS
WITH fallback_pat AS (
  SELECT DISTINCT ON (paciente_id)
    paciente_id,
    cpf,
    data_nascimento,
    convenio_id,
    convenio_nome,
    numero_carteirinha,
    substring(numero_carteirinha, 1, 6) AS empresa,
    substring(numero_carteirinha, 7, 7) AS matricula,
    right(regexp_replace(numero_carteirinha, '\D', '', 'g'), 2) AS dep
  FROM public.agenda_tita
  WHERE cpf IS NOT NULL OR numero_carteirinha IS NOT NULL
  ORDER BY
    paciente_id,
    (origem = 'grade') DESC,
    (cpf IS NOT NULL AND numero_carteirinha IS NOT NULL) DESC,
    updated_at DESC
),
base AS (
  SELECT
    ag.paciente_id,
    ag.paciente_nome,
    COALESCE(ag.cpf, fp.cpf) AS cpf,
    COALESCE(ag.data_nascimento, fp.data_nascimento) AS data_nascimento,
    ag.data_atendimento,
    ag.hora_inicial AS horario,
    array_agg(DISTINCT ag.terapia_nome) AS terapias,
    array_agg(DISTINCT ag.sala_nome) AS sala_nome,
    array_agg(DISTINCT ag.profissional_nome) AS profissionais,
    array_agg(DISTINCT ag.codigo_tuss) AS codigos_tuss,
    array_agg(DISTINCT (ag.tita_agendamento_id)::text) AS agendamentos,
    COALESCE(ag.convenio_nome, fp.convenio_nome) AS convenio_nome,
    COALESCE(ag.convenio_id, fp.convenio_id) AS convenio_id,
    COALESCE(ag.empresa, fp.empresa) AS empresa,
    COALESCE(ag.matricula, fp.matricula) AS matricula,
    COALESCE(ag.dep, fp.dep) AS dep,
    ag.crm,
    ag.nome_medico
  FROM public.agenda_tita_autorizacao ag
  LEFT JOIN fallback_pat fp ON fp.paciente_id = ag.paciente_id
  WHERE (
    (lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (
      ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text,
            'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text,
            'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text,
            'técnico terapêutico particular'::text, 'triagem'::text]
    ))
    AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text)
    AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text)
  )
  GROUP BY
    ag.paciente_id, ag.paciente_nome,
    COALESCE(ag.cpf, fp.cpf),
    COALESCE(ag.data_nascimento, fp.data_nascimento),
    ag.data_atendimento, ag.hora_inicial,
    COALESCE(ag.convenio_nome, fp.convenio_nome),
    COALESCE(ag.convenio_id, fp.convenio_id),
    COALESCE(ag.empresa, fp.empresa),
    COALESCE(ag.matricula, fp.matricula),
    COALESCE(ag.dep, fp.dep),
    ag.crm, ag.nome_medico
),
match_assim AS (
  SELECT DISTINCT
    vw_match_autorizacoes_assim.paciente_id,
    vw_match_autorizacoes_assim.data_atendimento,
    vw_match_autorizacoes_assim.hora_inicial AS horario,
    vw_match_autorizacoes_assim.status_assim,
    vw_match_autorizacoes_assim.data_execucao
  FROM public.vw_match_autorizacoes_assim
),
ultima_fila AS (
  SELECT DISTINCT ON (fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario)
    fila_autorizacoes.paciente_id,
    fila_autorizacoes.data_atendimento,
    fila_autorizacoes.horario,
    fila_autorizacoes.status,
    fila_autorizacoes.horario_autorizacao,
    fila_autorizacoes.cancelado_por_nome,
    fila_autorizacoes.created_at
  FROM public.fila_autorizacoes
  ORDER BY
    fila_autorizacoes.paciente_id,
    fila_autorizacoes.data_atendimento,
    fila_autorizacoes.horario,
    fila_autorizacoes.created_at DESC
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
  (SELECT max(ma2.data_execucao) AS max
   FROM match_assim ma2
   WHERE (ma2.paciente_id = b.paciente_id
     AND ma2.data_atendimento = b.data_atendimento
     AND ma2.horario < b.horario)) AS ultima_autorizacao_anterior,
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
  LEFT JOIN match_assim ma ON ((ma.paciente_id = b.paciente_id
    AND ma.data_atendimento = b.data_atendimento
    AND ma.horario = b.horario)))
  LEFT JOIN ultima_fila uf ON (((uf.paciente_id)::bigint = b.paciente_id
    AND uf.data_atendimento = b.data_atendimento
    AND uf.horario = b.horario)));
