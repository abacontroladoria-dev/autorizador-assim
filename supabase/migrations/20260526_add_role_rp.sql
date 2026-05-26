-- Migration: adiciona role 'rp' (Remuneração e Pagamentos)
-- Abordagem dinâmica: inclui todos os roles existentes + 'rp', evitando
-- falha de constraint quando há valores desconhecidos na tabela.

DO $$
DECLARE
  allowed     text[] := ARRAY['admin','diretoria','recepcao','autorizacao','terapeutico','faturamento','rp'];
  extra_role  text;
BEGIN
  -- Descobre roles já presentes que não estão na lista esperada
  FOR extra_role IN
    SELECT DISTINCT role FROM public.usuarios WHERE role IS NOT NULL
  LOOP
    IF NOT (extra_role = ANY(allowed)) THEN
      allowed := array_append(allowed, extra_role);
      RAISE NOTICE 'Role existente não mapeado incluído no constraint: %', extra_role;
    END IF;
  END LOOP;

  -- Remove constraint anterior (se houver)
  ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;

  -- Recria com todos os valores conhecidos + 'rp'
  EXECUTE format(
    'ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_role_check CHECK (role IN (%s))',
    (SELECT string_agg(quote_literal(r), ',') FROM unnest(allowed) AS r)
  );

  RAISE NOTICE 'Constraint usuarios_role_check criado com roles: %', array_to_string(allowed, ', ');
END;
$$;
