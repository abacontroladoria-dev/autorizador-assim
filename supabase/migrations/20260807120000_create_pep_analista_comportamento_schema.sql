-- Fundação de dados da PEP (Parcela por Entregas por Paciente) — Analista do
-- Comportamento, conforme PRD "Sistema de Faturamento de Prestadores (PA/PEP) v2.7".
--
-- Escopo desta migration (Fase 1 do projeto "reestruturacao-entregas-analista-
-- comportamento"): só a fundação — catálogo de itens, planejamento semestral
-- e registro de entregas + storage de evidências + permissão de rota. NENHUM
-- motor de cálculo ainda (isso é a Fase 3). A tabela de histórico de ajustes
-- fica para a Fase 3, quando o motor de cálculo definir seu formato exato.
--
-- PA não é afetado por esta migration.

-- ===== pep_catalogo_itens =====
-- Catálogo fixo dos 7 itens da PEP (Seção 7 do PRD). Semeado abaixo.
CREATE TABLE IF NOT EXISTS pep_catalogo_itens (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo              text        NOT NULL,
  sigla               text        NOT NULL,
  nome                text        NOT NULL,
  classe              text        NOT NULL CHECK (classe IN ('recorrente', 'semestral')),
  tipo_registro       text        NOT NULL CHECK (tipo_registro IN ('GERAL', 'POR_PACIENTE')),
  periodicidade       text        NOT NULL CHECK (periodicidade IN ('semanal', 'quinzenal', 'mensal', 'semestral')),
  qtd_referencia_mes  numeric,
  peso_mensal         numeric     NOT NULL,
  ativo               boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_catalogo_itens_codigo
  ON pep_catalogo_itens (codigo);

INSERT INTO pep_catalogo_itens (codigo, sigla, nome, classe, tipo_registro, periodicidade, qtd_referencia_mes, peso_mensal) VALUES
  ('SUPERVISAO_TECNICA',        'STC', 'Supervisão Técnica ABA do Caso',        'recorrente', 'GERAL',         'semanal',    4,    0.30),
  ('ESTUDO_TECNICO',            'ETC', 'Estudo Técnico de Caso',                'recorrente', 'GERAL',         'semanal',    4,    0.30),
  ('TREINAMENTO_APLICADORES',   'TAP', 'Treinamento de Aplicadores ABA',        'recorrente', 'POR_PACIENTE',  'quinzenal',  2,    0.25),
  ('TREINAMENTO_PARENTAL',      'TOP', 'Treinamento e Orientação Parental',     'recorrente', 'POR_PACIENTE',  'mensal',     1,    0.15),
  ('ORIENTACAO_ESCOLAR',        'OE',  'Orientação Escolar',                    'semestral',  'POR_PACIENTE',  'semestral',  NULL, 0.10),
  ('RELATORIO_TECNICO',         'RT',  'Relatório Técnico',                     'semestral',  'POR_PACIENTE',  'semestral',  NULL, 0.20),
  ('PIC',                       'PIC', 'Plano Individualizado Comportamental',  'semestral',  'POR_PACIENTE',  'semestral',  NULL, 0.20)
ON CONFLICT (codigo) DO NOTHING;

-- ===== pep_planejamento_semestral =====
-- Planejamento das Entregas Semestrais (marco zero, Seção 15 do PRD).
-- Cadastro manual por paciente/item; reprogramações (por entrega antecipada
-- ou por impedimento terapêutico) geram uma nova linha encadeada por
-- planejamento_anterior_id, mantendo o histórico (Seção 9.7).
CREATE TABLE IF NOT EXISTS pep_planejamento_semestral (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_nome          text        NOT NULL,
  paciente_cpf           text,
  prestador_nome         text        NOT NULL,
  item_id                uuid        NOT NULL REFERENCES pep_catalogo_itens(id),
  competencia_planejada  text        NOT NULL, -- formato 'YYYY-MM'
  origem                 text        NOT NULL DEFAULT 'inicial'
                            CHECK (origem IN ('inicial', 'reprogramacao_antecipada', 'reprogramacao_impedimento', 'manual')),
  planejamento_anterior_id uuid      REFERENCES pep_planejamento_semestral(id),
  ativo                  boolean     NOT NULL DEFAULT true,
  criado_por             uuid        REFERENCES public.usuarios(id),
  criado_em              timestamptz NOT NULL DEFAULT now()
);

-- Só um planejamento ativo por paciente/item de cada vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_planejamento_ativo_unico
  ON pep_planejamento_semestral (paciente_nome, item_id)
  WHERE ativo;

CREATE INDEX IF NOT EXISTS idx_pep_planejamento_prestador
  ON pep_planejamento_semestral (prestador_nome);

-- ===== pep_registros_entrega =====
-- Registro mensal de cada item entregue (ou pendente), por paciente e
-- competência. paciente_nome fica NULL para itens GERAL (sem paciente,
-- Seção 3 — "Geral (sem paciente)"). Sem campo de data/hora de atividade
-- (Seção 2.2) — só a competência e o timestamp do ato administrativo.
CREATE TABLE IF NOT EXISTS pep_registros_entrega (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_nome     text,
  paciente_cpf      text,
  prestador_nome    text        NOT NULL,
  item_id           uuid        NOT NULL REFERENCES pep_catalogo_itens(id),
  competencia       text        NOT NULL, -- formato 'YYYY-MM'
  status            text        NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'entregue')),
  anexo_path        text,
  anexo_nome        text,
  observacao        text,
  entregue_em       timestamptz,
  registrado_por    uuid        REFERENCES public.usuarios(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_registro_por_paciente_unico
  ON pep_registros_entrega (paciente_nome, item_id, competencia)
  WHERE paciente_nome IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pep_registro_geral_unico
  ON pep_registros_entrega (prestador_nome, item_id, competencia)
  WHERE paciente_nome IS NULL;

CREATE INDEX IF NOT EXISTS idx_pep_registros_prestador_competencia
  ON pep_registros_entrega (prestador_nome, competencia);

-- ===== RLS =====
-- Mesmo padrão de remuneracao_config/contratos: acesso restrito a rp/admin/
-- diretoria (o prestador não acessa o Pulsar — PRD Seção 1).
ALTER TABLE pep_catalogo_itens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_planejamento_semestral  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pep_registros_entrega       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pep_catalogo_itens_select"
  ON pep_catalogo_itens FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "pep_catalogo_itens_write"
  ON pep_catalogo_itens FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

CREATE POLICY "pep_planejamento_semestral_select"
  ON pep_planejamento_semestral FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "pep_planejamento_semestral_write"
  ON pep_planejamento_semestral FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

CREATE POLICY "pep_registros_entrega_select"
  ON pep_registros_entrega FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "pep_registros_entrega_write"
  ON pep_registros_entrega FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- ===== Storage: bucket de evidências da PEP =====
-- Primeiro bucket do projeto. Privado; acesso só via policy abaixo (mesmos
-- roles de escrita/leitura das tabelas acima). LGPD (Seção 2.7 do PRD).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pep-evidencias',
  'pep-evidencias',
  false,
  20971520, -- 20MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pep_evidencias_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pep-evidencias'
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true
      AND u.role IN ('rp', 'admin', 'diretoria')
    )
  );

CREATE POLICY "pep_evidencias_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'pep-evidencias'
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'pep-evidencias'
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.ativo = true AND u.role IN ('rp', 'admin')
    )
  );

-- ===== Permissão de rota (nova aba "Entregas PEP") =====
INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('relacionamento_prestador_pep', 'Entregas PEP', '/relacionamento-prestador/pep', 'Relacionamento Prestador', 'Planejamento e registro de entregas da PEP (Analista do Comportamento)')
ON CONFLICT (codigo) DO NOTHING;
