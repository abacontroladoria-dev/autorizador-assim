-- Adiciona confirmado_por_nome à vw_central_terapeutica para exibição de auditoria
-- no card de terapeuta da central terapêutica.
CREATE OR REPLACE VIEW public.vw_central_terapeutica AS
SELECT
  a.tita_agendamento_id,
  COALESCE(ct.data_atendimento, a.data_atendimento) AS data_atendimento,
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
  COALESCE(ct.profissional_substituto_nome, sub.profissional_nome) AS profissional_substituto_nome,
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
LEFT JOIN (
  SELECT DISTINCT ON (profissional_id)
    profissional_id,
    profissional_nome
  FROM public.agenda_tita
  ORDER BY profissional_id
) sub ON sub.profissional_id = ct.profissional_substituto_id
WHERE a.ativo = TRUE;
