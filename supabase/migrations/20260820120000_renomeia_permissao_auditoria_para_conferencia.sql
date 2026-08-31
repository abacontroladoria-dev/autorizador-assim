-- ─────────────────────────────────────────────────────────────────────────────
-- Renomeia o rótulo da permissão de "Auditoria ASSIM" para "Conferência ASSIM".
--
-- Pedido do usuário (2026-08-20), acompanhando a troca do título do header em
-- components/auditoria-assim/AuditoriaAssimShell.tsx. A tela /admin/permissoes
-- não lê rótulo do frontend: ela mostra `permissoes.nome` direto do banco
-- (services/permissoes.service.ts -> getPermissoes), então sem este UPDATE a
-- lista de permissões continuaria dizendo "Auditoria ASSIM" enquanto a própria
-- página já se chama "Conferência ASSIM".
--
-- `descricao` entra junto por coerência do registro: hoje ela não é renderizada
-- pelo PermissoesPageShell, mas fica no banco e seria a última linha ainda
-- falando "Auditoria".
--
-- O QUE NÃO MUDA, de propósito:
--   codigo = 'auditoria_assim'  -> é a chave usada por lib/permissions/routes.ts,
--                                  pelos overrides por usuário e pelos modelos de
--                                  grupo. Renomear quebraria permissão de todo
--                                  mundo que já tem acesso.
--   rota   = '/auditoria-assim' -> a URL segue a mesma; nada de link salvo quebra.
--
-- Idempotente: o WHERE casa por `codigo`, que é a chave estável.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.permissoes
   SET nome      = 'Conferência ASSIM',
       descricao = 'Conferência de guias ASSIM'
 WHERE codigo = 'auditoria_assim';
