-- Semeia as empresas (pessoa jurídica) do módulo de insumos e vincula quem já
-- tem a permissão do módulo (admin/diretoria — ver 20260818100000).
--
-- Por que precisa: 20260817200000 criou as tabelas mas não inseriu nada. Sem
-- nenhuma linha em `usuarios_empresas`, `extrairAtor()` (lib/insumos/auth.ts)
-- lança SemEmpresaError para QUALQUER usuário autenticado — é o aviso "sem
-- acesso a nenhuma empresa" relatado em /insumos.
--
-- CNPJs informados pelo usuário em 2026-08-18 (não são inventados): as 4
-- unidades físicas do Universo ABA têm CNPJ próprio (matriz + 3 filiais), então
-- viram 4 linhas em `empresas` — coerente com a decisão original de
-- 20260817200000 de que "empresa" aqui é pessoa jurídica, não texto livre.
--
-- Quem vincula: hoje só `admin` e `diretoria` têm a permissão `insumos`
-- (20260818100000_permissao_insumos.sql; `faturamento` não tem usuário ativo
-- ainda). Os 4 usuários admin/diretoria já enxergam as 3 unidades físicas no
-- resto do sistema (`usuarios.unidades`), então recebem vínculo com as 4
-- empresas — a Unidade 1 (matriz, 0001-15) como padrão de escrita.

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

NOTIFY pgrst, 'reload schema';
