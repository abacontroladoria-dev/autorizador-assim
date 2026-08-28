-- =============================================================================
-- O número da guia não tinha índice, e foi ele que parou o banco
-- =============================================================================
-- Em 24/08 o sistema ficou inacessível por ~10 minutos. Os logs mostram duas
-- execuções de `get_guias_orfas` terminando juntas às 12:25:31, tendo levado
-- 44,0 s e 42,5 s. Com as conexões presas, o PostgREST passou a devolver
-- `PGRST003 Timed out acquiring connection from connection pool` e TUDO virou
-- 504 — inclusive `/usuarios?id=eq.<uuid>`, que é uma linha por chave primária.
-- Queries de catálogo do próprio dashboard levaram 26 s. Não era uma tela lenta:
-- era o banco inteiro sem conexão livre.
--
-- O que segurava cada execução por 44 s é o `not exists` final de
-- `get_guias_orfas` (20260821040000:119-124), que pergunta se a guia foi
-- capturada pelo próprio Pulsar:
--
--     where fa.numero_autorizacao = g.guia
--       and abs(extract(epoch from (fa.horario_autorizacao - g.data_execucao))) <= 300
--
-- `fila_autorizacoes` tem índice por `status`, por `data_atendimento`, pelo
-- quinteto operacional e pelo de match — e nenhum por `numero_autorizacao`. Ou
-- seja: varredura sequencial da fila inteira, UMA VEZ POR GUIA candidata do mês.
--
-- O índice é parcial porque a fila só carimba `numero_autorizacao` quando a
-- autorização volta da ASSIM: a maioria esmagadora das linhas tem NULL ali, e
-- nenhuma delas pode casar com uma guia. Índice menor, mesma seletividade.
--
-- `horario_autorizacao` entra como segunda coluna porque a comparação por guia
-- SEMPRE tem de ser qualificada por tempo — o número da guia recicla
-- (20260805170300:99-107). Com as duas no índice o filtro de janela é resolvido
-- dentro do próprio index scan.
--
-- CONCURRENTLY: a fila é escrita pelo robô o tempo todo, e um `create index`
-- comum a travaria contra escrita durante a construção. O preço é não poder
-- rodar dentro de bloco de transação — aplicar este arquivo SOZINHO.
-- =============================================================================

create index concurrently if not exists idx_fila_autorizacoes_guia_horario
  on public.fila_autorizacoes (numero_autorizacao, horario_autorizacao)
  where numero_autorizacao is not null;

comment on index public.idx_fila_autorizacoes_guia_horario is
  'Serve o not exists de get_guias_orfas (guia já capturada pelo Pulsar). Sem ele a checagem é seq scan da fila por guia candidata — foi o que esgotou o pool de conexões em 24/08/2026. Parcial: linha sem numero_autorizacao nunca casa com guia.';
