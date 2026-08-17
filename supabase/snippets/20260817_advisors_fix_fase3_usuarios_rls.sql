-- FASE 3 — reabilitar RLS em public.usuarios (2026-08-17)
--
-- Este é o ERROR grave de verdade dos Advisors. Está aberto desde 2026-06-10
-- (migration 20260610000015_fix_usuarios_rls.sql) e é o C2 da auditoria de
-- 2026-07-06, que mandou corrigir "hoje" e não foi corrigido.
--
-- Hoje: RLS desabilitado + `grant select on usuarios to anon` + anon key pública
-- no bundle => qualquer pessoa na internet lista nome, email, username e role de
-- todos os usuários. Confirme o alcance com o BLOCO 3 do diagnóstico (se
-- anon_update/anon_insert também vierem true, é promoção de privilégio, não só
-- leitura).
--
--   ┌──────────────────────────────────────────────────────────────────────┐
--   │ NÃO RODE O BLOCO 2 ANTES DE DEPLOYAR A MUDANÇA DO LOGIN (BLOCO 1).   │
--   │ Ligar a RLS sem isso derruba o login por username de TODO MUNDO.     │
--   └──────────────────────────────────────────────────────────────────────┘
--
-- POR QUE: frontend/app/login/page.tsx:23-36 faz, ANTES de autenticar (ou seja,
-- como `anon`), um `from("usuarios").select("email").eq("username", login)` pra
-- traduzir username em email. Com RLS ligada não existe policy pra anon, então
-- a query volta 0 linhas e o usuário recebe "Usuário não encontrado" mesmo com
-- a senha certa. Foi essa dependência que o `DISABLE ROW LEVEL SECURITY` de
-- junho escondeu.
--
-- O que NÃO serve como saída: criar policy de SELECT pra anon em usuarios.
-- Isso reabre exatamente o vazamento que estamos fechando.
--
-- Recursão: verificada e descartada. `is_admin()` e `is_diretoria()` são ambas
-- SECURITY DEFINER, então o subselect delas em usuarios não reentra na RLS.
-- Pelo mesmo motivo as policies das outras tabelas (chamada_paciente,
-- controle_terapeutico, etc.) que consultam usuarios continuam funcionando.


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — pré-requisito: tradução username -> email sem expor a tabela
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ESTADO EM 2026-08-17: função APLICADA em produção. A mudança em
-- frontend/app/login/page.tsx também já está feita (usa .rpc no lugar do
-- .from("usuarios")), typecheck limpo, mas AINDA NÃO DEPLOYADA.
-- O BLOCO 2 continua bloqueado até o deploy no Coolify.
--
-- Tradeoff aceito: a função é um oráculo de enumeração — o anon consegue testar
-- se um username existe e obter o email dele. É muito menos do que ler a tabela
-- inteira (que é o estado de hoje), e é inerente a permitir login por username
-- num client público. Se algum dia incomodar, o caminho é mover o login todo
-- pra uma route handler com rate limit (lib/rate-limit.ts já existe) e tirar o
-- execute do anon.
-- SECURITY DEFINER, recebe só o username, devolve só o email. O anon nunca
-- enxerga a tabela: enxerga uma função que responde uma pergunta específica.

create or replace function public.email_por_username(p_username text)
returns text
language sql
security definer
set search_path to 'public'
stable
as $$
  select email
    from public.usuarios
   where username = p_username
     and ativo = true
   limit 1;
$$;

revoke all on function public.email_por_username(text) from public;
grant execute on function public.email_por_username(text) to anon, authenticated;

comment on function public.email_por_username(text) is
  'Traduz username em email para o passo pré-autenticação do login. SECURITY '
  'DEFINER de propósito: substitui o SELECT direto do anon em public.usuarios, '
  'que exigia RLS desabilitada na tabela inteira. Devolve só o email e só de '
  'usuário ativo.';

-- Depois de criar a função, aplique a mudança em frontend/app/login/page.tsx
-- (trocar o .from("usuarios") pelo .rpc) e faça o deploy. Só então o BLOCO 2.


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — só depois do deploy do login: ligar a RLS
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Falta uma policy de auto-UPDATE: a 20260610000015 dropou
-- "usuarios_update_own_profile" junto. Sem ela, o ModalPerfil
-- (frontend/components/perfil/ModalPerfil.tsx:66, update do nome) passa a
-- falhar calado pra quem não é admin nem diretoria.
drop policy if exists "usuarios_update_own_profile" on public.usuarios;
create policy "usuarios_update_own_profile"
  on public.usuarios for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- RLS não restringe coluna: a policy acima deixa o usuário escrever qualquer
-- coluna da própria linha, inclusive `role`. É o C3 da auditoria (self-UPDATE
-- de role). Fechado por grant de coluna: authenticated só pode escrever nome e
-- username; role/ativo/email seguem só via service_role ou admin.
revoke update on public.usuarios from authenticated;
grant  update (nome, username) on public.usuarios to authenticated;

-- Verificado: isto NÃO quebra a administração de usuários. Todas as rotas que
-- escrevem role/ativo/primeiro_acesso (/api/admin/user/change-role,
-- /toggle-active, /update, /reset-password, /api/admin/create-user*) usam
-- `supabaseService` (service_role), que passa por cima de RLS e de grant de
-- coluna. O único caminho de escrita pelo client autenticado é o ModalPerfil,
-- que grava só `nome` — e não encadeia .select() depois do update, então não
-- cai na armadilha de 403 por privilégio de coluna.

-- Tira o acesso do anon à tabela. A tradução do login agora é a função do BLOCO 1.
revoke all on public.usuarios from anon;

alter table public.usuarios enable row level security;

commit;

-- Estado esperado das policies depois disto (5 + 1 nova):
--   SELECT  "Usuário pode ver próprio perfil"   using (auth.uid() = id)
--   SELECT  "Admin pode ver todos usuarios"     using (is_admin())
--   SELECT  usuarios_select_diretoria           using (is_diretoria())
--   UPDATE  "Admin pode atualizar usuarios"     using (is_admin())
--   UPDATE  usuarios_update_diretoria           using (is_diretoria())
--   UPDATE  usuarios_update_own_profile         using (auth.uid() = id)   <- nova


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — validação pós-deploy (rode logado como usuário NÃO-admin)
-- ─────────────────────────────────────────────────────────────────────────────
-- O seu login de admin passa por is_admin() e não testa nada. Precisa ser um
-- usuário comum. Checklist:
--   [ ] login por username funciona
--   [ ] login por email funciona
--   [ ] Sidebar mostra o nome (Sidebar.tsx:269)
--   [ ] ModalPerfil abre e salva o nome (ModalPerfil.tsx:42 e :66)
--   [ ] /sem-permissao mostra nome e role (sem-permissao/page.tsx:23)
--   [ ] /disponibilidade-terapeuta ainda autoriza (page.tsx:110)
--   [ ] "Solicitado por" na central continua preenchido — é trigger definer via
--        maquinas, deve ser indiferente, mas confirme
--
-- E a prova de que fechou (deve dar erro de permissão, não linhas):
--   begin; set local role anon; select count(*) from public.usuarios; rollback;


-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA SOBRE O GUARD — scripts/check-rls.js não pegaria isso
-- ─────────────────────────────────────────────────────────────────────────────
-- O script só verifica se a tabela recebeu `enable row level security` em
-- ALGUMA migration. usuarios recebeu (20260518131652:625) e depois perdeu
-- (20260610000015:7). O script não rastreia DISABLE, então passou verde os dois
-- meses inteiros em que a tabela estava aberta. Vale ensinar ele a subtrair um
-- DISABLE posterior — senão o próximo `DISABLE` volta a passar batido.
