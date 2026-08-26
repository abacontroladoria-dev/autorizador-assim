-- Fecha a FK que 20260826100300 deixou pendente de propósito, comentada
-- assim no DDL original:
--
--   alter table public.pacientes_ficha_medica
--     add constraint pacientes_ficha_medica_plano_saude_id_fkey
--     foreign key (plano_saude_id) references public.<tabela_planos>(id);
--
-- A tabela de planos (public.planos_saude, bigint identity — mesmo tipo de
-- pacientes_ficha_medica.plano_saude_id) foi criada em 20260826110000.

alter table public.pacientes_ficha_medica
  add constraint pacientes_ficha_medica_plano_saude_id_fkey
  foreign key (plano_saude_id) references public.planos_saude(id);
