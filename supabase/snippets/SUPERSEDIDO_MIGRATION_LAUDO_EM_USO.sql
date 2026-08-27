-- Adiciona a coluna em_uso para permitir marcar qual laudo está valendo
ALTER TABLE paciente_laudos 
ADD COLUMN IF NOT EXISTS em_uso boolean DEFAULT false;

-- Atualiza a view plana para incluir a nova coluna e recalcular situação corretamente
CREATE OR REPLACE VIEW vw_paciente_laudos_flat AS
SELECT
  pl.id               AS id_laudo,
  pl.paciente_id      AS id_paciente,
  p.nome              AS nome_paciente,
  pl.data_laudo,
  COALESCE(pl.validade, (pl.data_laudo + interval '6 months')::date) AS validade,
  CASE
    WHEN COALESCE(pl.validade, (pl.data_laudo + interval '6 months')::date) >= CURRENT_DATE
      THEN 'Vigente'
    ELSE 'Vencido'
  END AS situacao,
  pl.autorizado_em,
  pl.comp_agressivo,
  pl.paciente_verbal,
  pl.ambiente_natural,
  pl.nivel_suporte,
  ple.especialidade,
  ple.qt_laudo,
  ple.qt_autorizacao,
  pl.alta,
  pl.data_alta,
  pl.em_uso
FROM paciente_laudos pl
JOIN pacientes p
  ON p.id_paciente = pl.paciente_id
LEFT JOIN paciente_laudo_especialidades ple
  ON ple.laudo_id = pl.id;

-- Comentário
COMMENT ON COLUMN paciente_laudos.em_uso IS 'Define se este é o laudo principal/ativo atualmente utilizado para o paciente. Quando um laudo é marcado como em_uso, os demais devem ser desmarcados.';
