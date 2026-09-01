-- "Origem judicial" nas individualidades do paciente.
--
-- Parte do atendimento chega por via judicial, e a forma como chega muda o que
-- a clínica precisa cumprir: liminar tem prazo, penhora envolve bloqueio de
-- valores, acordo tem termos negociados. Hoje isso não é registrado em lugar
-- nenhum do cadastro — quem sabe, sabe de cabeça.
--
-- Lista fechada, e não texto livre, pela mesma razão do parentesco
-- (20260828170000): campo aberto vira dezoito grafias da mesma coisa e não se
-- consegue contar quantos pacientes são de liminar.
--
-- NULL = "Não informado", que é o padrão. Não existe valor 'Não informado'
-- gravado: ausência de dado é NULL, não uma string dizendo que não há dado —
-- senão passa a haver dois jeitos de representar a mesma coisa.

alter table public.cadastros_pacientes_altas_individualidades
  add column if not exists origem_judicial text;

-- Nome curto de propósito: o nome "completo"
-- (cadastros_pacientes_altas_individualidades_origem_judicial_check) tem 64
-- caracteres e o Postgres trunca identificador em 63 — o IF NOT EXISTS abaixo
-- nunca casaria com o nome truncado, e reaplicar a migration estouraria com
-- "constraint já existe".
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.cadastros_pacientes_altas_individualidades'::regclass
                   and conname = 'individualidades_origem_judicial_check') then
    alter table public.cadastros_pacientes_altas_individualidades
      add constraint individualidades_origem_judicial_check
      check (origem_judicial is null or origem_judicial in ('Liminar', 'Penhora', 'Acordo'));
  end if;
end $$;

comment on column public.cadastros_pacientes_altas_individualidades.origem_judicial is
  'Como o atendimento chegou por via judicial: Liminar, Penhora ou Acordo. '
  'NULL = não informado (o padrão), e é a ÚNICA forma de representar ausência — '
  'não gravar a string "Não informado". A lista espelha ORIGENS_JUDICIAIS em '
  'frontend/types/laudos.ts; alterar um lado exige alterar o outro.';
