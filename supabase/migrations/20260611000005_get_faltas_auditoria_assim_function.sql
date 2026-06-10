-- Cria função parametrizada para buscar faltas da Auditoria ASSIM.
--
-- Problema: listarFaltasAuditoria() consultava fila_autorizacoes.terapia_nome
-- para excluir terapias não-ASSIM. Porém esse campo armazena a terapia de
-- exibição ("Psicologia ABA"), não a terapia real, então filtros como
-- NOT ILIKE '%Aplicador ABA Escola%' nunca correspondiam.
--
-- Solução: usar NOT EXISTS com agenda_tita JOINado em config_regras_terapias
-- (BLACKLIST_AUTORIZACAO) para verificar a terapia real antes de incluir o
-- registro. Qualquer terapia adicionada à blacklist no futuro será excluída
-- automaticamente tanto da auditoria principal quanto das faltas.

CREATE OR REPLACE FUNCTION public.get_faltas_auditoria_assim(p_data date)
RETURNS TABLE(
  paciente_id     text,
  paciente_nome   text,
  data_atendimento date,
  hora_inicial    time without time zone,
  tuss            text,
  terapia_nome    text,
  tipo_falta      text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    f.paciente_id::text,
    f.paciente_nome,
    f.data_atendimento,
    f.horario               AS hora_inicial,
    f.tuss,
    f.terapia_nome,
    f.tipo_falta
  FROM public.fila_autorizacoes f
  WHERE f.data_atendimento = p_data
    AND (
      f.tipo_falta ILIKE '%paciente%'
      OR f.tipo_falta ILIKE '%terapeuta%'
    )
    AND f.terapia_nome NOT ILIKE '%Equoterapia%'
    AND f.terapia_nome NOT ILIKE '%Fisioterapia Aquática%'
    AND NOT EXISTS (
      SELECT 1
      FROM public.agenda_tita at
      JOIN public.config_regras_terapias r
        ON at.terapia_nome ILIKE ('%' || r.terapia_nome || '%')
      WHERE r.categoria       = 'BLACKLIST_AUTORIZACAO'
        AND r.ativo           = true
        AND at.paciente_id    = f.paciente_id::bigint
        AND at.data_atendimento = f.data_atendimento
        AND at.hora_inicial   = f.horario
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_faltas_auditoria_assim(date) TO anon, authenticated;
