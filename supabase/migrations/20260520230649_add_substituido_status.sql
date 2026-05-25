alter table "public"."controle_terapeutico" drop constraint "controle_terapeutico_status_check";

alter table "public"."controle_terapeutico" add constraint "controle_terapeutico_status_check" CHECK ((status = ANY (ARRAY[
  'pendente'::text,
  'presente'::text,
  'faltou'::text,
  'disponivel'::text,
  'indisponivel'::text,
  'cobertura_planejada'::text,
  'cobertura_confirmada'::text,
  'substituido'::text
]))) not valid;

alter table "public"."controle_terapeutico" validate constraint "controle_terapeutico_status_check";
