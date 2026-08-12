-- Passos iniciais do sistema próprio de agendamentos/grade (nativo, substituindo
-- gradualmente a dependência do TiTa Therapy). Primeira tabela: cadastro de
-- pacientes. Prefixo "reboot_" identifica visualmente as tabelas desta frente
-- nova, sem exigir aspas duplas (evitado o "REBOOT - Nome" literal).
--
-- PK sequencial (bigint identity, começa em 1) a pedido do usuário — diverge
-- do padrão uuid do restante do projeto, mas a coluna tem nome específico da
-- entidade (id_paciente) em vez de um `id` genérico.

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.atualizado_em = now();
  return new;
end;
$function$;

CREATE TABLE IF NOT EXISTS public.reboot_pacientes (
  id_paciente       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome              text        NOT NULL,
  data_nascimento   date,
  telefone          text,
  ativo             boolean     NOT NULL DEFAULT true,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_reboot_pacientes_atualizado_em ON public.reboot_pacientes;
CREATE TRIGGER trg_reboot_pacientes_atualizado_em
  BEFORE UPDATE ON public.reboot_pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

ALTER TABLE public.reboot_pacientes ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de role-gate usado em cronograma_salas / cronograma_convenio_valores
-- (ver 20260724120000_restringir_rls_cronograma_valores_salas.sql) — evita repetir
-- o gap de RLS aberto já corrigido antes nessas tabelas.
DROP POLICY IF EXISTS "reboot_pacientes_select" ON public.reboot_pacientes;
DROP POLICY IF EXISTS "reboot_pacientes_write" ON public.reboot_pacientes;

CREATE POLICY "reboot_pacientes_select" ON public.reboot_pacientes
  FOR SELECT TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));

CREATE POLICY "reboot_pacientes_write" ON public.reboot_pacientes
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));
