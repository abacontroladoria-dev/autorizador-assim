-- Relatório de laudos exportado do Órbita.
-- Mantém a linha crua em jsonb para absorver mudanças no Excel sem quebrar a carga.

create table if not exists public.orbita_laudos_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  arquivo_sha256 text not null unique,
  sheet_name text,
  headers jsonb not null default '[]'::jsonb,
  total_linhas int not null default 0,
  status text not null default 'processando' check (status in ('processando', 'concluido', 'erro')),
  erro text,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create table if not exists public.orbita_laudos_relatorio (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.orbita_laudos_importacoes(id) on delete cascade,
  linha_numero int not null,
  dados jsonb not null,
  paciente text generated always as (nullif(dados->>'Paciente', '')) stored,
  especialidade text generated always as (nullif(dados->>'Especialidade', '')) stored,
  qtd_autorizada text generated always as (
    nullif(coalesce(dados->>'Qtd autorizada', dados->>'Qtd Autorizada'), '')
  ) stored,
  situacao text generated always as (nullif(coalesce(dados->>'Situação', dados->>'Situacao'), '')) stored,
  plano text generated always as (nullif(dados->>'Plano', '')) stored,
  criado_em timestamptz not null default now(),
  unique (importacao_id, linha_numero)
);

alter table public.orbita_laudos_importacoes enable row level security;
alter table public.orbita_laudos_relatorio enable row level security;

create index if not exists idx_orbita_laudos_relatorio_importacao
  on public.orbita_laudos_relatorio (importacao_id, linha_numero);

create index if not exists idx_orbita_laudos_relatorio_paciente
  on public.orbita_laudos_relatorio (paciente)
  where paciente is not null;

create index if not exists idx_orbita_laudos_relatorio_especialidade
  on public.orbita_laudos_relatorio (especialidade)
  where especialidade is not null;

create or replace function public.orbita_importar_laudos(
  p_token text,
  p_arquivo_nome text,
  p_arquivo_sha256 text,
  p_sheet_name text,
  p_headers jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_machine_id text := public.robo_autenticar(p_token);
  v_importacao_id uuid;
  v_total int := coalesce(jsonb_array_length(p_rows), 0);
begin
  if p_arquivo_sha256 is null or length(p_arquivo_sha256) <> 64 then
    raise exception 'arquivo_sha256 invalido' using errcode = '22023';
  end if;

  select id into v_importacao_id
    from public.orbita_laudos_importacoes
   where arquivo_sha256 = p_arquivo_sha256;

  if v_importacao_id is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicado', true,
      'importacao_id', v_importacao_id,
      'total_linhas', (
        select count(*) from public.orbita_laudos_relatorio where importacao_id = v_importacao_id
      )
    );
  end if;

  insert into public.orbita_laudos_importacoes (
    arquivo_nome, arquivo_sha256, sheet_name, headers, total_linhas
  ) values (
    left(coalesce(p_arquivo_nome, 'relatorio_laudos.xlsx'), 255),
    p_arquivo_sha256,
    nullif(p_sheet_name, ''),
    coalesce(p_headers, '[]'::jsonb),
    v_total
  )
  returning id into v_importacao_id;

  insert into public.orbita_laudos_relatorio (importacao_id, linha_numero, dados)
  select v_importacao_id, ordinality::int, value
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality;

  update public.orbita_laudos_importacoes
     set status = 'concluido',
         concluido_em = now()
   where id = v_importacao_id;

  return jsonb_build_object(
    'ok', true,
    'duplicado', false,
    'importacao_id', v_importacao_id,
    'total_linhas', v_total
  );
exception
  when others then
    if v_importacao_id is not null then
      update public.orbita_laudos_importacoes
         set status = 'erro',
             erro = left(sqlerrm, 1000),
             concluido_em = now()
       where id = v_importacao_id;
    end if;
    raise;
end;
$$;

revoke execute on function public.orbita_importar_laudos(text, text, text, text, jsonb, jsonb)
  from public, authenticated;
grant execute on function public.orbita_importar_laudos(text, text, text, text, jsonb, jsonb)
  to anon;
