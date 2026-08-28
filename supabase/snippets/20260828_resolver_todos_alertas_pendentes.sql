-- ============================================================
-- Resolver em lote todos os alertas pendentes (sino de notificações)
--
-- CONTEXTO
-- A aba "Pendências ASSIM" foi removida (commit 1dcc1ea) — era a única
-- tela que dava baixa nos alertas um a um via fn_alerta_status. O sino
-- continua contando aberto+em_andamento (useAlertas/get_alertas_contadores),
-- então sem essa tela os alertas represados ficam acumulando sem forma
-- de encerrar. Este snippet zera o represado atual à mão.
--
-- O QUE FAZ
-- Replica exatamente o que fn_alerta_status(id, 'resolvido') faz por
-- alerta (ver supabase/migrations/20260730100100_alertas_rpcs.sql),
-- só que em lote: UPDATE dos campos de resolução + INSERT do evento de
-- histórico correspondente. NÃO reescreve a função, NÃO cria migration —
-- é operação de dados (DML), não de schema.
--
-- IMPORTANTE
-- resolvido_por usa auth.uid() de quem roda no SQL Editor autenticado.
-- Se rodar como owner do projeto (sem sessão de usuário), auth.uid()
-- vem NULL — troque a linha marcada abaixo por um UUID de public.usuarios
-- se quiser um responsável nomeado no histórico.
-- ============================================================

begin;

with alvo as (
  select id, entidade_tipo, entidade_id, status as status_anterior
  from public.alertas
  where status <> 'resolvido'
),
atualizados as (
  update public.alertas a
  set
    status        = 'resolvido',
    resolvido_em  = now(),
    resolvido_por = auth.uid(),  -- troque por um UUID fixo se rodar sem sessão
    resolucao     = 'manual',
    atualizado_em = now()
  from alvo
  where a.id = alvo.id
  returning a.id, alvo.entidade_tipo, alvo.entidade_id, alvo.status_anterior
)
insert into public.alertas_eventos (
  alerta_id, entidade_tipo, entidade_id, tipo, autor_tipo, autor_id, autor_nome,
  descricao, metadata
)
select
  atualizados.id, atualizados.entidade_tipo, atualizados.entidade_id,
  'status', 'usuario', auth.uid(),
  (select nome from public.usuarios where id = auth.uid()),
  concat(
    coalesce((select nome from public.usuarios where id = auth.uid()), 'Usuário'),
    ' alterou o status para resolvido.'
  ),
  jsonb_build_object('status_anterior', atualizados.status_anterior, 'status_novo', 'resolvido')
from atualizados;

-- Confira a contagem antes do commit. Se vier 0, provavelmente já não
-- havia pendência — não precisa de rollback, só não vai gravar nada.
select count(*) as alertas_resolvidos from public.alertas
where resolucao = 'manual' and (resolvido_em at time zone 'America/Sao_Paulo')::date
  = (now() at time zone 'America/Sao_Paulo')::date;

commit;
