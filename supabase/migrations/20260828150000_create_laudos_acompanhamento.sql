-- Acompanhamento de Laudos: o registro da RECEPÇÃO de que o responsável foi
-- avisado da pendência de renovação.
--
-- Ver PLANO_ACOMPANHAMENTO_LAUDOS.md.
--
-- ─── A chave, e por que é ela ────────────────────────────────────────────────
--
-- A fonte dos laudos é `public.orbita_laudos_relatorio`, escrita por um robô do
-- Coolify que baixa o `relatorio_laudos_em_uso_*.xls` do Órbita todo dia. Uma
-- importação nova pode substituir a anterior por inteiro — o `id` (uuid) de cada
-- linha e o `importacao_id` NÃO sobrevivem a isso. Apontar para eles seria
-- perder o registro da recepção na primeira execução do robô.
--
-- `ID Laudo` sobrevive: é o id do laudo no ÓRBITA, não um id de linha. Medido em
-- 28/08/2026 entre as importações de 27/08 (1.850 linhas) e 28/08 (1.849):
-- 343 `ID Laudo` distintos em cada uma, os MESMOS 343 nas duas — nenhum só na
-- nova, nenhum só na antiga. Por isso `id_laudo` é a PK aqui, e é a ÚNICA coisa
-- do Órbita que esta tabela referencia. Sem FK: não se aponta para tabela que
-- outro processo pode esvaziar.
--
-- Outros fatos medidos na mesma sondagem, que este desenho assume:
--   • 343 laudos ↔ 343 `ID Favorecido` distintos: um laudo por paciente, 1:1.
--     Nenhum favorecido com dois laudos. Por isso uma linha por laudo já é uma
--     linha por paciente, e a PK simples basta.
--   • As 1.849 linhas são uma por ESPECIALIDADE (até 11 por laudo), e
--     `Data laudo`, `Validade`, `Autorizado em`, `Situação`, `Paciente` e
--     `ID Favorecido` são uniformes dentro de um mesmo `ID Laudo` em 343/343.
--   • 58 dos 343 laudos são de paciente SEM cadastro no Pulsar — 57 deles
--     vencidos. É o motivo de `paciente_id` ser NULO-permitido: a fila da
--     recepção não pode depender de o cadastro estar completo.
--
-- ─── Escrita e histórico ─────────────────────────────────────────────────────
--
-- Esta tabela guarda o ESTADO ATUAL (uma linha por laudo, upsert). O histórico
-- de cada alteração vai para `public.cadastros_auditoria`, sob a entidade
-- `laudo_acompanhamento` — ver a migration 20260828150100. Trilha e estado
-- separados, exatamente como no resto do cadastro de pacientes.
--
-- Nada aqui escreve em `orbita_laudos_*`. Aquelas tabelas são do robô.

create table if not exists public.laudos_acompanhamento (
  -- `ID Laudo` do Órbita, como texto — é como o robô grava no jsonb e como o
  -- frontend lê. Converter para bigint aqui obrigaria os dois lados a confiar
  -- que o Órbita nunca exporte um id não-numérico.
  id_laudo text primary key,

  -- `ID Favorecido` do relatório = `pacientes.tita_paciente_id`. Guardado
  -- mesmo quando `paciente_id` é nulo: é por ele que o cadastro, quando
  -- aparecer, será casado depois.
  id_favorecido bigint,

  -- FK OPCIONAL, de propósito (ver o cabeçalho: 58 laudos sem cadastro).
  -- `on delete set null`: apagar um paciente não pode apagar o registro de que a
  -- recepção cobrou a renovação.
  paciente_id bigint references public.pacientes(id_paciente) on delete set null,

  -- ─── O CAMPO ───
  -- A data em que a recepção mandou a mensagem para o responsável. Digitada à
  -- mão num calendário; `date` e não `timestamptz` porque o que se registra é o
  -- DIA do contato, e um horário falso seria pior que nenhum.
  mensagem_enviada_em date,
  observacao text,

  -- ─── Snapshot do laudo no último save ───
  -- Não é fonte de verdade — é memória. Serve para o histórico continuar
  -- legível depois que o laudo sair do relatório (renovado, paciente saiu), e
  -- para responder "quando a recepção avisou, a validade era qual?". A leitura
  -- da tela usa o relatório vivo, nunca estas colunas.
  snap_paciente_nome text,
  snap_data_laudo    date,
  snap_validade      date,
  snap_situacao      text,
  snap_autorizado_em date,

  criado_em      timestamptz not null default now(),
  criado_por_id   uuid references public.usuarios(id),
  criado_por_nome text,

  atualizado_em      timestamptz not null default now(),
  atualizado_por_id   uuid references public.usuarios(id),
  atualizado_por_nome text,
  -- String já formatada em horário de Brasília, igual a
  -- cadastros_auditoria.criado_em_brasilia. Coluna GERADA não serve: to_char()
  -- e AT TIME ZONE não são IMMUTABLE.
  atualizado_em_brasilia text
);

-- A tela abre filtrada em vencidos e ordenada por validade; o cruzamento é
-- sempre "este laudo tem registro?". A PK já resolve a busca por id_laudo.
create index if not exists idx_laudos_acompanhamento_favorecido
  on public.laudos_acompanhamento (id_favorecido);
create index if not exists idx_laudos_acompanhamento_paciente
  on public.laudos_acompanhamento (paciente_id)
  where paciente_id is not null;
-- "quais vencidos ainda não foram avisados" é a pergunta da tela.
create index if not exists idx_laudos_acompanhamento_sem_aviso
  on public.laudos_acompanhamento (id_laudo)
  where mensagem_enviada_em is null;

create or replace function public.set_laudos_acompanhamento_atualizado()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  new.atualizado_em_brasilia :=
    to_char(new.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  return new;
end;
$$;

drop trigger if exists trg_laudos_acompanhamento_atualizado on public.laudos_acompanhamento;
create trigger trg_laudos_acompanhamento_atualizado
  before insert or update on public.laudos_acompanhamento
  for each row execute function public.set_laudos_acompanhamento_atualizado();

comment on table public.laudos_acompanhamento is
  'Estado atual do acompanhamento de cada laudo do Órbita: quando a recepção avisou o responsável da renovação pendente. Uma linha por `ID Laudo`, gravada por upsert. O histórico de alterações vive em public.cadastros_auditoria (entidade `laudo_acompanhamento`). Nada aqui escreve em orbita_laudos_*.';
comment on column public.laudos_acompanhamento.id_laudo is
  '`ID Laudo` do Órbita. Única chave do Órbita referenciada, porque é a única que sobrevive à troca de importação do robô (medido: 343/343 estáveis entre 27/08 e 28/08/2026). Sem FK para orbita_laudos_relatorio, de propósito.';
comment on column public.laudos_acompanhamento.paciente_id is
  'Nulo quando o paciente do laudo não tem cadastro no Pulsar — 58 dos 343 laudos em 28/08/2026, 57 deles vencidos. A fila da recepção não depende do cadastro estar completo.';
comment on column public.laudos_acompanhamento.mensagem_enviada_em is
  'Data em que a recepção mandou a mensagem ao responsável. Digitada à mão. `date` e não timestamptz: o que se registra é o dia do contato.';
comment on column public.laudos_acompanhamento.snap_validade is
  'Snapshot do laudo no último save — memória, não fonte de verdade. A tela lê o relatório vivo.';

-- ===== RLS =====
--
-- Permissão nova `acompanhamento_laudos` (seed em 20260828150200). O ramo por
-- PAPEL não é decoração: usuario_tem_permissao() lê usuarios_permissoes e
-- IGNORA os roleDefaults do frontend — sem ele, quem tem a tela pelo papel não
-- conseguiria gravar. Mesmo padrão de 20260826140700.
--
-- ⚠️ RLS bloqueando WRITE não gera erro visível no frontend: a gravação
-- "funciona" e não grava. Se o save não persistir, suspeitar daqui ANTES do
-- frontend.
--
-- Sem policy de DELETE: registro de cobrança não se apaga. Corrigir é editar, e
-- a edição fica na trilha.

alter table public.laudos_acompanhamento enable row level security;

do $$
declare
  pol record;
  cond constant text :=
    '(public.usuario_tem_permissao(''acompanhamento_laudos'')'
    || ' or public.remuneracao_has_role(array[''admin'',''diretoria'',''recepcao'']))';
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'laudos_acompanhamento'
  loop
    execute format('drop policy %I on public.laudos_acompanhamento', pol.policyname);
  end loop;

  execute format(
    'create policy laudos_acompanhamento_select on public.laudos_acompanhamento'
    || ' for select to authenticated using (%s)', cond);
  execute format(
    'create policy laudos_acompanhamento_insert on public.laudos_acompanhamento'
    || ' for insert to authenticated with check (%s)', cond);
  execute format(
    'create policy laudos_acompanhamento_update on public.laudos_acompanhamento'
    || ' for update to authenticated using (%s) with check (%s)', cond, cond);
end $$;

revoke all on public.laudos_acompanhamento from public;
revoke all on public.laudos_acompanhamento from anon;
revoke all on public.laudos_acompanhamento from authenticated;
grant select, insert, update on public.laudos_acompanhamento to authenticated;

alter table public.laudos_acompanhamento force row level security;
