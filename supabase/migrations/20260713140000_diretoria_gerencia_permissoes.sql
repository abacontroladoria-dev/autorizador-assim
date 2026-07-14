-- Libera a tela /admin/permissoes para o role 'diretoria' com poder de GESTÃO
-- (igual admin), restrito ao gerenciamento de acessos — NÃO libera a tela de
-- Usuários (/admin) em si.
--
-- ATENÇÃO (escalada de privilégio, aprovada pelo solicitante): quem pode
-- escrever em usuarios_permissoes / atualizar usuarios.role pode conceder
-- QUALQUER acesso a QUALQUER pessoa (inclusive tornar alguém admin ou a si
-- mesmo). Na prática, a diretoria passa a ser administradora do controle de
-- acessos.
--
-- Usa uma função SECURITY DEFINER (igual is_admin) para evitar recursão de RLS
-- ao consultar a própria tabela usuarios dentro das policies.

CREATE OR REPLACE FUNCTION public.is_diretoria()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid()
      AND role = 'diretoria'
      AND ativo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── usuarios: listar todos (getAdminUsers) e trocar role (changeUserRole) ────
DROP POLICY IF EXISTS "usuarios_select_diretoria" ON public.usuarios;
CREATE POLICY "usuarios_select_diretoria"
  ON public.usuarios FOR SELECT TO authenticated
  USING (public.is_diretoria());

DROP POLICY IF EXISTS "usuarios_update_diretoria" ON public.usuarios;
CREATE POLICY "usuarios_update_diretoria"
  ON public.usuarios FOR UPDATE TO authenticated
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

-- ── usuarios_permissoes: ver todas as linhas e gravar overrides ─────────────
DROP POLICY IF EXISTS "usuarios_permissoes_select_diretoria" ON public.usuarios_permissoes;
CREATE POLICY "usuarios_permissoes_select_diretoria"
  ON public.usuarios_permissoes FOR SELECT TO authenticated
  USING (public.is_diretoria());

DROP POLICY IF EXISTS "usuarios_permissoes_write_diretoria" ON public.usuarios_permissoes;
CREATE POLICY "usuarios_permissoes_write_diretoria"
  ON public.usuarios_permissoes FOR ALL TO authenticated
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());
