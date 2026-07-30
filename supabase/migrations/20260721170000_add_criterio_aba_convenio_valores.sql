-- Regra especial da SEGUROS UNIMED (e potencialmente outros convênios no
-- futuro): o valor da sessão não depende da terapia específica, e sim de o
-- CRONOGRAMA INTEIRO do paciente conter ou não Psicologia ABA (qualquer
-- sessão com terapia_exibicao_id = 2271 na semana de referência) — se
-- contém, todas as sessões desse paciente nesse convênio valem X; se não
-- contém, valem Y. É uma dimensão nova, ortogonal a terapia_id (regra "por
-- terapia" continua existindo pra casos como ASSIM Saúde).
--
-- Uma linha com criterio_aba preenchido sempre tem terapia_id/terapia_nome
-- nulos (a regra vale pra QUALQUER terapia daquele paciente, não uma
-- específica) — por isso o índice de "regra geral" (terapia_nome is null)
-- precisa passar a exigir também criterio_aba is null, senão colidiria com
-- as duas novas linhas (com_aba/sem_aba) do mesmo convênio.

alter table public.cronograma_convenio_valores
  add column if not exists criterio_aba text check (criterio_aba in ('com_aba', 'sem_aba'));

drop index if exists uq_convenio_valores_geral;
create unique index if not exists uq_convenio_valores_geral
  on public.cronograma_convenio_valores (convenio_nome) where terapia_nome is null and criterio_aba is null;

create unique index if not exists uq_convenio_valores_criterio_aba
  on public.cronograma_convenio_valores (convenio_nome, criterio_aba) where criterio_aba is not null;
