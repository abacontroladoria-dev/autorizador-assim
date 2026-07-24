-- Estende a auditoria já existente (20260610000010_add_audit_logging.sql,
-- tabela public.audit_logs) para cobrir usuarios_permissoes — hoje só
-- role/ativo em `usuarios` é auditado, mas conceder/revogar uma permissão
-- específica (ex: 'permissoes', que dá acesso à própria tela de gestão de
-- acessos) fica sem rastro de quem fez e quando.
--
-- Motivação: com diretoria podendo gerenciar usuarios_permissoes
-- (20260713140000_diretoria_gerencia_permissoes.sql) e podendo, em teoria,
-- se autopromover a admin via troca de role (já auditado) ou via concessão
-- direta do código 'permissoes' a outra conta (ainda não auditado antes
-- desta migration), faltava esse rastro específico.

CREATE OR REPLACE FUNCTION public.log_usuario_permissao_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      user_id, user_email, action, table_name, record_id, new_values, status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'PERMISSAO_CONCEDIDA',
      'usuarios_permissoes',
      NEW.id,
      jsonb_build_object(
        'usuario_id', NEW.usuario_id,
        'permissao_codigo', NEW.permissao_codigo,
        'permitido', NEW.permitido
      ),
      'success'
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.permitido IS DISTINCT FROM NEW.permitido THEN
    INSERT INTO public.audit_logs (
      user_id, user_email, action, table_name, record_id, old_values, new_values, status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'PERMISSAO_ALTERADA',
      'usuarios_permissoes',
      NEW.id,
      jsonb_build_object('permitido', OLD.permitido),
      jsonb_build_object(
        'usuario_id', NEW.usuario_id,
        'permissao_codigo', NEW.permissao_codigo,
        'permitido', NEW.permitido
      ),
      'success'
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      user_id, user_email, action, table_name, record_id, old_values, status
    ) VALUES (
      auth.uid(),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      'PERMISSAO_REMOVIDA',
      'usuarios_permissoes',
      OLD.id,
      jsonb_build_object(
        'usuario_id', OLD.usuario_id,
        'permissao_codigo', OLD.permissao_codigo,
        'permitido', OLD.permitido
      ),
      'success'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_usuario_permissao_changes ON public.usuarios_permissoes;
CREATE TRIGGER trigger_log_usuario_permissao_changes
AFTER INSERT OR UPDATE OR DELETE ON public.usuarios_permissoes
FOR EACH ROW
EXECUTE FUNCTION public.log_usuario_permissao_changes();
