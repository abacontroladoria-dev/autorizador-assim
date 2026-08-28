-- Tabela que materializa o resultado diário da API csv_grade_profissionais do TITA.
-- Populada pela Edge Function sync-grade-csv, agendada às 05h (08h UTC).

CREATE TABLE IF NOT EXISTS csv_grades_profissionais (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tita_agendamento_id   bigint,
  paciente_id           bigint,
  paciente_nome         text,
  data                  date        NOT NULL,
  dia_semana            text,
  hora_inicial          time,
  hora_final            time,
  profissional_id       bigint,
  profissional_nome     text,
  profissional_cpf      text,
  terapia_id            bigint,
  terapia_nome          text,
  terapia_exibicao_id   bigint,
  terapia_exibicao_nome text,
  sala_id               bigint,
  sala_nome             text,
  sala_observacoes      text,
  unidade_id            bigint,
  unidade_nome          text,
  convenio_nome         text,
  status_agendamento    text,
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_grades_data_unidade
  ON csv_grades_profissionais (data, unidade_id);

CREATE INDEX IF NOT EXISTS idx_csv_grades_profissional
  ON csv_grades_profissionais (profissional_id, data);

ALTER TABLE csv_grades_profissionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select for authenticated"
  ON csv_grades_profissionais FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Allow all for service role"
  ON csv_grades_profissionais FOR ALL
  TO service_role USING (true);
