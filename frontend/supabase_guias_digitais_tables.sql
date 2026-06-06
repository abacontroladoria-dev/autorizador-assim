-- Tabelas para o módulo Guias Digitais

CREATE TABLE IF NOT EXISTS terapeutas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  carimbo_digital text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guias_processadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_numero text,
  status text NOT NULL DEFAULT 'pendente',
  page_count int NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guia_terapias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guia_numero text NOT NULL,
  terapeuta_id uuid,
  terapia_nome text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  FOREIGN KEY (terapeuta_id) REFERENCES terapeutas(id)
);
