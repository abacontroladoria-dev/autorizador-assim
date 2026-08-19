-- =============================================================================
-- Aplicar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes)
-- =============================================================================
-- Fecha o que a 20260817200000_insumos_schema.sql deixou vazio: sem nenhuma
-- linha em `empresas`/`usuarios_empresas`, todo usuário autenticado cai em
-- SemEmpresaError ao abrir /insumos ("sem acesso a nenhuma empresa").
--
-- CNPJs informados pelo usuário em 2026-08-18 — matriz + 3 filiais do Universo
-- ABA, cada unidade física com CNPJ próprio. Ligados aos 4 usuários
-- admin/diretoria ativos hoje (únicos com a permissão `insumos`), que já
-- enxergam as 3 unidades físicas no resto do sistema.
--
-- Ver supabase/migrations/20260818110000_seed_empresas_insumos.sql (mesmo
-- conteúdo, versionado).

INSERT INTO public.empresas (razao_social, nome_fantasia, cnpj, ativo)
VALUES
  ('Universo ABA Clínica Terapêutica LTDA', 'Universo ABA - Realengo (Unid. 1)', '21.078.980/0001-15', true),
  ('Universo ABA Clínica Terapêutica LTDA (Unid 2)', 'Universo ABA - Fazendinha', '21.078.980/0002-04', true),
  ('Universo ABA Clínica Terapêutica LTDA', 'Universo ABA - Realengo (Unid. 3)', '21.078.980/0003-87', true),
  ('Universo ABA Clínica Terapêutica LTDA', 'Universo ABA - Padre Miguel', '21.078.980/0004-68', true)
ON CONFLICT (cnpj) DO NOTHING;

INSERT INTO public.usuarios_empresas (usuario_id, empresa_id, empresa_padrao, ativo)
SELECT
  u.id,
  e.id,
  (e.cnpj = '21.078.980/0001-15'), -- matriz como padrão de escrita
  true
FROM public.usuarios u
CROSS JOIN public.empresas e
WHERE u.ativo = true
  AND u.role IN ('admin', 'diretoria', 'faturamento')
  AND e.cnpj IN (
    '21.078.980/0001-15',
    '21.078.980/0002-04',
    '21.078.980/0003-87',
    '21.078.980/0004-68'
  )
ON CONFLICT (usuario_id, empresa_id) DO NOTHING;

-- =============================================================================
-- Registro no livro-caixa
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260818110000', 'seed_empresas_insumos')
ON CONFLICT (version) DO NOTHING;

NOTIFY pgrst, 'reload schema';
