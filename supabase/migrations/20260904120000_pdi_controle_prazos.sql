-- Controle de Prazos do PDI — Etapa 1 do plano (ver
-- C:\Users\Maquina001\.claude\plans\serene-seeking-toast.md), mesmo padrão de
-- public.laudos_acompanhamento (20260828150000_create_laudos_acompanhamento.sql):
-- tabela de estado atual + trigger de atualizado_em_brasilia + RLS por
-- usuario_tem_permissao(), histórico em public.cadastros_auditoria (migration
-- irmã 20260904120100).
--
-- ─── A chave, e por que é diferente da de laudos_acompanhamento ─────────────
--
-- laudos_acompanhamento é PK por `id_laudo` (o laudo é a unidade de trabalho:
-- um laudo pode trocar de paciente entre importações do Órbita, ver o
-- cabeçalho daquela migration). Aqui os campos são do PACIENTE, não do laudo —
-- "quando foi a avaliação", "quando vence a validade renovada" são fatos sobre
-- a pessoa, não sobre um laudo específico que pode ser substituído. Por isso
-- `paciente_id` é a PK: uma linha por paciente, upsert.
--
-- ─── Por que `paciente_id` NÃO tem FK para public.pacientes (correção 04/09/2026) ──
--
-- A primeira versão desta migration tinha `paciente_id bigint primary key
-- references public.pacientes(id_paciente)`. Errado: `public.pacientes` é o
-- cadastro interno do Pulsar, e NÃO é 100% adotado (confirmado pelo usuário)
-- — muitos pacientes reais (ativos na TiTa, com laudo, com agenda) não têm
-- linha lá. Uma FK dura para `pacientes` descartaria da tela exatamente os
-- pacientes cujo prazo mais precisa ser acompanhado.
--
-- `paciente_id` aqui É o `tita_paciente_id` — o "ID Favorecido" do relatório
-- Órbita, o mesmo número que `csv_grades_profissionais.paciente_id` usa (ver
-- 20260817190000_pacientes_canonica.sql e o cabeçalho de
-- frontend/lib/pdi/juntar.ts). `public.pacientes` continua sendo consultada
-- pela junção (frontend/lib/pdi/juntar.ts) como ENRIQUECIMENTO OPCIONAL —
-- nome de cadastro, foto, ativo/inativo — nunca como pré-condição para a
-- linha existir. Mesmo padrão de `laudos_acompanhamento`
-- (20260828150000_create_laudos_acompanhamento.sql) e de
-- `juntarComAcompanhamento()` em frontend/lib/laudos/acompanhamento.ts.
--
-- Datas derivadas (prazo do relatório, implementação do PIC, prazo de
-- fechamento, status, dias restantes, prioridade, alerta) NÃO são colunas —
-- computadas em módulo puro (frontend/lib/pdi/datas.ts, status.ts), igual a
-- lib/laudos/filtros.ts, para o card e o KPI nunca divergirem.
--
-- ─── Escrita e histórico ─────────────────────────────────────────────────────
--
-- Esta tabela guarda o ESTADO ATUAL. O histórico de cada alteração vai para
-- public.cadastros_auditoria, sob a entidade `pdi_controle_prazos` — ver a
-- migration 20260904120100. Trilha e estado separados, mesmo padrão do resto
-- do cadastro de pacientes e de laudos_acompanhamento.

create table if not exists public.pdi_controle_prazos (
  -- SEM FK, de propósito — ver o cabeçalho desta migration. É o
  -- `tita_paciente_id`/"ID Favorecido" puro, o mesmo espaço de identidade de
  -- `csv_grades_profissionais.paciente_id` e do relatório Órbita — NÃO
  -- `public.pacientes.id_paciente`. Um paciente elegível sem linha em
  -- `public.pacientes` continua tendo uma linha aqui.
  paciente_id bigint primary key,

  -- `profissional_id` do especialista responsável (Amanda Ribeiro Campos =
  -- 8648 ou Gracielle Rayane Faria Miranda = 8649 no TiTa — confirmados ao
  -- vivo em 04/09/2026 via PostgREST contra vw_grade_base, batem com o
  -- comentário de PROFISSIONAIS_SEM_CAPACIDADE_LIVRE em
  -- frontend/lib/cronograma/constants.ts). Sem FK: a identidade de
  -- profissional vive denormalizada em csv_grades_profissionais /
  -- grade_profissionais_tita, não há tabela canônica de profissionais para
  -- referenciar (ver o plano, seção "Descobertas-chave").
  especialista_tita_id bigint,

  -- ─── OS CAMPOS MANUAIS (o que a planilha tinha) ───
  data_avaliacao date,
  -- Manual, mas com ⚠️ pendência do usuário registrada no plano ("confirmar
  -- lógica" — badge de aviso previsto na UI, fora desta etapa): preencher
  -- `data_validade` reabre o ciclo como "Em andamento" mesmo que o prazo de
  -- fechamento calculado já tenha passado (ver frontend/lib/pdi/status.ts).
  data_validade date,
  -- Renomeado de "Status atual" da planilha (não confundir com o `status`
  -- CALCULADO em lib/pdi/status.ts — este aqui é texto livre digitado pela
  -- Amanda/Gracielle).
  observacoes text,

  criado_em      timestamptz not null default now(),
  -- uuid, não bigint: mesmo tipo de public.laudos_acompanhamento
  -- (`criado_por_id uuid references public.usuarios(id)`), copiado de lá de
  -- propósito para os dois módulos ficarem intercambiáveis no histórico.
  criado_por_id   uuid references public.usuarios(id),
  criado_por_nome text,

  atualizado_em      timestamptz not null default now(),
  atualizado_por_id   uuid references public.usuarios(id),
  atualizado_por_nome text,
  -- String já formatada em horário de Brasília, igual a
  -- cadastros_auditoria.criado_em_brasilia e a laudos_acompanhamento. Coluna
  -- GERADA não serve: to_char() e AT TIME ZONE não são IMMUTABLE.
  atualizado_em_brasilia text
);

create index if not exists idx_pdi_controle_prazos_especialista
  on public.pdi_controle_prazos (especialista_tita_id)
  where especialista_tita_id is not null;

create or replace function public.set_pdi_controle_prazos_atualizado()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  new.atualizado_em_brasilia :=
    to_char(new.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  return new;
end;
$$;

drop trigger if exists trg_pdi_controle_prazos_atualizado on public.pdi_controle_prazos;
create trigger trg_pdi_controle_prazos_atualizado
  before insert or update on public.pdi_controle_prazos
  for each row execute function public.set_pdi_controle_prazos_atualizado();

comment on table public.pdi_controle_prazos is
  'Estado atual do Controle de Prazos do PDI: avaliação -> relatório -> implementação do PIC -> fechamento em 6 meses, por paciente. Uma linha por paciente_id, gravada por upsert. Datas derivadas e status são calculados em frontend/lib/pdi/ (datas.ts, status.ts), nunca gravados como coluna. Histórico de alterações vive em public.cadastros_auditoria (entidade pdi_controle_prazos).';
comment on column public.pdi_controle_prazos.paciente_id is
  'tita_paciente_id ("ID Favorecido" do relatório Órbita) — o mesmo espaço de identidade de csv_grades_profissionais.paciente_id. SEM FK para public.pacientes: esse cadastro não é 100% adotado, e um paciente elegível sem linha lá não pode ficar de fora do Controle de Prazos. Ver frontend/lib/pdi/juntar.ts.';
comment on column public.pdi_controle_prazos.especialista_tita_id is
  'profissional_id (TiTa) do especialista responsável — Amanda Ribeiro Campos (8648) ou Gracielle Rayane Faria Miranda (8649), confirmados em 04/09/2026. Sem FK: identidade de profissional vive denormalizada em csv_grades_profissionais.';
comment on column public.pdi_controle_prazos.data_validade is
  'Preenchida manualmente. Reabre o ciclo como "Em andamento" mesmo com o prazo de fechamento calculado já vencido — ver frontend/lib/pdi/status.ts::calcularStatus. Lógica marcada como a confirmar com Amanda/Gracielle (ver o plano).';

-- ===== RLS =====
--
-- Permissão nova `terapeutico_pdi` (seed de permissão fica para a etapa de
-- integração/Sidebar, fora do escopo desta migration — ver o plano). O ramo
-- por PAPEL não é decoração: usuario_tem_permissao() lê usuarios_permissoes e
-- IGNORA os roleDefaults do frontend — sem ele, quem tem a tela pelo papel não
-- conseguiria gravar. Mesmo padrão de laudos_acompanhamento
-- (20260828150000), só que sem `recepcao` — este controle é do time
-- terapêutico (Amanda/Gracielle), não da recepção, e elas recebem a
-- permissão por concessão individual em /admin (ver a memória de projeto
-- "RLS por permissão em Ocupação Paciente": roleDefaults não cobre concessão
-- individual).
--
-- ⚠️ RLS bloqueando WRITE não gera erro visível no frontend: a gravação
-- "funciona" e não grava. Se o save não persistir, suspeitar daqui ANTES do
-- frontend.
--
-- SEM policy de DELETE, por pedido explícito do plano: registro de
-- acompanhamento não se apaga. Corrigir é editar, e a edição fica na trilha.

alter table public.pdi_controle_prazos enable row level security;

do $$
declare
  pol record;
  cond constant text :=
    '(public.usuario_tem_permissao(''terapeutico_pdi'')'
    || ' or public.remuneracao_has_role(array[''admin'',''diretoria'']))';
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pdi_controle_prazos'
  loop
    execute format('drop policy %I on public.pdi_controle_prazos', pol.policyname);
  end loop;

  execute format(
    'create policy pdi_controle_prazos_select on public.pdi_controle_prazos'
    || ' for select to authenticated using (%s)', cond);
  execute format(
    'create policy pdi_controle_prazos_insert on public.pdi_controle_prazos'
    || ' for insert to authenticated with check (%s)', cond);
  execute format(
    'create policy pdi_controle_prazos_update on public.pdi_controle_prazos'
    || ' for update to authenticated using (%s) with check (%s)', cond, cond);
end $$;

revoke all on public.pdi_controle_prazos from public;
revoke all on public.pdi_controle_prazos from anon;
revoke all on public.pdi_controle_prazos from authenticated;
grant select, insert, update on public.pdi_controle_prazos to authenticated;

alter table public.pdi_controle_prazos force row level security;
