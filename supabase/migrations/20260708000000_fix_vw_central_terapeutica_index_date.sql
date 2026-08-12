-- Terceiro (e definitivo) fix de timeout da vw_central_terapeutica.
--
-- Causa raiz remanescente: a coluna data_atendimento da view era
--   COALESCE(ct.data_atendimento, a.data_atendimento).
-- Como controle_terapeutico (ct) entra por LEFT JOIN, o planner NÃO consegue
-- empurrar o filtro `.eq('data_atendimento', <dia>)` para o índice de
-- agenda_tita. Ele precisa juntar agenda_tita INTEIRA (todas as datas e todas
-- as versões — a tabela é versionada e cresce a cada sync) com
-- controle_terapeutico ANTES de filtrar pela data. Sob carga isso estoura o
-- statement_timeout do PostgREST → o frontend recebe erro e exibe
-- "nenhum atendimento / nenhum terapeuta" de forma intermitente.
--
-- ct.data_atendimento é apenas um snapshot copiado de a.data_atendimento no
-- upsert (ver 20260518140500). Para "a agenda de hoje" a data correta é sempre
-- a da agenda ATIVA. Trocando a expressão por a.data_atendimento puro, o filtro
-- passa a usar idx_agenda_tita_data_ativo (data_atendimento, ativo) WHERE ativo,
-- filtrando ANTES do join — de full scan para index scan.
--
-- Demais colunas (hora, profissional, terapia, status) permanecem com COALESCE:
-- só o filtro de data trava o índice, e o sort/coalesce dessas rodam sobre o
-- conjunto já reduzido do dia.

CREATE INDEX IF NOT EXISTS idx_agenda_tita_data_ativo
  ON public.agenda_tita (data_atendimento, ativo)
  WHERE ativo = TRUE;

CREATE OR REPLACE VIEW public.vw_central_terapeutica AS
SELECT
  a.tita_agendamento_id,
  a.data_atendimento,
  COALESCE(ct.hora_inicial,     a.hora_inicial)     AS hora_inicial,
  COALESCE(ct.hora_final,       a.hora_final)       AS hora_final,
  a.paciente_id,
  a.paciente_nome,
  COALESCE(ct.profissional_id,   a.profissional_id)   AS profissional_id,
  COALESCE(ct.profissional_nome, a.profissional_nome) AS profissional_nome,
  COALESCE(ct.terapia_id,   a.terapia_id)   AS terapia_id,
  COALESCE(ct.terapia_nome, a.terapia_nome) AS terapia_nome,
  a.sala_id,
  a.sala_nome,
  CASE
    WHEN a.sala_nome ~~* '%Realengo%'     THEN 'Realengo'
    WHEN a.sala_nome ~~* '%Fazendinha%'   THEN 'Fazendinha'
    WHEN a.sala_nome ~~* '%Padre Miguel%' THEN 'Padre Miguel'
    ELSE 'Outros'
  END AS unidade,
  REGEXP_REPLACE(
    a.sala_nome,
    '^Unid\.\s(Realengo|Fazendinha|Padre Miguel)\s-\s',
    ''
  ) AS sala_operacional,
  a.clinica_id,
  a.clinica_nome,
  a.convenio_nome,
  COALESCE(ct.status, 'pendente') AS status,
  ct.profissional_substituto_id,
  ct.profissional_substituto_nome,
  ct.observacao,
  ct.confirmado_por,
  ct.confirmado_em,
  ct.created_at AS controle_created_at,
  ct.updated_at AS controle_updated_at,
  ct.confirmado_por_nome
FROM public.agenda_tita a
JOIN public.terapias_controle tc
  ON  tc.terapia_id = a.terapia_id
  AND tc.ativo      = TRUE
LEFT JOIN public.controle_terapeutico ct
  ON ct.tita_agendamento_id = a.tita_agendamento_id
WHERE a.ativo = TRUE;
