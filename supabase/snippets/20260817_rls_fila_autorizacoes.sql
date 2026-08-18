-- Fase 7 (parcial) — ativar o modelo de papéis da fila_autorizacoes
-- 2026-08-17 · contexto: docs/warnings-supabase/ANALISE.md §5
--
-- Hoje "Usuarios autenticados podem acessar" (cmd=ALL, USING auth.role() =
-- 'authenticated') dá SELECT/INSERT/UPDATE/DELETE total a qualquer logado e
-- anula as 7 policies granulares ao lado — inclusive a guarda USING(false)
-- contra DELETE. Este script derruba as amplas e deixa as granulares valerem.
--
-- ⚠️ RLS NÃO GRITA, ELA SOME COM A LINHA.
-- SELECT restrito devolve menos linhas COM SUCESSO. UPDATE/DELETE restritos
-- pelo USING afetam ZERO linhas SEM ERRO. Nada aqui quebra de forma visível:
-- tudo degrada calado. Por isso o bloco 1 vem antes, e por isso os testes do
-- fim são obrigatórios.
--
-- Decidido com o usuário em 2026-08-17: o papel `autorizacao` NÃO insere na
-- fila. INSERT fica com recepcao e admin. (Ele segue podendo dar UPDATE pela
-- tela /autorizacoes — cancelar execução e reenfileirar o robô.)

begin;

-- ============================================================
-- BLOCO 1 — a policy que falta (SEM ELA A FOLHA QUEBRA CALADA)
-- ============================================================
-- frontend/lib/remuneracao/presencaReal.ts:75 lê fila_autorizacoes DIRETO na
-- tabela, com o client do navegador (papel `authenticated`), para montar o
-- índice de presença de /relacionamento-prestador/rp. Nenhuma granular cita
-- `rp` (2 usuários ativos).
--
-- Sem esta policy: a consulta volta com sucesso e ZERO linhas, o índice fica
-- vazio, e o fallback "presente" do presencaReal faz TODA FALTA VIRAR
-- PRESENÇA — a folha paga sessão que não aconteceu, sem sintoma na tela.
create policy fila_autorizacoes_rp_select
  on public.fila_autorizacoes
  for select
  to authenticated
  using (
    exists (
      select 1 from public.usuarios u
      where u.id = auth.uid()
        and u.role = 'rp'
        and u.ativo = true
    )
  );


-- ============================================================
-- BLOCO 2 — derrubar as amplas
-- ============================================================
-- A que anula tudo: ALL + auth.role() = 'authenticated'.
drop policy "Usuarios autenticados podem acessar"     on public.fila_autorizacoes;

-- SELECT irrestrito (uma é `true`, a outra `auth.uid() IS NOT NULL`).
drop policy "select_fila"                             on public.fila_autorizacoes;
drop policy "Leitura fila para usuarios autenticados" on public.fila_autorizacoes;

commit;


-- ============================================================
-- CONFERÊNCIA — o desenho resultante
-- ============================================================
-- Esperado depois do commit:
--   SELECT  → recepcao, terapeutico, autorizacao, diretoria, rp, admin
--   INSERT  → recepcao, admin
--   UPDATE  → recepcao, autorizacao, diretoria, admin
--   DELETE  → admin apenas  (false OR admin) — enfim o efeito que
--             fila_autorizacoes_recepcao_no_delete sempre quis ter
select
  cmd,
  policyname,
  roles,
  coalesce(qual, '-')       as using_clause,
  coalesce(with_check, '-') as with_check_clause
from pg_policies
where schemaname = 'public'
  and tablename  = 'fila_autorizacoes'
order by cmd, policyname;


-- ============================================================
-- TESTES NO APP — obrigatórios, porque nada falha visivelmente
-- ============================================================
-- 1. [rp]           /relacionamento-prestador/rp — conferir que as FALTAS
--                   continuam aparecendo. Total idêntico ao de antes é o
--                   sinal de que a policy do bloco 1 pegou. Se as faltas
--                   sumirem e todo mundo virar "presente", ROLLBACK.
-- 2. [recepcao]     criar uma solicitação — o INSERT tem que passar.
-- 3. [autorizacao]  /autorizacoes → "cancelar execução" e "executar robô".
--                   São UPDATE; têm que continuar valendo.
-- 4. [terapeutico]  as telas que leem a fila continuam listando.
-- 5. [qualquer]     menu do Sidebar → modal de erros → "reprocessar".
--                   Para papel sem UPDATE isso agora vira no-op com
--                   toast.success (botão que mente). Decidir se limita o
--                   botão por papel ou se cria policy — fora deste script.
-- 6. [cronograma / disponibilidade_terapeuta] o badge do Sidebar passa a
--                   mostrar 0. É esperado e provavelmente desejável.
--
-- ROLLBACK (se algo acima falhar):
--   recriar as 3 policies derrubadas com o texto que a conferência do
--   bloco 6 do diagnóstico registrou:
--     "Usuarios autenticados podem acessar"     ALL    USING/WITH CHECK (auth.role() = 'authenticated')
--     "select_fila"                             SELECT USING (true)
--     "Leitura fila para usuarios autenticados" SELECT USING (auth.uid() IS NOT NULL)
