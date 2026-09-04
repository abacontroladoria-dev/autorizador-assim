-- "Cadastro de quantidade esperada de pacientes" (cronograma/indicadores,
-- aba Profissionais) — generaliza a exceção hoje hardcoded em
-- MUSICO_CAPAC_POR_DIA (frontend/lib/cronograma/ocupacaoProf.ts): quantas
-- vagas simultâneas um profissional atende por dia da semana. Padrão é 1
-- (um paciente por horário); só quem tem linha aqui foge do padrão.
--
-- Chave é o nome do profissional (texto), não profissional_id: a mesma
-- convenção já usada em allSlots[prof] (useOcupacaoProf.ts) e em
-- MUSICO_CAPAC_POR_DIA — todo o motor de ocupação de profissionais agrupa
-- por nome, não por id. O match no frontend é sempre via normTxt (sem
-- acento/minúsculo), então a grafia exata aqui não precisa bater
-- caractere-a-caractere com a grade.
create table if not exists public.cronograma_capacidade_profissional_dia (
  id                uuid        primary key default gen_random_uuid(),
  profissional_nome text        not null,
  dow               smallint    not null check (dow between 1 and 5),
  capacidade        smallint    not null check (capacidade >= 1),
  atualizado_em     timestamptz not null default now(),
  unique (profissional_nome, dow)
);

alter table public.cronograma_capacidade_profissional_dia enable row level security;

-- Mesmo padrão de cronograma_salas_alocacoes (20260716180000): leitura e
-- escrita livres para autenticado, gate de acesso à tela fica na permissão
-- de rota (ocupacao_profissionais), não na RLS.
drop policy if exists "cronograma_capacidade_profissional_dia_select" on public.cronograma_capacidade_profissional_dia;
create policy "cronograma_capacidade_profissional_dia_select"
  on public.cronograma_capacidade_profissional_dia for select
  to authenticated using (true);

drop policy if exists "cronograma_capacidade_profissional_dia_insert" on public.cronograma_capacidade_profissional_dia;
create policy "cronograma_capacidade_profissional_dia_insert"
  on public.cronograma_capacidade_profissional_dia for insert
  to authenticated with check (true);

drop policy if exists "cronograma_capacidade_profissional_dia_update" on public.cronograma_capacidade_profissional_dia;
create policy "cronograma_capacidade_profissional_dia_update"
  on public.cronograma_capacidade_profissional_dia for update
  to authenticated using (true) with check (true);

drop policy if exists "cronograma_capacidade_profissional_dia_delete" on public.cronograma_capacidade_profissional_dia;
create policy "cronograma_capacidade_profissional_dia_delete"
  on public.cronograma_capacidade_profissional_dia for delete
  to authenticated using (true);

-- Semeia com as exceções que já valiam hoje (hardcoded), para a migração
-- para o cadastro editável não mudar nenhum número já calculado.
insert into public.cronograma_capacidade_profissional_dia (profissional_nome, dow, capacidade) values
  ('Rachel Silva De Castro De Brito',     1, 1),
  ('Rachel Silva De Castro De Brito',     3, 2),
  ('Rachel Silva De Castro De Brito',     4, 2),
  ('Thiago Henrique Brito Do Nascimento', 1, 3),
  ('Thiago Henrique Brito Do Nascimento', 2, 3),
  ('Luiz Gustavo Mello De Araujo',        3, 1),
  ('Luiz Gustavo Mello De Araujo',        4, 1),
  ('Luiz Gustavo Mello De Araujo',        5, 1),
  ('Rosenilza Abreu Da Silva Leiras',     3, 2),
  ('Ianca Aparecida Goncalves Izidorio',  5, 3)
on conflict (profissional_nome, dow) do nothing;
