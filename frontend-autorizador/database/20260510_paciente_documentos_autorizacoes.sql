begin;

alter table if exists public.agenda_tita_autorizacao
  add column if not exists cpf text,
  add column if not exists data_nascimento date;

alter table if exists public.agenda_tita
  add column if not exists cpf text,
  add column if not exists data_nascimento date;

alter table if exists public.fila_autorizacoes
  add column if not exists cpf text,
  add column if not exists data_nascimento date;

comment on column public.fila_autorizacoes.cpf is
  'CPF do paciente propagado da agenda TITA para a fila de autorizacoes.';

comment on column public.fila_autorizacoes.data_nascimento is
  'Data de nascimento do paciente propagada da agenda TITA para a fila de autorizacoes.';

commit;

/*
View propagation patch.

As definicoes atuais das views nao estao versionadas neste repositorio.
Ao recriar as views no banco, preserve todos os campos existentes e acrescente:

1. public.vw_match_autorizacoes_assim

   a.cpf,
   a.data_nascimento

   Onde "a" e a fonte de agenda TITA usada pela view
   (public.agenda_tita_autorizacao ou public.agenda_tita).

2. public.vw_central_autorizacoes

   m.cpf,
   m.data_nascimento

   Onde "m" e a fonte public.vw_match_autorizacoes_assim usada pela view.
   Se a view buscar direto da agenda, use os campos da agenda:

   a.cpf,
   a.data_nascimento

Validacao depois de recriar as views:

select
  paciente_nome,
  cpf,
  data_nascimento
from public.vw_central_autorizacoes
limit 5;
*/
