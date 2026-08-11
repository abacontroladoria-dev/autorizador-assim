-- ============================================================================
-- Filas da Central: lease de reivindicação e fila morta que não é apagada
--
-- PROBLEMA 1 — item travado em 'processing' nunca volta.
--   claim_message_grouping_batch e claim_send_queue_batch (20260701010400)
--   selecionavam apenas `status = 'pending'`. Um worker que morre no meio do
--   processamento deixa a linha em 'processing' para sempre: nenhum claim
--   futuro a alcança, e cleanup_processed_queues não a toca (só apagava
--   completed/failed/cancelled). O responsável nunca recebe resposta e nada
--   avisa. Com a fila vazia o defeito é invisível; com paciente do outro lado
--   é uma mensagem perdida em silêncio.
--
--   Correção: reivindicação com prazo (lease). O claim passa a alcançar também
--   itens 'processing' cujo `claimed_at` é mais antigo que o prazo, contando
--   `attempts`. Ao estourar `max_attempts` o item vira 'failed' com o motivo
--   escrito — nunca reivindicação infinita, nunca item esquecido.
--
-- PROBLEMA 2 — cleanup_processed_queues apagava 'failed'.
--   Passados 7 dias, o único registro de que uma resposta era devida e não
--   saiu era destruído, junto com o error_message que explicaria o porquê.
--   Correção: só 'completed' e 'cancelled' são apagados. 'failed' permanece
--   até alguém decidir o que fazer com ele.
--
-- Por que `attempts` e não reusar `retry_count`:
--   são dois fenômenos distintos. `retry_count` conta retentativa de negócio
--   (a Meta recusou, tenta de novo mais tarde). `attempts` conta quantas vezes
--   o item foi reivindicado por um worker. Um item com retry_count alto indica
--   provider instável; um item com attempts alto indica WORKER instável —
--   somar os dois num contador esconde o segundo diagnóstico.
-- ============================================================================

alter table central.message_grouping_queue
  add column if not exists claimed_at   timestamptz,
  add column if not exists attempts     integer not null default 0,
  add column if not exists max_attempts integer not null default 5;

alter table central.send_queue
  add column if not exists claimed_at   timestamptz,
  add column if not exists attempts     integer not null default 0,
  add column if not exists max_attempts integer not null default 5;

comment on column central.message_grouping_queue.claimed_at is
  'Instante da última reivindicação. Base do lease: passado o prazo, o item é reivindicável de novo.';
comment on column central.message_grouping_queue.attempts is
  'Quantas vezes um worker reivindicou este item. Alto = worker instável (distinto de retry_count).';
comment on column central.send_queue.claimed_at is
  'Instante da última reivindicação. Base do lease: passado o prazo, o item é reivindicável de novo.';
comment on column central.send_queue.attempts is
  'Quantas vezes um worker reivindicou este item. Alto = worker instável (distinto de retry_count).';

-- Índice que o claim usa: entra pelo status e ordena pelo instante devido.
create index if not exists idx_grouping_claim
  on central.message_grouping_queue (organization_id, status, process_after)
  where status in ('pending', 'processing');

create index if not exists idx_send_claim
  on central.send_queue (organization_id, status, scheduled_at)
  where status in ('pending', 'processing');

-- ----------------------------------------------------------------------------
-- DROP antes de recriar, e não `create or replace`.
--
-- As funções ganham um terceiro parâmetro (p_lease). O `create or replace`
-- casa por nome + tipos dos argumentos, então a versão de 2 argumentos
-- CONTINUARIA existindo como sobrecarga — e toda chamada com 2 argumentos
-- resolveria para ela, isto é, para a versão com o defeito. O drop explícito
-- é o que garante que a versão antiga morre.
-- ----------------------------------------------------------------------------
drop function if exists central.claim_message_grouping_batch(uuid, integer);
drop function if exists central.claim_send_queue_batch(uuid, integer);

-- ----------------------------------------------------------------------------
-- claim_message_grouping_batch
--
-- Duas etapas num só corpo, de propósito: quem reivindica também sepulta. Se o
-- sepultamento morasse numa função separada, dependeria de alguém se lembrar de
-- chamá-la — e o item esgotado voltaria a ser exatamente o que esta migration
-- corrige: linha em 'processing' que ninguém alcança.
-- ----------------------------------------------------------------------------
create function central.claim_message_grouping_batch(
  p_organization_id uuid,
  p_batch_size      integer  default 10,
  p_lease           interval default '2 minutes'
)
returns setof central.message_grouping_queue
language plpgsql
security definer
set search_path = central, public
as $$
begin
  -- 1. Sepulta o que estourou o teto: lease vencido E sem tentativa restante.
  update central.message_grouping_queue
  set
    status        = 'failed',
    error_message = coalesce(error_message || ' | ', '')
                    || format('esgotou max_attempts=%s apos %s reivindicacao(oes); ultima em %s',
                              max_attempts, attempts, claimed_at),
    updated_at    = now()
  where
    organization_id = p_organization_id
    and status      = 'processing'
    and claimed_at  < now() - p_lease
    and attempts   >= max_attempts;

  -- 2. Reivindica: pendente no prazo, ou em processamento com lease vencido.
  return query
  update central.message_grouping_queue q
  set
    status     = 'processing',
    claimed_at = now(),
    attempts   = q.attempts + 1,
    updated_at = now()
  where q.id in (
    select id
    from central.message_grouping_queue
    where
      organization_id   = p_organization_id
      and process_after <= now()
      and attempts       < max_attempts
      and (
        status = 'pending'
        or (status = 'processing' and claimed_at < now() - p_lease)
      )
    order by process_after asc
    limit p_batch_size
    for update skip locked
  )
  returning q.*;
end;
$$;

comment on function central.claim_message_grouping_batch(uuid, integer, interval) is
  'Reivindica itens da fila de agrupamento com lease. Recupera item de worker morto e sepulta o que estourou max_attempts.';

-- ----------------------------------------------------------------------------
-- claim_send_queue_batch — mesma mecânica, ordenada por scheduled_at.
--
-- A simetria é deliberada: o worker de envio e o de agrupamento têm a mesma
-- garantia de recuperação. Não foi fatorado numa função só porque as duas
-- tabelas têm colunas de agendamento diferentes (process_after vs scheduled_at)
-- e unificar exigiria SQL dinâmico — troca ruim para ganhar seis linhas.
-- ----------------------------------------------------------------------------
create function central.claim_send_queue_batch(
  p_organization_id uuid,
  p_batch_size      integer  default 10,
  p_lease           interval default '2 minutes'
)
returns setof central.send_queue
language plpgsql
security definer
set search_path = central, public
as $$
begin
  update central.send_queue
  set
    status        = 'failed',
    error_message = coalesce(error_message || ' | ', '')
                    || format('esgotou max_attempts=%s apos %s reivindicacao(oes); ultima em %s',
                              max_attempts, attempts, claimed_at),
    updated_at    = now()
  where
    organization_id = p_organization_id
    and status      = 'processing'
    and claimed_at  < now() - p_lease
    and attempts   >= max_attempts;

  return query
  update central.send_queue q
  set
    status     = 'processing',
    claimed_at = now(),
    attempts   = q.attempts + 1,
    updated_at = now()
  where q.id in (
    select id
    from central.send_queue
    where
      organization_id  = p_organization_id
      and scheduled_at <= now()
      and attempts      < max_attempts
      and (
        status = 'pending'
        or (status = 'processing' and claimed_at < now() - p_lease)
      )
    order by scheduled_at asc
    limit p_batch_size
    for update skip locked
  )
  returning q.*;
end;
$$;

comment on function central.claim_send_queue_batch(uuid, integer, interval) is
  'Reivindica itens da fila de envio com lease. Recupera item de worker morto e sepulta o que estourou max_attempts.';

-- ----------------------------------------------------------------------------
-- cleanup_processed_queues — 'failed' deixa de ser apagado.
--
-- Apagar item 'completed' é seguro: a mensagem correspondente vive em
-- central.messages, que é o registro real. Apagar item 'failed' destrói a única
-- evidência de que havia uma resposta a dar e ela não saiu.
-- ----------------------------------------------------------------------------
create or replace function central.cleanup_processed_queues(p_older_than_days integer default 7)
returns integer
language plpgsql
security definer
set search_path = central, public
as $$
declare
  v_cutoff   timestamptz;
  v_grouping integer;
  v_send     integer;
begin
  v_cutoff := now() - (p_older_than_days || ' days')::interval;

  -- 'failed' fora da lista de propósito — ver comentário acima.
  delete from central.message_grouping_queue
  where
    status in ('completed', 'cancelled')
    and updated_at < v_cutoff;
  get diagnostics v_grouping = row_count;

  delete from central.send_queue
  where
    status in ('completed', 'cancelled')
    and updated_at < v_cutoff;
  get diagnostics v_send = row_count;

  return v_grouping + v_send;
end;
$$;

comment on function central.cleanup_processed_queues(integer) is
  'Apaga itens completed e cancelled antigos. NUNCA apaga failed: é o registro de resposta devida e não entregue.';

-- ----------------------------------------------------------------------------
-- Fila morta visível.
--
-- Contraparte de pending_queue_overview (20260701010300), que só mostra
-- pending/processing. Sem uma visão do que falhou, "nenhum registro se perde"
-- é intenção e não garantia: o registro existiria no banco e ninguém saberia.
--
-- security_invoker mantém a RLS das tabelas base valendo (select para
-- admin e director) — a view não escalona privilégio.
-- ----------------------------------------------------------------------------
create or replace view central.queue_dead_letter_overview
  with (security_invoker = true)
as
select
  'grouping'::text as queue_type,
  q.id             as item_id,
  q.organization_id,
  q.attempts,
  q.max_attempts,
  q.retry_count,
  q.error_message,
  q.created_at,
  q.updated_at     as failed_at,
  extract(epoch from now() - q.created_at)::integer as age_seconds
from central.message_grouping_queue q
where q.status = 'failed'

union all

select
  'send'::text,
  s.id,
  s.organization_id,
  s.attempts,
  s.max_attempts,
  s.retry_count,
  s.error_message,
  s.created_at,
  s.updated_at,
  extract(epoch from now() - s.created_at)::integer
from central.send_queue s
where s.status = 'failed';

comment on view central.queue_dead_letter_overview is
  'Itens de fila que falharam definitivamente. Nada aqui é apagado automaticamente — exige decisão humana.';

grant select on central.queue_dead_letter_overview to authenticated;
