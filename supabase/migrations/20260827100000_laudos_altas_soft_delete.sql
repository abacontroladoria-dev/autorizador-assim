-- Laudo e alta deixam de ser apagáveis. "Excluir" passa a ser `ativo = false`.
--
-- POR QUÊ: laudo e alta são dado de saúde e registro clínico. Até aqui o botão
-- Excluir das abas fazia DELETE de verdade: a linha sumia do banco, e o que
-- restava era uma entrada na trilha de auditoria dizendo "Registro excluído" —
-- sem o conteúdo do que foi excluído, e sem como voltar atrás. Decisão do
-- usuário em 2026-08-27: nada de laudo/alta sai do banco.
--
-- COMO: coluna `ativo` nas duas tabelas, default true. O frontend passa a
-- marcar `ativo = false` no lugar do DELETE e a listar só `ativo = true`, então
-- a experiência de quem usa a tela não muda — o registro sai da lista. O que
-- muda é que ele continua no banco, com o conteúdo inteiro, recuperável.
--
-- E A GARANTIA DE VERDADE: o DELETE é REVOGADO na RLS (policy de delete
-- removida) e no GRANT. Sem isso, "não excluir" seria só uma combinação no
-- código do frontend — bastaria uma chamada direta à API, ou o próximo service
-- escrito sem saber da regra, para furar. Mesma postura de
-- cadastros_auditoria (20260826120000), que é append-only no nível de
-- privilégio e não só de policy.
--
-- FORA DO ESCOPO, de propósito:
--   - cadastros_pacientes_laudo_especialidades: o DELETE ali é interno e
--     legítimo — editarLaudo() apaga e recria as especialidades do laudo a cada
--     salvamento. Não é exclusão de registro clínico, é reescrita de uma lista
--     filha.
--   - cadastros_pacientes_altas_individualidades: 0-ou-1 por paciente, sem
--     botão de excluir na tela. É upsert, nunca delete.

-- ===== 1. A coluna =====
alter table public.cadastros_pacientes_laudos
  add column if not exists ativo boolean not null default true;

alter table public.cadastros_pacientes_altas
  add column if not exists ativo boolean not null default true;

comment on column public.cadastros_pacientes_laudos.ativo is
  'false = "excluído" pela tela. A linha NUNCA é apagada do banco (o DELETE é revogado, ver 20260827100000): laudo é registro clínico. A aba lista apenas ativo = true.';
comment on column public.cadastros_pacientes_altas.ativo is
  'false = "excluída" pela tela. A linha NUNCA é apagada do banco (o DELETE é revogado, ver 20260827100000): alta é registro clínico. A aba lista apenas ativo = true.';

-- ===== 2. Índices das leituras da aba =====
-- Toda listagem é "os laudos/altas ATIVOS deste paciente". Índice parcial: as
-- linhas inativas não precisam ocupar o índice, já que nunca são listadas.
create index if not exists cadastros_pacientes_laudos_ativos_idx
  on public.cadastros_pacientes_laudos (id_paciente_pulsar)
  where ativo;

create index if not exists cadastros_pacientes_altas_ativas_idx
  on public.cadastros_pacientes_altas (id_paciente_pulsar)
  where ativo;

-- ===== 3. O DELETE deixa de existir =====
-- Policy primeiro, GRANT depois: as duas camadas, para a regra valer também se
-- alguém recriar a policy sem prestar atenção.
drop policy if exists "cadastros_pacientes_laudos_delete" on public.cadastros_pacientes_laudos;
drop policy if exists "cadastros_pacientes_altas_delete" on public.cadastros_pacientes_altas;

revoke delete on public.cadastros_pacientes_laudos from authenticated;
revoke delete on public.cadastros_pacientes_altas from authenticated;

comment on table public.cadastros_pacientes_laudos is
  'Laudos médicos do paciente (aba "Laudo" do cadastro de pacientes). Um paciente acumula vários laudos ao longo do tempo; `em_uso` marca qual é o de referência hoje. NÃO É APAGÁVEL: "excluir" na tela grava ativo = false, e o privilégio de DELETE é revogado (20260827100000).';
comment on table public.cadastros_pacientes_altas is
  'Altas do paciente, 1:N — uma por especialidade. O mesmo paciente pode receber alta de Fonoaudiologia e seguir em Terapia Ocupacional. NÃO É APAGÁVEL: "excluir" na tela grava ativo = false, e o privilégio de DELETE é revogado (20260827100000).';

-- ===== 4. A view ganha a coluna `ativo` =====
-- SEM filtrar por ela: "excluído" continua visível (marcado), a decisão de
-- esconder ou não é da tela, não da consulta — mesmo raciocínio do frontend
-- (ver services/pacienteLaudos.service.ts). `create or replace` serve aqui:
-- nenhuma coluna muda de nome, só entra uma no fim.
create or replace view public.vw_paciente_laudos_flat as
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
  pl.em_uso,
  pl.ativo
from public.cadastros_pacientes_laudos pl
join public.pacientes p
  on p.id_paciente = pl.id_paciente_pulsar
left join public.cadastros_pacientes_laudo_especialidades ple
  on ple.id_laudo = pl.id_laudo;
