-- Tabela de rate limiting simples para Edge Functions sem autenticação.
-- Motivação: auth-lookup-username aceita chamadas sem token (necessário,
-- é usada antes do login pra traduzir username -> email), o que permite
-- enumeração de username/email por força bruta sem nenhum limite hoje.
--
-- Só o service_role escreve/lê aqui (Edge Functions usam sempre o client de
-- service role) — RLS habilitado sem nenhuma policy = acesso negado por
-- padrão pra anon/authenticated, e o service_role ignora RLS normalmente.
create table if not exists public.edge_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_edge_rate_limits_bucket_created
  on public.edge_rate_limits(bucket, created_at);

alter table public.edge_rate_limits enable row level security;

-- Sem policies: nega tudo pra anon/authenticated. Só service_role acessa.
