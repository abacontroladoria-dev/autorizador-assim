-- =============================================================================
-- Realtime para autorizacoes_vinculos
-- =============================================================================
-- A aba Reconciliação se inscreve em `autorizacoes_vinculos` para que, quando
-- alguém vincula uma guia, a fila de trabalho de quem está com a tela aberta
-- deixe de mostrar aquela guia. Sem isto duas pessoas abrem a mesma guia órfã e
-- a segunda só descobre o conflito no erro da RPC ("já foi triada").
--
-- Tabela nova NÃO entra na publication sozinha: a inscrição do cliente é aceita
-- e simplesmente nunca entrega evento — falha silenciosa, do tipo que este
-- projeto já pagou caro (a TV de chamada passou meses assim).
--
-- Só esta tabela. `autorizacoes_assim` já está publicada (a Conferência se
-- inscreve nela desde useAuditoriaAssim.ts) e o volume de escrita aqui é
-- baixíssimo — ~18 vínculos por mês —, então o custo de replicação é irrelevante
-- diante do aviso de Disk IO Budget, onde o realtime já pesa ~26%.
--
-- Bloco condicional para a migration ser reaplicável sem erro.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'autorizacoes_vinculos'
  ) then
    alter publication supabase_realtime add table public.autorizacoes_vinculos;
  end if;
end $$;
