-- Ativa o modelo de papéis da fila_autorizacoes.
--
-- JÁ APLICADO EM PRODUÇÃO via SQL Editor em 2026-08-17. Este arquivo é o
-- registro no livro-caixa, para que um ambiente novo chegue ao mesmo estado.
-- Idempotente de propósito: pode rodar de novo sem efeito.
--
-- Contexto: docs/warnings-supabase/ANALISE.md §5.
--
-- A tabela tinha a policy "Usuarios autenticados podem acessar" (cmd = ALL,
-- USING auth.role() = 'authenticated'). Policies permissivas somam com OR,
-- então ela dava SELECT/INSERT/UPDATE/DELETE total a qualquer usuário logado e
-- anulava as 7 granulares ao lado — inclusive fila_autorizacoes_recepcao_no_delete
-- (USING false), cuja proteção contra DELETE nunca teve efeito nenhum:
-- false OR (auth.role() = 'authenticated') é verdadeiro.
--
-- Duas irmãs de SELECT faziam o mesmo em menor escala: select_fila (USING true)
-- e "Leitura fila para usuarios autenticados" (USING auth.uid() IS NOT NULL).
--
-- O advisor do Supabase não reporta nenhuma das três: ele só marca policy
-- não-SELECT cujo qual seja literalmente `true`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A policy que faltava: o papel `rp` lê a fila
-- ─────────────────────────────────────────────────────────────────────────────
-- frontend/lib/remuneracao/presencaReal.ts lê fila_autorizacoes DIRETO na
-- tabela, com o client do navegador (papel `authenticated`), para montar o
-- índice de presença de /relacionamento-prestador/rp. Nenhuma granular citava
-- `rp`.
--
-- Sem esta policy o dano é silencioso, não um erro: RLS filtra linhas em vez de
-- levantar exceção, então a consulta volta com sucesso e zero linhas, o índice
-- fica vazio, e o fallback "presente" do presencaReal faz TODA FALTA VIRAR
-- PRESENÇA — a folha paga sessão que não aconteceu, sem sintoma na tela.
--
-- Por isso ela é criada ANTES dos drops abaixo.
drop policy if exists fila_autorizacoes_rp_select on public.fila_autorizacoes;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Derrubar as amplas
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Usuarios autenticados podem acessar"     on public.fila_autorizacoes;
drop policy if exists "select_fila"                             on public.fila_autorizacoes;
drop policy if exists "Leitura fila para usuarios autenticados" on public.fila_autorizacoes;

-- ─────────────────────────────────────────────────────────────────────────────
-- Desenho resultante
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT  recepcao, terapeutico, autorizacao, diretoria, rp, admin
--   INSERT  recepcao, admin        (decidido em 2026-08-17: `autorizacao` não
--                                   insere na fila; ele só altera pela tela
--                                   /autorizacoes, via *_autorizacao_update)
--   UPDATE  recepcao, autorizacao, diretoria, admin
--   DELETE  admin apenas
--
-- Escritores que passam por cima da RLS e não são afetados: as funções robo_*
-- (SECURITY DEFINER) e a rota /api/automation/release-stuck (service_role).
