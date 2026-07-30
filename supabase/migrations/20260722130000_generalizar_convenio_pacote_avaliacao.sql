-- Generaliza cronograma_convenio_pacote_avaliacao pra qualquer terapia de
-- Processo Diagnóstico cobrada em bloco (não por sessão de 40min) — hoje
-- Avaliação Neuropsicológica (terapia_id 2268) e Psiquiatra/Neurologista
-- (terapia_id 2695, ver TERAPIA_ID em constants.ts). Cada convênio pode ter
-- um valor cadastrado por terapia dessas (ex.: Particular tem pacote de
-- Avaliação Neuropsicológica E um valor de consulta de Psiquiatra/Neurologista,
-- valores diferentes).
--
-- Também separa valor à vista (o que entra na Previsão de Receitas) do valor
-- parcelado (só referência/observação — parcelamento não é receita líquida
-- garantida, então não entra no cálculo de projeção).

alter table public.cronograma_convenio_pacote_avaliacao
  add column if not exists terapia_nome text not null default 'Avaliação Neuropsicológica',
  add column if not exists terapia_id integer not null default 2268,
  add column if not exists valor_parcelado numeric(10,2);

alter table public.cronograma_convenio_pacote_avaliacao
  rename column valor_pacote to valor_a_vista;

alter table public.cronograma_convenio_pacote_avaliacao
  alter column terapia_nome drop default,
  alter column terapia_id drop default;

drop index if exists uq_convenio_pacote_avaliacao_convenio;
create unique index if not exists uq_convenio_pacote_avaliacao_convenio_terapia
  on public.cronograma_convenio_pacote_avaliacao (convenio_nome, terapia_id);
