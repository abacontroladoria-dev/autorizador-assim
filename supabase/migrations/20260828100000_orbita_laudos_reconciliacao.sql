-- Reconciliação (2026-08-28): trazer `orbita_laudos_importacoes` e
-- `orbita_laudos_relatorio` para o repositório. Elas EXISTEM em produção desde
-- antes desta migration e foram criadas direto no banco — `rg -i orbita_laudos`
-- no repo inteiro dava zero ocorrências até aqui.
--
-- ⚠️ ESTE REPOSITÓRIO NÃO É O ESCRITOR DESTAS TABELAS.
-- Quem grava é um robô hospedado no Coolify, diariamente: ele baixa o
-- `relatorio_laudos_em_uso_*.xls` do Órbita, abre uma linha em
-- orbita_laudos_importacoes (status 'processando'), insere uma linha por linha
-- do Excel em orbita_laudos_relatorio e fecha com status 'concluido'. O código
-- deste repo apenas LÊ, por services/laudos/relatorio.ts (service_role, via
-- /api/laudos). Nenhuma mudança de forma aqui pode ser feita sem combinar com
-- quem mantém o robô — ela quebra a ingestão, não a leitura.
--
-- Por isso a migration é DESCRITIVA e IDEMPOTENTE: `create table if not
-- exists` não toca no que já existe (em produção é no-op integral) e serve para
-- que um `db reset` ou um ambiente novo nasçam com a estrutura certa em vez de
-- sem tabela nenhuma. Nenhum dado é lido, escrito, movido ou apagado.
--
-- Schema conferido em 28/08/2026 por três fontes: a definição OpenAPI do
-- PostgREST (tipos, NOT NULL, defaults, PK/FK), o `supabase gen types
-- typescript --linked` e uma consulta a pg_class/pg_indexes no banco. As três
-- batem.
--
-- Correções ao que o plano supunha, para quem for ler o plano depois:
--   • `headers` é jsonb, não text[];
--   • o status em andamento gravado pelo robô é 'processando' (o default da
--     coluna), não 'em_andamento';
--   • existem duas UNIQUE que nem o OpenAPI nem os tipos gerados revelam —
--     `arquivo_sha256` e `(importacao_id, linha_numero)` — e a segunda já é,
--     na prática, o índice do caminho de leitura.

-- ─── Tabelas ────────────────────────────────────────────────────────────────

create table if not exists public.orbita_laudos_importacoes (
  id             uuid        primary key default gen_random_uuid(),
  arquivo_nome   text        not null,
  -- Hash do .xls que o robô baixou, e o que casa uma importação com um arquivo
  -- em mão. É UNIQUE: o mesmo arquivo não entra duas vezes. Isso já resolve, no
  -- banco, a pergunta do plano §7.2 ("o robô rodou mas o Órbita devolveu o
  -- arquivo de ontem?") — um export byte a byte idêntico falha na inserção em
  -- vez de virar uma importação nova com dado velho. E é o motivo de uma
  -- reingestão só funcionar com arquivo que ainda não passou por aqui.
  arquivo_sha256 text        not null unique,
  sheet_name     text,
  -- Os 26 cabeçalhos do Excel, na ordem exata. O teste de contrato
  -- (services/laudos/contrato.test.ts, caso 18) compara esta lista com o que o
  -- código espera — é o único aviso ANTES de o Órbita renomear uma coluna e
  -- zerar gap em silêncio.
  headers        jsonb       not null default '[]'::jsonb,
  total_linhas   integer     not null default 0,
  -- 'processando' → 'concluido'. A leitura SÓ aceita 'concluido': relatório
  -- parcial é indistinguível de relatório completo pequeno.
  status         text        not null default 'processando',
  erro           text,
  iniciado_em    timestamptz not null default now(),
  concluido_em   timestamptz
);

create table if not exists public.orbita_laudos_relatorio (
  id             uuid        primary key default gen_random_uuid(),
  importacao_id  uuid        not null references public.orbita_laudos_importacoes(id),
  -- Posição da linha no Excel (1..N). É a ordenação estável da paginação: sem
  -- ela o laço de leitura pula linha, e uma linha pulada é um laudo perdido.
  linha_numero   integer     not null,
  -- A linha inteira do Excel: chaves = cabeçalhos, valores = texto, datas em
  -- DD/MM/AAAA. É lido como LaudoRow por identidade — nada de normalizar chave
  -- nem converter tipo (ver o cabeçalho de services/laudos/relatorio.ts).
  dados          jsonb       not null,
  -- Desnormalizações de conveniência, gravadas pelo robô a partir de `dados`.
  -- A leitura da aplicação NÃO as usa: filtrar por `situacao` aqui esconderia
  -- os laudos vencidos, que são demanda real (mais da metade do relatório).
  paciente       text,
  especialidade  text,
  qtd_autorizada text,
  situacao       text,
  plano          text,
  criado_em      timestamptz not null default now(),
  -- Uma linha do Excel entra uma vez por importação. Além da integridade, é o
  -- índice que serve à leitura paginada (mesmas colunas, mesma ordem) — por
  -- isso o bloco de índices abaixo NÃO cria outro em cima das mesmas duas.
  unique (importacao_id, linha_numero)
);

-- ─── Índices ────────────────────────────────────────────────────────────────
--
-- Os dois caminhos de leitura do serviço. Criados por bloco condicional em vez
-- de `create index if not exists` porque `if not exists` casa por NOME: se já
-- existe um índice equivalente com outro nome, o `if not exists` não o
-- enxergaria e criaria um segundo índice idêntico — custo de escrita dobrado na
-- carga diária, em troca de nada. O bloco abaixo compara o CONJUNTO DE COLUNAS.
--
-- E isso não é hipotético: em produção a UNIQUE
-- `orbita_laudos_relatorio_importacao_id_linha_numero_key` já cobre
-- (importacao_id, linha_numero), então o primeiro bloco é NO-OP lá e só cria
-- índice em ambiente novo, onde a UNIQUE acima nasce junto e também o dispensa.
-- O segundo (status, concluido_em) não existe hoje e será criado.

do $$
begin
  -- buscarLinhas(): where importacao_id = $1 order by linha_numero
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orbita_laudos_relatorio'
      and (
        select array_agg(a.attname::text order by k.ord)
        from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      ) = array['importacao_id', 'linha_numero']
  ) then
    create index orbita_laudos_relatorio_importacao_linha_idx
      on public.orbita_laudos_relatorio (importacao_id, linha_numero);
  end if;

  -- buscarUltimaImportacao(): where status = 'concluido' order by concluido_em desc
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'orbita_laudos_importacoes'
      and (
        select array_agg(a.attname::text order by k.ord)
        from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      ) = array['status', 'concluido_em']
  ) then
    create index orbita_laudos_importacoes_status_concluido_idx
      on public.orbita_laudos_importacoes (status, concluido_em desc);
  end if;
end $$;

-- ─── Acesso ─────────────────────────────────────────────────────────────────
--
-- O acesso continua sendo EXCLUSIVAMENTE service_role, que é o que o robô usa
-- para escrever e o que /api/laudos usa para ler — a chave nunca sai do
-- servidor. Medido em 28/08/2026, com a anon key e com a publishable key:
--
--   GET /rest/v1/orbita_laudos_importacoes → 401 {"code":"42501", ...}
--   GET /rest/v1/orbita_laudos_relatorio   → 401 {"code":"42501", ...}
--
-- 42501 é FALTA DE GRANT, não RLS negando linha. O `revoke` abaixo é no-op hoje
-- (não há o que revogar) e existe para fixar a intenção: se alguém liberar
-- leitura para o navegador algum dia, que seja por decisão explícita e não por
-- efeito colateral de um GRANT amplo. RLS fica ligado como segunda barreira —
-- sem policy, ninguém além de service_role (que a ignora) lê linha nenhuma.

revoke all on public.orbita_laudos_importacoes from anon, authenticated;
revoke all on public.orbita_laudos_relatorio   from anon, authenticated;

alter table public.orbita_laudos_importacoes enable row level security;
alter table public.orbita_laudos_relatorio   enable row level security;

-- ─── Documentação no próprio banco ──────────────────────────────────────────

comment on table public.orbita_laudos_importacoes is
  'Uma linha por execução do robô do Órbita (Coolify). ESCRITOR: o robô, não este repositório. Leitura: services/laudos/relatorio.ts, só status=''concluido''.';
comment on table public.orbita_laudos_relatorio is
  'Uma linha por linha do relatório de laudos do Órbita; `dados` é a linha do Excel em jsonb. ESCRITOR: o robô do Coolify. Ler sempre paginado, ordenado por linha_numero e filtrado por importacao_id.';
comment on column public.orbita_laudos_relatorio.situacao is
  'Vigente/Vencido. NÃO usar como filtro de leitura: laudo vencido é demanda real (o paciente segue em atendimento enquanto a renovação tramita).';
