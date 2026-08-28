CREATE TABLE cronograma_estado (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dados         jsonb NOT NULL DEFAULT '{}',
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT cronograma_estado_user_unique UNIQUE (user_id)
);

ALTER TABLE cronograma_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario pode ler proprio estado"
  ON cronograma_estado FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "usuario pode gravar proprio estado"
  ON cronograma_estado FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "usuario pode atualizar proprio estado"
  ON cronograma_estado FOR UPDATE
  USING (auth.uid() = user_id);
