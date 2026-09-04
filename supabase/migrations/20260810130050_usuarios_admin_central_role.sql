-- Todo administrador do Pulsar tem acesso total de configuração da plataforma.
--
-- Contexto: quem governa a Central de Atendimento é public.usuarios.central_role,
-- não public.usuarios.role. As superfícies de configuração exigem 'admin':
--
--   GET/PATCH /api/central/agent-settings   (exigirAdmin)
--   POST      /api/central/voz/testar
--   GET       /api/central/voz/vozes
--   DELETE    /api/central/appointments/[id]
--
-- e a RLS de central.agent_settings repete a exigência por dentro do banco, via
-- central.ca_current_role(). Enquanto central_role ficava null, um admin do
-- Pulsar entrava em /connect e recebia 401 em tudo: a tela existia e nada nela
-- respondia. Não era falta de permissão no sentido de decisão — era um papel
-- que ninguém havia atribuído.
--
-- Regra aplicada aqui: role = 'admin'  =>  central_role = 'admin'.
--
-- E a volta, que é o que fecha a porta: quem deixa de ser admin no Pulsar não
-- continua administrando a Central. Não há como adivinhar em qual papel da
-- Central a pessoa deveria cair, então o gatilho apenas retira o 'admin'
-- herdado; reclassificar é manual. Falha fechada.
--
-- O que o gatilho deliberadamente NÃO faz: mexer em central_role de quem não é
-- admin do Pulsar. Dar 'director' ou 'operator' a um usuário de outro papel
-- continua sendo decisão humana explícita, e o gatilho respeita.

-- ============================================================================
-- 1. Backfill — os admins que já existem
-- ============================================================================
update public.usuarios
set central_role = 'admin'
where role = 'admin'
  and coalesce(central_role, '') <> 'admin';

-- ============================================================================
-- 2. Sincronia daqui para frente
--
-- BEFORE INSERT OR UPDATE porque as rotas de admin gravam direto na tabela
-- (create-user, create-user-with-password, user/change-role) e o Studio também.
-- Regra no banco vale para todos os caminhos; regra na rota vale só para a rota.
-- ============================================================================
create or replace function public.sync_central_role_admin()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' then
    new.central_role := 'admin';

  elsif tg_op = 'UPDATE' and old.role = 'admin' and new.central_role = 'admin' then
    -- Deixou de ser admin do Pulsar e ainda carrega o 'admin' herdado.
    -- A condição sobre NEW (e não OLD) é o que permite despromover e
    -- reclassificar no mesmo UPDATE: se vier um central_role novo, ele vence.
    new.central_role := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_central_role_admin on public.usuarios;

create trigger trg_sync_central_role_admin
before insert or update on public.usuarios
for each row
execute function public.sync_central_role_admin();

-- ============================================================================
-- Nota sobre o JWT
--
-- public.custom_access_token_hook injeta central_role no access token no
-- momento do login. Quem já estiver com sessão aberta continua com o token
-- antigo até renovar — e não precisa esperar: lib/central/auth.ts e
-- central.ca_current_role() têm fallback para o banco quando a claim falta.
-- ============================================================================
