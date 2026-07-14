-- Valida a forma de cada entrada de remuneracao_config.feriados:
-- {"nome": text, "tipo": "integral"|"parcial", "parcial_a_partir"?: "HH:MM"}
-- Evita que uma entrada malformada passe silenciosamente e só apareça como
-- pagamento errado quando a classificação (Passo 5/6) for implementada.
CREATE OR REPLACE FUNCTION public.validar_feriados(feriados jsonb)
RETURNS boolean AS $$
DECLARE
  entry jsonb;
BEGIN
  FOR entry IN SELECT value FROM jsonb_each(feriados) LOOP
    IF NOT (entry ? 'nome') OR NOT (entry ? 'tipo') THEN
      RETURN false;
    END IF;
    IF entry->>'tipo' NOT IN ('integral', 'parcial') THEN
      RETURN false;
    END IF;
    IF entry->>'tipo' = 'parcial' AND NOT (entry ? 'parcial_a_partir') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE remuneracao_config
  ADD CONSTRAINT remuneracao_config_feriados_check CHECK (public.validar_feriados(feriados));
