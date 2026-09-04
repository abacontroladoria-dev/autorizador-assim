-- Dados escolares do paciente, declarados pelo RESPONSÁVEL num formulário público.
--
-- Três decisões que valem explicação, porque nenhuma delas é a óbvia:
--
-- 1. HISTÓRICO, não 1:1. Uma linha por envio, nunca sobrescrita. A criança troca
--    de escola, de turma e de turno ao longo do acompanhamento, e a mudança é
--    justamente o que a equipe terapêutica precisa enxergar. A ficha mostra a
--    linha mais recente (`criado_em desc`); as anteriores ficam como registro.
--    Por isso NÃO há unique em paciente_id.
--
-- 2. Endereço em UM campo de texto. `pacientes` e `responsaveis` guardam
--    CEP/logradouro/número/bairro/cidade/UF separados, e aqui seria fácil imitar.
--    Mas quem preenche é o pai, no celular, e ele não sabe o CEP da escola:
--    exigir a estrutura completa perde gente no meio do formulário. Consulta e
--    compartilhamento não sofrem com texto livre. Se um dia for preciso filtrar
--    escola por bairro, o caminho é acrescentar `escola_bairro`, não fatiar isto.
--
-- 3. Nada aqui é verdade confirmada. A tabela é alimentada por rota PÚBLICA, sem
--    login: o link é único para todos e circula por WhatsApp. O que existe é
--    `telefone_confere` (ver o comentário da coluna), que separa "veio da família"
--    de "veio de alguém" — e é um indício, não uma prova. A tela deve rotular como
--    "conferido" / "verificar", jamais como "suspeito".
--
-- A escrita pública NÃO passa por estas policies: o route handler usa service_role,
-- que ignora RLS. A barreira daquele caminho é a whitelist de colunas no handler.
-- As policies abaixo governam quem LÊ na aba da ficha do paciente.

create table if not exists public.pacientes_dados_escolares (
  id                       bigint generated always as identity primary key,
  paciente_id              bigint not null
                             references public.pacientes(id_paciente) on delete cascade,

  -- ===== Escola =====
  escola_nome              text not null,
  escola_endereco          text,
  escola_telefone          text,
  escola_email             text,

  -- ===== Pedagógico =====
  coordenador_nome         text,
  turma                    text,
  turno                    text,

  -- ===== Quem preencheu =====
  -- Declarado, não autenticado. `preenchido_por_parentesco` espelha a mesma lista
  -- fechada de `pacientes_responsaveis.parentesco` (20260828170050) e de
  -- frontend/types/responsavel.ts — os três lados mudam juntos.
  preenchido_por_nome       text not null,
  preenchido_por_parentesco text,
  preenchido_por_telefone   text,

  -- ===== Gravado pelo sistema =====
  telefone_confere         boolean,
  criado_em                timestamptz not null default now(),

  constraint pacientes_dados_escolares_turno_check
    check (turno is null or turno in ('Manhã', 'Tarde', 'Integral')),

  constraint pacientes_dados_escolares_parentesco_check
    check (preenchido_por_parentesco is null or preenchido_por_parentesco in
      ('Mãe', 'Pai', 'Madrasta', 'Padrasto', 'Avó', 'Avô', 'Irmã', 'Irmão',
       'Tia', 'Tio', 'Tutor(a) legal', 'Responsável legal', 'Próprio paciente',
       'Outro'))
);

-- A leitura da ficha é sempre "o envio mais recente deste paciente".
create index if not exists idx_pacientes_dados_escolares_paciente
  on public.pacientes_dados_escolares (paciente_id, criado_em desc);

comment on table public.pacientes_dados_escolares is
  'Dados escolares declarados pelo responsável em formulário público (/ficha-escolar). Histórico: uma linha por envio, nunca sobrescrita — a ficha lê a mais recente. Não é dado conferido.';
comment on column public.pacientes_dados_escolares.escola_endereco is
  'Texto livre de propósito: quem preenche é o responsável no celular e não sabe o CEP da escola. Não fatiar em logradouro/bairro/cidade sem uma razão de consulta concreta.';
comment on column public.pacientes_dados_escolares.preenchido_por_parentesco is
  'Mesma lista fechada de pacientes_responsaveis.parentesco (20260828170050) e de frontend/types/responsavel.ts. Mudar um lado sem os outros faz o insert morrer no CHECK.';
comment on column public.pacientes_dados_escolares.telefone_confere is
  'true = o telefone informado bate com algum responsável cadastrado do paciente; false = não bate; null = não foi possível comparar (paciente sem telefone cadastrado). Comparação pelos ÚLTIMOS 8 DÍGITOS, porque responsaveis.celular é texto livre sem normalização — "(21) 99999-9999" e "21999999999" são a mesma pessoa. É INDÍCIO de autenticidade, não prova: a tela rotula "conferido"/"verificar", nunca "suspeito".';

-- ===== RLS =====
-- Toda tabela nova em `public` nasce com RLS ligada e zero policies pelo event
-- trigger rls_auto_enable — ou seja, fechada para todos. O que segue é o que a
-- torna utilizável, e o `revoke`/`grant` não é opcional: RLS não substitui GRANT,
-- e sem ele o PostgREST devolve 403 mesmo com a policy no lugar.
alter table public.pacientes_dados_escolares enable row level security;

-- Remoção por catálogo: RLS é OR entre policies, e uma permissiva sobrevivente
-- anularia o fechamento em silêncio.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pacientes_dados_escolares'
  loop
    execute format('drop policy %I on public.pacientes_dados_escolares', pol.policyname);
  end loop;
end $$;

create policy "pacientes_dados_escolares_all" on public.pacientes_dados_escolares
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

revoke all on public.pacientes_dados_escolares from public;
revoke all on public.pacientes_dados_escolares from anon;
revoke all on public.pacientes_dados_escolares from authenticated;
grant select, insert, update, delete on public.pacientes_dados_escolares to authenticated;

alter table public.pacientes_dados_escolares force row level security;
