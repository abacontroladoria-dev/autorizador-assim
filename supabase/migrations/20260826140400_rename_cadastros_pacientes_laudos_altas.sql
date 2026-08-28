-- Renomeia as quatro tabelas de Laudos/Altas para o prefixo de módulo
-- `cadastros_pacientes_*`, e troca `id`/`paciente_id`/`laudo_id` por nomes que
-- dizem de que id se trata.
--
-- POR QUÊ O PREFIXO: no painel do Supabase essas quatro tabelas caíam soltas no
-- meio de ~uma centena de outras. O prefixo por módulo agrupa alfabeticamente e
-- é a convenção que o projeto já usa (cronograma_*, autorizacoes_*, ca_*).
-- Schema Postgres dedicado (cadastros.laudos) seria o namespace "de verdade",
-- mas obrigaria a expor o schema na API e a escrever .schema('cadastros') em
-- todo acesso — desproporcional para quatro tabelas.
--
-- POR QUÊ OS NOMES DE COLUNA: `id` sozinho não diz id de quê, e `paciente_id`
-- não diz se é o id interno do Pulsar ou o do TiTa — as duas chaves existem em
-- public.pacientes (id_paciente e tita_paciente_id) e são numéricas, então
-- confundir uma pela outra não dá erro, dá dado errado. `id_paciente_pulsar`
-- fecha essa porta: estas FKs sempre apontaram para pacientes.id_paciente.
--
-- ATENÇÃO AO DEPLOY: aplicar isto sem subir o frontend junto derruba as abas
-- "Laudo" e "Altas e Individualidades" na hora — os .from()/.eq() do
-- frontend/services passam a apontar para nomes que não existem mais. Migration
-- e deploy vão no MESMO passo.
--
-- IDEMPOTENTE: cada rename só roda se ainda não foi feito. Renomear é
-- naturalmente não-idempotente (o segundo ALTER erra "não existe"), e este
-- projeto já teve migration aplicada pela metade — as guardas são por isso.

-- ===== 1. Tabelas =====
do $$
begin
  if to_regclass('public.paciente_laudos') is not null then
    alter table public.paciente_laudos rename to cadastros_pacientes_laudos;
  end if;
  if to_regclass('public.paciente_laudo_especialidades') is not null then
    alter table public.paciente_laudo_especialidades rename to cadastros_pacientes_laudo_especialidades;
  end if;
  if to_regclass('public.paciente_altas') is not null then
    alter table public.paciente_altas rename to cadastros_pacientes_altas;
  end if;
  if to_regclass('public.paciente_altas_individualidades') is not null then
    alter table public.paciente_altas_individualidades rename to cadastros_pacientes_altas_individualidades;
  end if;
end $$;

-- ===== 2. Colunas =====
-- A view vw_paciente_laudos_flat depende destas colunas; o Postgres reescreve a
-- definição dela sozinho no rename (a dependência é por OID, não por texto),
-- então ela não quebra aqui. Mesmo assim ela é recriada no passo 5, para o
-- texto que aparece no painel usar os nomes novos.
do $$
declare
  c record;
  renomeacoes constant text[][] := array[
    ['cadastros_pacientes_laudos',                  'id',          'id_laudo'],
    ['cadastros_pacientes_laudos',                  'paciente_id', 'id_paciente_pulsar'],
    ['cadastros_pacientes_laudo_especialidades',    'id',          'id_laudo_especialidade'],
    ['cadastros_pacientes_laudo_especialidades',    'laudo_id',    'id_laudo'],
    ['cadastros_pacientes_altas',                   'id',          'id_alta'],
    ['cadastros_pacientes_altas',                   'paciente_id', 'id_paciente_pulsar'],
    ['cadastros_pacientes_altas_individualidades',  'id',          'id_individualidade'],
    ['cadastros_pacientes_altas_individualidades',  'paciente_id', 'id_paciente_pulsar']
  ];
  i int;
begin
  for i in 1 .. array_length(renomeacoes, 1) loop
    select * into c
    from information_schema.columns
    where table_schema = 'public'
      and table_name = renomeacoes[i][1]
      and column_name = renomeacoes[i][2];

    if found then
      execute format(
        'alter table public.%I rename column %I to %I',
        renomeacoes[i][1], renomeacoes[i][2], renomeacoes[i][3]
      );
    end if;
  end loop;
end $$;

-- ===== 3. Índices =====
-- Índice não segue o nome da tabela no rename; ficariam quatro
-- `paciente_*_idx` pendurados em tabelas `cadastros_pacientes_*`. Cosmético,
-- mas é exatamente o tipo de resíduo que faz a próxima pessoa duvidar se o
-- índice é da tabela certa.
do $$
begin
  if to_regclass('public.paciente_laudos_paciente_id_idx') is not null then
    alter index public.paciente_laudos_paciente_id_idx
      rename to cadastros_pacientes_laudos_id_paciente_pulsar_idx;
  end if;
  if to_regclass('public.paciente_laudo_esp_laudo_id_idx') is not null then
    alter index public.paciente_laudo_esp_laudo_id_idx
      rename to cadastros_pacientes_laudo_especialidades_id_laudo_idx;
  end if;
  if to_regclass('public.paciente_altas_paciente_id_idx') is not null then
    alter index public.paciente_altas_paciente_id_idx
      rename to cadastros_pacientes_altas_id_paciente_pulsar_idx;
  end if;
end $$;

-- ===== 4. Policies =====
-- Policy também mantém o nome antigo. Note que `paciente_altas_*` era o nome
-- das policies de DUAS tabelas diferentes (altas e individualidades) — o mesmo
-- nome em tabelas distintas é válido no Postgres, e era mais uma fonte de
-- confusão ao ler o painel.
do $$
declare
  p record;
  novo text;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'cadastros_pacientes_laudos',
        'cadastros_pacientes_laudo_especialidades',
        'cadastros_pacientes_altas',
        'cadastros_pacientes_altas_individualidades'
      )
      and policyname !~ '^cadastros_pacientes_'
  loop
    -- Preserva só o sufixo da ação (select/insert/update/delete).
    novo := p.tablename || '_' || regexp_replace(p.policyname, '^.*_', '');
    execute format('alter policy %I on public.%I rename to %I', p.policyname, p.tablename, novo);
  end loop;
end $$;

-- ===== 5. View =====
-- DROP + CREATE, não CREATE OR REPLACE: a view antiga tem a coluna chamada
-- `id_paciente`, e queremos que ela passe a se chamar `id_paciente_pulsar`
-- (o mesmo nome da coluna real, agora renomeada). CREATE OR REPLACE VIEW não
-- aceita renomear coluna existente (só acrescentar no fim) — erro 42P16.
-- Nada mais depende desta view, então dropar é seguro.
drop view if exists public.vw_paciente_laudos_flat;
create view public.vw_paciente_laudos_flat as
select
  pl.id_laudo,
  pl.id_paciente_pulsar,
  p.nome as nome_paciente,
  pl.data_laudo,
  coalesce(pl.validade, (pl.data_laudo + interval '6 months')::date) as validade,
  case
    when coalesce(pl.validade, (pl.data_laudo + interval '6 months')::date) >= current_date
      then 'Vigente'
    else 'Vencido'
  end as situacao,
  pl.autorizado_em,
  pl.comp_agressivo,
  pl.paciente_verbal,
  pl.ambiente_natural,
  pl.nivel_suporte,
  ple.especialidade,
  ple.qt_laudo,
  ple.qt_autorizacao,
  pl.alta,
  pl.data_alta,
  pl.em_uso
from public.cadastros_pacientes_laudos pl
join public.pacientes p
  on p.id_paciente = pl.id_paciente_pulsar
left join public.cadastros_pacientes_laudo_especialidades ple
  on ple.id_laudo = pl.id_laudo;

-- ===== 6. Documentação no painel =====
-- COMMENT aparece ao lado da coluna no Table Editor do Supabase. É o que faz a
-- tabela ser legível para quem abre o painel sem ter o código do lado.
comment on table public.cadastros_pacientes_laudos is
  'Laudos médicos do paciente (aba "Laudo" do cadastro de pacientes). Um paciente acumula vários laudos ao longo do tempo; `em_uso` marca qual é o de referência hoje.';
comment on column public.cadastros_pacientes_laudos.id_laudo is
  'PK do laudo. É o valor gravado em cadastros_auditoria.registro_id quando tabela = ''laudo''.';
comment on column public.cadastros_pacientes_laudos.id_paciente_pulsar is
  'FK → pacientes.id_paciente (PK interna do Pulsar). NÃO é o id do TiTa: esse mora em pacientes.tita_paciente_id e vive em outra faixa numérica.';
comment on column public.cadastros_pacientes_laudos.validade is
  'Validade explícita do laudo. NULL significa "vale 6 meses a contar de data_laudo" — é o que a view vw_paciente_laudos_flat e o frontend calculam.';
comment on column public.cadastros_pacientes_laudos.arquivo_path is
  'Caminho do PDF no bucket `laudos-pacientes` do Storage. Acesso só por URL assinada de 15 min.';
comment on column public.cadastros_pacientes_laudos.alta is
  'Legado do desenho anterior, quando a alta era campo do laudo. A alta de verdade vive em cadastros_pacientes_altas desde 20260826140100.';

comment on table public.cadastros_pacientes_laudo_especialidades is
  'Especialidades constantes de um laudo, 1:N. `qt_laudo` é o que o laudo prescreve e `qt_autorizacao` o que o convênio liberou — divergirem é o caso normal, e é a divergência que a aba mostra.';
comment on column public.cadastros_pacientes_laudo_especialidades.id_laudo_especialidade is
  'PK da linha (a especialidade dentro do laudo), não do laudo.';
comment on column public.cadastros_pacientes_laudo_especialidades.id_laudo is
  'FK → cadastros_pacientes_laudos.id_laudo.';

comment on table public.cadastros_pacientes_altas is
  'Altas do paciente, 1:N — uma por especialidade. O mesmo paciente pode receber alta de Fonoaudiologia e seguir em Terapia Ocupacional.';
comment on column public.cadastros_pacientes_altas.id_alta is
  'PK da alta. É o valor gravado em cadastros_auditoria.registro_id quando tabela = ''alta''.';
comment on column public.cadastros_pacientes_altas.id_paciente_pulsar is
  'FK → pacientes.id_paciente (PK interna do Pulsar), não o id do TiTa.';
comment on column public.cadastros_pacientes_altas.arquivo_alta_path is
  'Caminho do anexo no bucket `laudos-pacientes` do Storage, sob o prefixo altas/.';

comment on table public.cadastros_pacientes_altas_individualidades is
  'Características do paciente que orientam o atendimento (comportamento agressivo, verbal, ambiente natural, nível de suporte). 0 ou 1 linha por paciente — descrevem o paciente, não um evento, por isso não são 1:N como as altas.';
comment on column public.cadastros_pacientes_altas_individualidades.id_individualidade is
  'PK da linha. É o valor gravado em cadastros_auditoria.registro_id quando tabela = ''alta_individualidade'' — espaço de ids DIFERENTE do de cadastros_pacientes_altas.';
comment on column public.cadastros_pacientes_altas_individualidades.id_paciente_pulsar is
  'FK → pacientes.id_paciente (PK interna do Pulsar), não o id do TiTa. UNIQUE: o service faz upsert por esta coluna.';
comment on column public.cadastros_pacientes_altas_individualidades.nivel_suporte is
  'Nível de suporte clínico: ''1'', ''2'', ''3'' ou ''NA'' (não se aplica).';
