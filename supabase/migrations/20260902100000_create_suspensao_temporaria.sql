-- Suspensão Temporária de Especialidade: terceiro bloco da aba "Altas e
-- Individualidades" do cadastro de paciente, ao lado de Alta e
-- Individualidades.
--
-- Diferente de Alta (encerramento definitivo), a suspensão é reversível e tem
-- prazo — por isso tabela própria, não uma variação da alta. O objetivo
-- declarado é permitir, no futuro, que outras ferramentas (grade, ocupação,
-- sugestão de horário) consultem "essa especialidade está suspensa para esse
-- paciente HOJE?" antes de ofertar um horário. Hoje NENHUMA ferramenta de
-- cronograma consulta a tabela de alta (investigado antes desta migration) —
-- não existe padrão de consulta cruzada pronto, esta tabela só deixa o
-- caminho pronto para esse consumo futuro.
--
-- "Vigente" não é só `ativo = true` (soft delete): é `ativo = true` E
-- (`prazo_indefinido` OU `prazo_fim >= hoje`). O CHECK abaixo garante que
-- `prazo_fim` e `prazo_indefinido` nunca contradizem um ao outro no banco —
-- quem lê a tabela não precisa validar essa combinação de novo.
--
-- Mesmo padrão de nomenclatura e de soft delete de cadastros_pacientes_altas
-- (20260826140100/140400, soft delete em 20260827100000): nada sai do banco,
-- só `ativo = false`.

create table public.cadastros_pacientes_suspensoes_temporarias (
  id_suspensao            bigserial   primary key,
  id_paciente_pulsar      int8        not null references public.pacientes(id_paciente) on delete cascade,
  data_suspensao          date        not null,
  especialidade_suspensao text        not null,
  prazo_indefinido        boolean     not null default false,
  prazo_fim               date,
  arquivo_suspensao_path  text,
  observacoes             text,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),
  ativo                   boolean     not null default true,
  constraint suspensao_prazo_check check (
    (prazo_indefinido and prazo_fim is null)
    or (not prazo_indefinido and prazo_fim is not null)
  )
);

create index cadastros_pacientes_suspensoes_id_paciente_idx
  on public.cadastros_pacientes_suspensoes_temporarias (id_paciente_pulsar);

create index cadastros_pacientes_suspensoes_ativas_idx
  on public.cadastros_pacientes_suspensoes_temporarias (id_paciente_pulsar)
  where ativo;

comment on table public.cadastros_pacientes_suspensoes_temporarias is
  'Suspensão temporária de especialidade por paciente. "Vigente" = ativo AND (prazo_indefinido OR prazo_fim >= hoje) — cálculo do lado de quem lê, não coluna.';
