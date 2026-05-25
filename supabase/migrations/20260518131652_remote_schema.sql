create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create extension if not exists "pg_net" with schema "public";

create extension if not exists "unaccent" with schema "public";

create type "public"."status_terapeutico" as enum ('pendente', 'presente', 'falta', 'atraso', 'cobertura_planejada', 'cobertura_confirmada', 'cancelado');

create sequence "public"."agenda_tita_id_seq";

create sequence "public"."terapeuta_eventos_id_seq";

create sequence "public"."tita_grade_profissionais_id_seq";


  create table "public"."agenda_orbita" (
    "id" uuid not null default gen_random_uuid(),
    "paciente_id" text not null,
    "paciente_nome" text not null,
    "matricula" text,
    "empresa" text,
    "dep" text,
    "data_atendimento" date not null,
    "horario" time without time zone not null,
    "terapia" text,
    "tuss" text,
    "crm" text,
    "nome_medico" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp without time zone default now(),
    "ativo" boolean default true
      );


alter table "public"."agenda_orbita" enable row level security;


  create table "public"."agenda_terapias" (
    "id" uuid not null default gen_random_uuid(),
    "paciente_id" text not null,
    "paciente_nome" text not null,
    "matricula" text,
    "empresa" text,
    "dep" text,
    "data_atendimento" date not null,
    "horario" time without time zone not null,
    "terapia" text,
    "tuss" text,
    "crm" text,
    "nome_medico" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."agenda_terapias" enable row level security;


  create table "public"."agenda_tita" (
    "id" bigint not null default nextval('public.agenda_tita_id_seq'::regclass),
    "tita_agendamento_id" bigint not null,
    "origem" text,
    "data_atendimento" date,
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "paciente_id" bigint,
    "paciente_nome" text,
    "cpf" text,
    "profissional_id" bigint,
    "profissional_nome" text,
    "profissional_cpf" text,
    "terapia_id" bigint,
    "terapia_nome" text,
    "terapia_exibicao_id" bigint,
    "terapia_exibicao_nome" text,
    "sala_id" bigint,
    "sala_nome" text,
    "sala_observacoes" text,
    "clinica_id" bigint,
    "clinica_nome" text,
    "convenio_id" bigint,
    "convenio_nome" text,
    "numero_carteirinha" text,
    "responsavel_nome" text,
    "responsavel_telefone" text,
    "responsavel_email" text,
    "atividade" text,
    "ativo" boolean default true,
    "raw_json" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "data_nascimento" date
      );


alter table "public"."agenda_tita" enable row level security;


  create table "public"."agenda_tita_autorizacao_backup_20260508" (
    "id" bigint,
    "tita_agendamento_id" bigint,
    "origem" text,
    "data_atendimento" date,
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "paciente_id" bigint,
    "paciente_nome" text,
    "cpf" text,
    "profissional_id" bigint,
    "profissional_nome" text,
    "profissional_cpf" text,
    "terapia_id" bigint,
    "terapia_nome" text,
    "terapia_exibicao_id" bigint,
    "terapia_exibicao_nome" text,
    "sala_id" bigint,
    "sala_nome" text,
    "sala_observacoes" text,
    "clinica_id" bigint,
    "clinica_nome" text,
    "convenio_id" bigint,
    "convenio_nome" text,
    "numero_carteirinha" text,
    "responsavel_nome" text,
    "responsavel_telefone" text,
    "responsavel_email" text,
    "atividade" text,
    "ativo" boolean,
    "raw_json" jsonb,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "empresa" text,
    "matricula" text,
    "dep" text,
    "crm" text,
    "nome_medico" text,
    "codigo_tuss" text
      );


alter table "public"."agenda_tita_autorizacao_backup_20260508" enable row level security;


  create table "public"."autorizacoes" (
    "id" uuid not null default gen_random_uuid(),
    "paciente_nome" text,
    "empresa" text,
    "matricula" text,
    "dep" text,
    "crm" text,
    "nome_medico" text,
    "terapia" text,
    "tuss1" text,
    "data_horario" timestamp without time zone,
    "usuario_id" uuid,
    "machine_id" text,
    "status" text default 'pendente'::text,
    "erro" text,
    "log" jsonb,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now(),
    "paciente_id" text,
    "data_atendimento" date,
    "horario_atendimento" time without time zone,
    "orbita_agenda_id" text,
    "erro_detalhe" text,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "horario" text,
    "ultima_autorizacao" timestamp without time zone
      );


alter table "public"."autorizacoes" enable row level security;


  create table "public"."autorizacoes_assim" (
    "guia" text not null,
    "matricula" text,
    "paciente_nome" text,
    "data_execucao" timestamp without time zone,
    "data_autorizacao" timestamp without time zone,
    "status" text,
    "codigo_tuss" text,
    "codigo_erro" text,
    "descricao_erro" text,
    "teve_token" boolean default false,
    "updated_at" timestamp without time zone default now(),
    "token" text,
    "status_tratado" text,
    "matricula_limpa" text,
    "paciente_id" bigint
      );


alter table "public"."autorizacoes_assim" enable row level security;


  create table "public"."backup_fila_null_terapia" (
    "id" uuid,
    "paciente_id" text,
    "paciente_nome" text,
    "data_atendimento" date,
    "horario" time without time zone,
    "status" text,
    "criado_por" text,
    "created_at" timestamp without time zone,
    "updated_at" timestamp without time zone,
    "machine_id" text,
    "empresa" text,
    "matricula" text,
    "dep" text,
    "crm" text,
    "nome_medico" text,
    "tuss1" text,
    "tuss" text,
    "tipo_falta" text,
    "terapia_falta" text,
    "agenda_id" uuid,
    "completion_type" text,
    "completed_at" timestamp without time zone,
    "completed_by" text,
    "numero_autorizacao" text,
    "started_at" timestamp without time zone,
    "execution_time_ms" integer,
    "error_message" text,
    "status_assim" text,
    "assim_updated_at" timestamp without time zone,
    "horario_autorizacao" timestamp without time zone,
    "data_horario" timestamp with time zone,
    "usuario_id" text,
    "terapia_nome" text,
    "terapia_exibicao_id" bigint
      );


alter table "public"."backup_fila_null_terapia" enable row level security;


  create table "public"."chamada_paciente" (
    "id" uuid not null default gen_random_uuid(),
    "agenda_id" uuid,
    "nome" text not null,
    "sala" text default '1'::text,
    "chamado_por" text,
    "unidade" text default 'principal'::text,
    "chamado_em" timestamp with time zone default now(),
    "status" text default 'ativo'::text
      );


alter table "public"."chamada_paciente" enable row level security;


  create table "public"."controle_disponibilidade_terapeutas" (
    "id" uuid not null default gen_random_uuid(),
    "data" date not null,
    "agenda_id" bigint,
    "terapeuta_id" bigint not null,
    "terapeuta_nome" text not null,
    "terapia_id" bigint,
    "terapia_nome" text,
    "hora_inicial" time without time zone not null,
    "hora_final" time without time zone,
    "status" text not null default 'disponivel'::text,
    "possui_substituto" boolean not null default false,
    "substituto_id" bigint,
    "substituto_nome" text,
    "motivo" text,
    "observacao" text,
    "criado_por" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."controle_disponibilidade_terapeutas" enable row level security;


  create table "public"."controle_terapeutico" (
    "id" uuid not null default gen_random_uuid(),
    "tita_agendamento_id" bigint not null,
    "status" text not null default 'pendente'::text,
    "profissional_substituto_id" bigint,
    "observacao" text,
    "confirmado_por" uuid,
    "confirmado_em" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "data_atualizacao" timestamp with time zone,
    "profissional_substituto_nome" text
      );


alter table "public"."controle_terapeutico" enable row level security;


  create table "public"."fila_autorizacoes" (
    "id" uuid not null default gen_random_uuid(),
    "paciente_id" text not null,
    "paciente_nome" text not null,
    "data_atendimento" date not null,
    "horario" time without time zone not null,
    "status" text not null default 'pendente'::text,
    "criado_por" text,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone,
    "machine_id" text,
    "empresa" text,
    "matricula" text,
    "dep" text,
    "crm" text,
    "nome_medico" text,
    "tuss1" text,
    "tuss" text,
    "tipo_falta" text,
    "terapia_falta" text,
    "agenda_id" uuid,
    "completion_type" text default 'automated'::text,
    "completed_at" timestamp without time zone,
    "completed_by" text,
    "numero_autorizacao" text,
    "started_at" timestamp without time zone,
    "execution_time_ms" integer,
    "error_message" text,
    "status_assim" text,
    "assim_updated_at" timestamp without time zone,
    "horario_autorizacao" timestamp without time zone,
    "data_horario" timestamp with time zone,
    "usuario_id" text,
    "terapia_nome" text,
    "terapia_exibicao_id" bigint,
    "tita_agendamento_id" bigint,
    "forma_autorizacao" text,
    "validacao_finalizada_em" timestamp without time zone
      );


alter table "public"."fila_autorizacoes" enable row level security;


  create table "public"."fila_autorizacoes_logs" (
    "id" uuid not null default gen_random_uuid(),
    "fila_id" uuid not null,
    "status" text,
    "descricao" text,
    "usuario" text,
    "machine_id" text,
    "erro" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now(),
    "tita_agendamento_id" bigint,
    "horario_autorizacao" timestamp with time zone,
    "numero_autorizacao" text
      );


alter table "public"."fila_autorizacoes_logs" enable row level security;


  create table "public"."grade_profissionais_tita" (
    "id" uuid not null default gen_random_uuid(),
    "grade_terapeuta_id" bigint not null,
    "grade_clinica_id" bigint,
    "profissional_id" bigint,
    "nome_profissional" text,
    "cpf_profissional" text,
    "numero_telefone" text,
    "cbo_profissional" text,
    "registro_profissional" text,
    "tipo_registro_profissional" text,
    "uf_registro_profissional" text,
    "id_unidade" bigint,
    "nome_unidade" text,
    "dia_semana" text,
    "data" date not null,
    "hora_inicial" time without time zone not null,
    "hora_final" time without time zone not null,
    "status_agendamento" text,
    "terapia_id" bigint,
    "nome_terapia" text,
    "terapia_exibicao_id" bigint,
    "terapia_exibicao" text,
    "id_sala" bigint,
    "sala" text,
    "observacoes_sala" text,
    "raw_json" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."grade_profissionais_tita" enable row level security;


  create table "public"."guia_terapias" (
    "id" uuid not null default gen_random_uuid(),
    "guia_numero" text not null,
    "terapeuta_id" uuid,
    "terapia_nome" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."guia_terapias" enable row level security;


  create table "public"."guias_processadas" (
    "id" uuid not null default gen_random_uuid(),
    "guia_numero" text,
    "status" text not null default 'pendente'::text,
    "page_count" integer not null default 0,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."guias_processadas" enable row level security;


  create table "public"."logs" (
    "id" uuid not null default gen_random_uuid(),
    "autorizacao_id" uuid,
    "mensagem" text,
    "created_at" timestamp without time zone default now(),
    "nivel" text default 'info'::text,
    "origem" text default 'worker'::text,
    "fila_id" uuid
      );


alter table "public"."logs" enable row level security;


  create table "public"."logs_execucao" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid,
    "user_id" uuid,
    "machine_id" text,
    "tipo_acao" text,
    "status" text,
    "mensagem" text,
    "payload" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."logs_execucao" enable row level security;


  create table "public"."maquinas" (
    "id" text not null,
    "nome" text,
    "created_at" timestamp without time zone default now(),
    "user_id" uuid,
    "last_seen" timestamp without time zone,
    "ativa" boolean default true,
    "hostname" text,
    "ip" text,
    "token_maquina" text,
    "sistema_operacional" text,
    "navegador" text,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."maquinas" enable row level security;


  create table "public"."paciente_classificacao" (
    "id" uuid not null default gen_random_uuid(),
    "paciente_id" text,
    "paciente_nome" text,
    "convenio_tipo" text,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
      );


alter table "public"."paciente_classificacao" enable row level security;


  create table "public"."perfis" (
    "id" uuid not null,
    "nome" text,
    "role" text default 'atendente'::text,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."perfis" enable row level security;


  create table "public"."pre_auditoria_snapshot" (
    "id" uuid not null default gen_random_uuid(),
    "data_ref" date,
    "total" integer,
    "liberados" integer,
    "erros" integer,
    "pendentes" integer,
    "faltas" integer,
    "tokens" integer,
    "created_at" timestamp without time zone default now()
      );


alter table "public"."pre_auditoria_snapshot" enable row level security;


  create table "public"."sessions" (
    "id" uuid not null,
    "user_id" uuid,
    "machine_id" text,
    "status" text default 'active'::text,
    "created_at" timestamp with time zone default now(),
    "last_seen" timestamp with time zone default now()
      );


alter table "public"."sessions" enable row level security;


  create table "public"."sync_controle" (
    "id" integer not null default 1,
    "status" text default 'idle'::text,
    "force" boolean default false,
    "last_run" timestamp with time zone,
    "updated_at" timestamp with time zone default now(),
    "machine_id" text
      );


alter table "public"."sync_controle" enable row level security;


  create table "public"."sync_status" (
    "id" integer not null,
    "status" text,
    "updated_at" timestamp without time zone default now()
      );


alter table "public"."sync_status" enable row level security;


  create table "public"."terapeuta_eventos" (
    "id" bigint not null default nextval('public.terapeuta_eventos_id_seq'::regclass),
    "data_evento" date not null,
    "terapeuta" text not null,
    "terapia" text,
    "unidade" text,
    "sala" text,
    "horario_referencia" time without time zone,
    "evento" text not null,
    "substituto" text,
    "observacao" text,
    "usuario" text,
    "created_at" timestamp without time zone default timezone('America/Sao_Paulo'::text, now())
      );


alter table "public"."terapeuta_eventos" enable row level security;


  create table "public"."terapeutas" (
    "id" uuid not null default gen_random_uuid(),
    "nome" text not null,
    "email" text,
    "carimbo_digital" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."terapeutas" enable row level security;


  create table "public"."terapias_controle" (
    "terapia_id" bigint not null,
    "terapia_nome" text not null,
    "ativo" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."terapias_controle" enable row level security;


  create table "public"."tita_grade_profissionais" (
    "id" bigint not null default nextval('public.tita_grade_profissionais_id_seq'::regclass),
    "data_atendimento" date not null,
    "terapeuta_id" bigint,
    "terapeuta_nome" text not null,
    "cpf_profissional" text,
    "terapia" text,
    "unidade" text,
    "sala" text,
    "status_agendamento" text,
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "grade_terapeuta_id" bigint,
    "grade_clinica_id" bigint,
    "raw_json" jsonb,
    "created_at" timestamp without time zone default timezone('America/Sao_Paulo'::text, now())
      );


alter table "public"."tita_grade_profissionais" enable row level security;


  create table "public"."usuarios" (
    "id" uuid not null,
    "nome" text not null,
    "email" text not null,
    "role" text not null default 'recepcao'::text,
    "ativo" boolean default true,
    "created_at" timestamp with time zone default now(),
    "ultimo_acesso" timestamp with time zone,
    "updated_at" timestamp with time zone default now(),
    "username" text,
    "primeiro_acesso" boolean default true
      );


alter table "public"."usuarios" enable row level security;


  create table "public"."vw_central_pacientes_backup_20260508" (
    "id" uuid,
    "agenda_id" uuid,
    "paciente_id" text,
    "paciente_nome" text,
    "data_atendimento" date,
    "horario" time without time zone,
    "data_horario" timestamp without time zone,
    "status" text,
    "status_assim" text,
    "tipo_falta" text,
    "completion_type" text,
    "numero_autorizacao" text,
    "machine_id" text,
    "error_message" text,
    "execution_time_ms" integer,
    "created_at" timestamp without time zone,
    "updated_at" timestamp without time zone,
    "assim_updated_at" timestamp without time zone,
    "horario_autorizacao" timestamp without time zone,
    "terapia_exibicao_id" bigint,
    "classificacao_terapia" text,
    "hora_inicial" time without time zone,
    "hora_final" time without time zone,
    "profissional_nome" text,
    "profissional_id" bigint,
    "terapia_nome" text,
    "terapia_exibicao_nome" text,
    "sala_nome" text,
    "clinica_nome" text,
    "convenio_nome" text,
    "responsavel_nome" text,
    "responsavel_telefone" text,
    "numero_carteirinha" text,
    "unidade" text,
    "convenio" text,
    "status_operacional" text,
    "usuario_nome" text
      );


alter table "public"."vw_central_pacientes_backup_20260508" enable row level security;


  create table "public"."worker_tokens" (
    "token" uuid not null,
    "user_id" uuid,
    "expires_at" timestamp with time zone not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."worker_tokens" enable row level security;

alter sequence "public"."agenda_tita_id_seq" owned by "public"."agenda_tita"."id";

alter sequence "public"."terapeuta_eventos_id_seq" owned by "public"."terapeuta_eventos"."id";

alter sequence "public"."tita_grade_profissionais_id_seq" owned by "public"."tita_grade_profissionais"."id";

CREATE UNIQUE INDEX agenda_orbita_pkey ON public.agenda_orbita USING btree (id);

CREATE UNIQUE INDEX agenda_orbita_unique ON public.agenda_orbita USING btree (paciente_id, data_atendimento, horario, terapia);

CREATE UNIQUE INDEX agenda_terapias_pkey ON public.agenda_terapias USING btree (id);

CREATE INDEX agenda_tita_ativo_idx ON public.agenda_tita USING btree (ativo);

CREATE INDEX agenda_tita_data_idx ON public.agenda_tita USING btree (data_atendimento);

CREATE INDEX agenda_tita_paciente_idx ON public.agenda_tita USING btree (paciente_id);

CREATE UNIQUE INDEX agenda_tita_pkey ON public.agenda_tita USING btree (id);

CREATE UNIQUE INDEX agenda_tita_unico ON public.agenda_tita USING btree (tita_agendamento_id);

CREATE UNIQUE INDEX autorizacoes_assim_guia_key ON public.autorizacoes_assim USING btree (guia);

CREATE UNIQUE INDEX autorizacoes_assim_pkey ON public.autorizacoes_assim USING btree (guia);

CREATE UNIQUE INDEX autorizacoes_pkey ON public.autorizacoes USING btree (id);

CREATE UNIQUE INDEX chamada_paciente_pkey ON public.chamada_paciente USING btree (id);

CREATE UNIQUE INDEX controle_disponibilidade_terapeutas_pkey ON public.controle_disponibilidade_terapeutas USING btree (id);

CREATE UNIQUE INDEX controle_terapeutico_pkey ON public.controle_terapeutico USING btree (id);

CREATE UNIQUE INDEX controle_terapeutico_tita_agendamento_id_key ON public.controle_terapeutico USING btree (tita_agendamento_id);

CREATE UNIQUE INDEX disponibilidade_terapeuta_horario_unico ON public.controle_disponibilidade_terapeutas USING btree (data, terapeuta_id, hora_inicial, terapia_id);

CREATE UNIQUE INDEX fila_autorizacoes_logs_pkey ON public.fila_autorizacoes_logs USING btree (id);

CREATE UNIQUE INDEX fila_autorizacoes_pkey ON public.fila_autorizacoes USING btree (id);

CREATE UNIQUE INDEX fila_autorizacoes_unique ON public.fila_autorizacoes USING btree (paciente_id, data_atendimento, horario, terapia_nome);

CREATE UNIQUE INDEX grade_profissionais_tita_pkey ON public.grade_profissionais_tita USING btree (id);

CREATE UNIQUE INDEX guia_terapias_pkey ON public.guia_terapias USING btree (id);

CREATE UNIQUE INDEX guias_processadas_pkey ON public.guias_processadas USING btree (id);

CREATE INDEX idx_agenda_data ON public.agenda_terapias USING btree (data_atendimento);

CREATE INDEX idx_agenda_orbita_data ON public.agenda_orbita USING btree (data_atendimento);

CREATE INDEX idx_agenda_orbita_paciente ON public.agenda_orbita USING btree (paciente_id);

CREATE INDEX idx_agenda_paciente ON public.agenda_terapias USING btree (paciente_id);

CREATE INDEX idx_agenda_tita_carteirinha ON public.agenda_tita USING btree (numero_carteirinha);

CREATE INDEX idx_agenda_tita_operacional ON public.agenda_tita USING btree (data_atendimento, hora_inicial, numero_carteirinha, terapia_exibicao_nome, paciente_nome);

CREATE INDEX idx_autorizacoes_assim_match ON public.autorizacoes_assim USING btree (matricula_limpa, codigo_tuss, data_execucao);

CREATE INDEX idx_autorizacoes_created_at_desc ON public.autorizacoes USING btree (created_at DESC);

CREATE INDEX idx_autorizacoes_data_atendimento ON public.autorizacoes USING btree (data_atendimento);

CREATE INDEX idx_autorizacoes_machine_id ON public.autorizacoes USING btree (machine_id);

CREATE INDEX idx_autorizacoes_status ON public.autorizacoes USING btree (status);

CREATE INDEX idx_autorizacoes_status_created_at ON public.autorizacoes USING btree (status, created_at);

CREATE INDEX idx_autorizacoes_status_machine ON public.autorizacoes USING btree (status, machine_id);

CREATE INDEX idx_autorizacoes_usuario_id ON public.autorizacoes USING btree (usuario_id);

CREATE INDEX idx_chamada_paciente_agenda ON public.chamada_paciente USING btree (agenda_id);

CREATE INDEX idx_chamada_paciente_data ON public.chamada_paciente USING btree (chamado_em DESC);

CREATE INDEX idx_chamada_paciente_unidade ON public.chamada_paciente USING btree (unidade);

CREATE INDEX idx_chamada_recent ON public.chamada_paciente USING btree (agenda_id, chamado_em DESC);

CREATE INDEX idx_controle_terapeutico_confirmado_em ON public.controle_terapeutico USING btree (confirmado_em);

CREATE INDEX idx_controle_terapeutico_status ON public.controle_terapeutico USING btree (status);

CREATE INDEX idx_controle_terapeutico_substituto ON public.controle_terapeutico USING btree (profissional_substituto_id);

CREATE INDEX idx_data_execucao ON public.autorizacoes_assim USING btree (data_execucao);

CREATE INDEX idx_disponibilidade_agenda ON public.controle_disponibilidade_terapeutas USING btree (agenda_id);

CREATE INDEX idx_disponibilidade_data ON public.controle_disponibilidade_terapeutas USING btree (data);

CREATE INDEX idx_disponibilidade_horario ON public.controle_disponibilidade_terapeutas USING btree (hora_inicial);

CREATE INDEX idx_disponibilidade_status ON public.controle_disponibilidade_terapeutas USING btree (status);

CREATE INDEX idx_disponibilidade_substituto ON public.controle_disponibilidade_terapeutas USING btree (substituto_id);

CREATE INDEX idx_disponibilidade_terapeuta ON public.controle_disponibilidade_terapeutas USING btree (terapeuta_id);

CREATE INDEX idx_disponibilidade_terapia ON public.controle_disponibilidade_terapeutas USING btree (terapia_id);

CREATE INDEX idx_fila_autorizacoes_lookup ON public.fila_autorizacoes USING btree (paciente_id, data_atendimento, horario, tuss, terapia_exibicao_id);

CREATE INDEX idx_fila_data ON public.fila_autorizacoes USING btree (data_atendimento);

CREATE INDEX idx_fila_operacional ON public.fila_autorizacoes USING btree (data_atendimento, matricula, dep, horario, status);

CREATE INDEX idx_fila_paciente ON public.fila_autorizacoes USING btree (paciente_id);

CREATE INDEX idx_fila_status ON public.fila_autorizacoes USING btree (status);

CREATE INDEX idx_grade_data ON public.grade_profissionais_tita USING btree (data);

CREATE INDEX idx_grade_profissional ON public.grade_profissionais_tita USING btree (profissional_id);

CREATE INDEX idx_grade_status ON public.grade_profissionais_tita USING btree (status_agendamento);

CREATE INDEX idx_grade_terapia ON public.grade_profissionais_tita USING btree (terapia_id);

CREATE INDEX idx_guia_terapias_guia_numero ON public.guia_terapias USING btree (guia_numero);

CREATE INDEX idx_guia_terapias_terapeuta_id ON public.guia_terapias USING btree (terapeuta_id);

CREATE INDEX idx_guias_processadas_guia_numero ON public.guias_processadas USING btree (guia_numero);

CREATE INDEX idx_logs_autorizacao_id_created_at_desc ON public.logs USING btree (autorizacao_id, created_at DESC);

CREATE INDEX idx_logs_created_at ON public.logs_execucao USING btree (created_at DESC);

CREATE INDEX idx_logs_fila_id ON public.fila_autorizacoes_logs USING btree (fila_id);

CREATE INDEX idx_logs_machine ON public.logs_execucao USING btree (machine_id);

CREATE INDEX idx_logs_user ON public.logs_execucao USING btree (user_id);

CREATE INDEX idx_maquinas_user_id ON public.maquinas USING btree (user_id);

CREATE INDEX idx_sessions_machine ON public.sessions USING btree (machine_id);

CREATE INDEX idx_sessions_user ON public.sessions USING btree (user_id);

CREATE INDEX idx_status ON public.autorizacoes_assim USING btree (status);

CREATE INDEX idx_status_tratado ON public.autorizacoes_assim USING btree (status_tratado);

CREATE INDEX idx_terapeuta_eventos_data ON public.terapeuta_eventos USING btree (data_evento);

CREATE INDEX idx_terapeuta_eventos_evento ON public.terapeuta_eventos USING btree (evento);

CREATE INDEX idx_terapeuta_eventos_terapeuta ON public.terapeuta_eventos USING btree (terapeuta);

CREATE INDEX idx_tita_grade_data ON public.tita_grade_profissionais USING btree (data_atendimento);

CREATE INDEX idx_tita_grade_status ON public.tita_grade_profissionais USING btree (status_agendamento);

CREATE INDEX idx_tita_grade_terapeuta ON public.tita_grade_profissionais USING btree (terapeuta_nome);

CREATE INDEX idx_worker_tokens_expires ON public.worker_tokens USING btree (expires_at);

CREATE INDEX idx_worker_tokens_user ON public.worker_tokens USING btree (user_id);

CREATE UNIQUE INDEX logs_execucao_pkey ON public.logs_execucao USING btree (id);

CREATE UNIQUE INDEX logs_pkey ON public.logs USING btree (id);

CREATE UNIQUE INDEX maquinas_pkey ON public.maquinas USING btree (id);

CREATE UNIQUE INDEX paciente_classificacao_paciente_id_key ON public.paciente_classificacao USING btree (paciente_id);

CREATE UNIQUE INDEX paciente_classificacao_pkey ON public.paciente_classificacao USING btree (id);

CREATE UNIQUE INDEX perfis_pkey ON public.perfis USING btree (id);

CREATE UNIQUE INDEX pre_auditoria_snapshot_pkey ON public.pre_auditoria_snapshot USING btree (id);

CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);

CREATE UNIQUE INDEX sync_controle_pkey ON public.sync_controle USING btree (id);

CREATE UNIQUE INDEX sync_status_pkey ON public.sync_status USING btree (id);

CREATE UNIQUE INDEX terapeuta_eventos_pkey ON public.terapeuta_eventos USING btree (id);

CREATE UNIQUE INDEX terapeutas_pkey ON public.terapeutas USING btree (id);

CREATE UNIQUE INDEX terapias_controle_pkey ON public.terapias_controle USING btree (terapia_id);

CREATE UNIQUE INDEX tita_grade_profissionais_pkey ON public.tita_grade_profissionais USING btree (id);

CREATE UNIQUE INDEX unique_agenda ON public.agenda_terapias USING btree (paciente_id, data_atendimento, horario);

CREATE UNIQUE INDEX unique_agenda_real ON public.agenda_orbita USING btree (paciente_id, data_atendimento, horario, terapia);

CREATE UNIQUE INDEX unique_agendamento ON public.autorizacoes USING btree (paciente_nome, data_atendimento, horario);

CREATE UNIQUE INDEX unique_fila_agendamento ON public.fila_autorizacoes USING btree (paciente_id, data_atendimento, horario);

CREATE UNIQUE INDEX unique_fila_execucao ON public.fila_autorizacoes USING btree (paciente_id, data_atendimento, horario) WHERE (status = ANY (ARRAY['pendente'::text, 'processando'::text]));

CREATE UNIQUE INDEX unique_user_machine ON public.maquinas USING btree (user_id);

CREATE UNIQUE INDEX uq_grade_profissionais_snapshot ON public.grade_profissionais_tita USING btree (grade_terapeuta_id, data, hora_inicial, hora_final, status_agendamento);

CREATE UNIQUE INDEX uq_grade_slot ON public.grade_profissionais_tita USING btree (grade_terapeuta_id, data, hora_inicial);

CREATE UNIQUE INDEX usuarios_email_key ON public.usuarios USING btree (email);

CREATE UNIQUE INDEX usuarios_pkey ON public.usuarios USING btree (id);

CREATE UNIQUE INDEX usuarios_username_key ON public.usuarios USING btree (username);

CREATE UNIQUE INDEX worker_tokens_pkey ON public.worker_tokens USING btree (token);

alter table "public"."agenda_orbita" add constraint "agenda_orbita_pkey" PRIMARY KEY using index "agenda_orbita_pkey";

alter table "public"."agenda_terapias" add constraint "agenda_terapias_pkey" PRIMARY KEY using index "agenda_terapias_pkey";

alter table "public"."agenda_tita" add constraint "agenda_tita_pkey" PRIMARY KEY using index "agenda_tita_pkey";

alter table "public"."autorizacoes" add constraint "autorizacoes_pkey" PRIMARY KEY using index "autorizacoes_pkey";

alter table "public"."autorizacoes_assim" add constraint "autorizacoes_assim_pkey" PRIMARY KEY using index "autorizacoes_assim_pkey";

alter table "public"."chamada_paciente" add constraint "chamada_paciente_pkey" PRIMARY KEY using index "chamada_paciente_pkey";

alter table "public"."controle_disponibilidade_terapeutas" add constraint "controle_disponibilidade_terapeutas_pkey" PRIMARY KEY using index "controle_disponibilidade_terapeutas_pkey";

alter table "public"."controle_terapeutico" add constraint "controle_terapeutico_pkey" PRIMARY KEY using index "controle_terapeutico_pkey";

alter table "public"."fila_autorizacoes" add constraint "fila_autorizacoes_pkey" PRIMARY KEY using index "fila_autorizacoes_pkey";

alter table "public"."fila_autorizacoes_logs" add constraint "fila_autorizacoes_logs_pkey" PRIMARY KEY using index "fila_autorizacoes_logs_pkey";

alter table "public"."grade_profissionais_tita" add constraint "grade_profissionais_tita_pkey" PRIMARY KEY using index "grade_profissionais_tita_pkey";

alter table "public"."guia_terapias" add constraint "guia_terapias_pkey" PRIMARY KEY using index "guia_terapias_pkey";

alter table "public"."guias_processadas" add constraint "guias_processadas_pkey" PRIMARY KEY using index "guias_processadas_pkey";

alter table "public"."logs" add constraint "logs_pkey" PRIMARY KEY using index "logs_pkey";

alter table "public"."logs_execucao" add constraint "logs_execucao_pkey" PRIMARY KEY using index "logs_execucao_pkey";

alter table "public"."maquinas" add constraint "maquinas_pkey" PRIMARY KEY using index "maquinas_pkey";

alter table "public"."paciente_classificacao" add constraint "paciente_classificacao_pkey" PRIMARY KEY using index "paciente_classificacao_pkey";

alter table "public"."perfis" add constraint "perfis_pkey" PRIMARY KEY using index "perfis_pkey";

alter table "public"."pre_auditoria_snapshot" add constraint "pre_auditoria_snapshot_pkey" PRIMARY KEY using index "pre_auditoria_snapshot_pkey";

alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY using index "sessions_pkey";

alter table "public"."sync_controle" add constraint "sync_controle_pkey" PRIMARY KEY using index "sync_controle_pkey";

alter table "public"."sync_status" add constraint "sync_status_pkey" PRIMARY KEY using index "sync_status_pkey";

alter table "public"."terapeuta_eventos" add constraint "terapeuta_eventos_pkey" PRIMARY KEY using index "terapeuta_eventos_pkey";

alter table "public"."terapeutas" add constraint "terapeutas_pkey" PRIMARY KEY using index "terapeutas_pkey";

alter table "public"."terapias_controle" add constraint "terapias_controle_pkey" PRIMARY KEY using index "terapias_controle_pkey";

alter table "public"."tita_grade_profissionais" add constraint "tita_grade_profissionais_pkey" PRIMARY KEY using index "tita_grade_profissionais_pkey";

alter table "public"."usuarios" add constraint "usuarios_pkey" PRIMARY KEY using index "usuarios_pkey";

alter table "public"."worker_tokens" add constraint "worker_tokens_pkey" PRIMARY KEY using index "worker_tokens_pkey";

alter table "public"."agenda_orbita" add constraint "agenda_orbita_unique" UNIQUE using index "agenda_orbita_unique";

alter table "public"."agenda_orbita" add constraint "unique_agenda_real" UNIQUE using index "unique_agenda_real";

alter table "public"."autorizacoes" add constraint "autorizacoes_machine_id_fkey" FOREIGN KEY (machine_id) REFERENCES public.maquinas(id) not valid;

alter table "public"."autorizacoes" validate constraint "autorizacoes_machine_id_fkey";

alter table "public"."autorizacoes" add constraint "autorizacoes_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'executando'::text, 'concluido'::text, 'erro'::text]))) not valid;

alter table "public"."autorizacoes" validate constraint "autorizacoes_status_check";

alter table "public"."autorizacoes" add constraint "autorizacoes_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES auth.users(id) not valid;

alter table "public"."autorizacoes" validate constraint "autorizacoes_usuario_id_fkey";

alter table "public"."autorizacoes" add constraint "unique_agendamento" UNIQUE using index "unique_agendamento";

alter table "public"."autorizacoes_assim" add constraint "autorizacoes_assim_guia_key" UNIQUE using index "autorizacoes_assim_guia_key";

alter table "public"."controle_disponibilidade_terapeutas" add constraint "controle_disponibilidade_terapeutas_status_check" CHECK ((status = ANY (ARRAY['disponivel'::text, 'indisponivel'::text]))) not valid;

alter table "public"."controle_disponibilidade_terapeutas" validate constraint "controle_disponibilidade_terapeutas_status_check";

alter table "public"."controle_disponibilidade_terapeutas" add constraint "disponibilidade_terapeuta_horario_unico" UNIQUE using index "disponibilidade_terapeuta_horario_unico";

alter table "public"."controle_terapeutico" add constraint "controle_terapeutico_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'presente'::text, 'faltou'::text, 'disponivel'::text, 'indisponivel'::text, 'cobertura_planejada'::text, 'cobertura_confirmada'::text]))) not valid;

alter table "public"."controle_terapeutico" validate constraint "controle_terapeutico_status_check";

alter table "public"."controle_terapeutico" add constraint "controle_terapeutico_tita_agendamento_id_key" UNIQUE using index "controle_terapeutico_tita_agendamento_id_key";

alter table "public"."fila_autorizacoes" add constraint "chk_status" CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'executando'::text, 'concluido'::text, 'erro'::text, 'falta'::text]))) not valid;

alter table "public"."fila_autorizacoes" validate constraint "chk_status";

alter table "public"."fila_autorizacoes" add constraint "fila_autorizacoes_unique" UNIQUE using index "fila_autorizacoes_unique";

alter table "public"."fila_autorizacoes" add constraint "unique_fila_agendamento" UNIQUE using index "unique_fila_agendamento";

alter table "public"."grade_profissionais_tita" add constraint "uq_grade_profissionais_snapshot" UNIQUE using index "uq_grade_profissionais_snapshot";

alter table "public"."guia_terapias" add constraint "guia_terapias_terapeuta_id_fkey" FOREIGN KEY (terapeuta_id) REFERENCES public.terapeutas(id) not valid;

alter table "public"."guia_terapias" validate constraint "guia_terapias_terapeuta_id_fkey";

alter table "public"."logs" add constraint "logs_autorizacao_id_fkey" FOREIGN KEY (autorizacao_id) REFERENCES public.autorizacoes(id) ON DELETE CASCADE not valid;

alter table "public"."logs" validate constraint "logs_autorizacao_id_fkey";

alter table "public"."logs" add constraint "logs_nivel_check" CHECK ((nivel = ANY (ARRAY['info'::text, 'warning'::text, 'error'::text]))) not valid;

alter table "public"."logs" validate constraint "logs_nivel_check";

alter table "public"."logs_execucao" add constraint "logs_execucao_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL not valid;

alter table "public"."logs_execucao" validate constraint "logs_execucao_session_id_fkey";

alter table "public"."logs_execucao" add constraint "logs_execucao_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."logs_execucao" validate constraint "logs_execucao_user_id_fkey";

alter table "public"."paciente_classificacao" add constraint "paciente_classificacao_paciente_id_key" UNIQUE using index "paciente_classificacao_paciente_id_key";

alter table "public"."perfis" add constraint "perfis_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) not valid;

alter table "public"."perfis" validate constraint "perfis_id_fkey";

alter table "public"."sessions" add constraint "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."sessions" validate constraint "sessions_user_id_fkey";

alter table "public"."usuarios" add constraint "usuarios_email_key" UNIQUE using index "usuarios_email_key";

alter table "public"."usuarios" add constraint "usuarios_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."usuarios" validate constraint "usuarios_id_fkey";

alter table "public"."usuarios" add constraint "usuarios_username_key" UNIQUE using index "usuarios_username_key";

alter table "public"."worker_tokens" add constraint "worker_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."worker_tokens" validate constraint "worker_tokens_user_id_fkey";

set check_function_bodies = off;

create or replace view "public"."agenda_classificada" as  SELECT id,
    paciente_id,
    paciente_nome,
    matricula,
    empresa,
    dep,
    data_atendimento,
    horario,
    terapia,
    tuss,
    crm,
    nome_medico,
    created_at,
    updated_at,
    ativo,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.fila_autorizacoes f
              WHERE ((f.matricula = a.matricula) AND (f.data_atendimento = a.data_atendimento) AND (f.tuss = a.tuss)))) THEN 'robo'::text
            WHEN (EXISTS ( SELECT 1
               FROM public.autorizacoes_assim aa
              WHERE ((aa.matricula_limpa = a.matricula) AND ((aa.data_execucao)::date = a.data_atendimento) AND (aa.codigo_tuss = a.tuss) AND (abs((EXTRACT(epoch FROM ((aa.data_execucao)::time without time zone - a.horario)) / (60)::numeric)) <= (20)::numeric)))) THEN 'manual'::text
            ELSE 'pendente'::text
        END AS status
   FROM public.agenda_orbita a;


create or replace view "public"."agenda_tita_autorizacao" as  SELECT a.id,
    a.tita_agendamento_id,
    a.origem,
    a.data_atendimento,
    a.hora_inicial,
    a.hora_final,
    a.paciente_id,
    a.paciente_nome,
    a.cpf,
    a.data_nascimento,
    a.profissional_id,
    a.profissional_nome,
    a.profissional_cpf,
    a.terapia_id,
    a.terapia_nome,
    a.terapia_exibicao_id,
    a.terapia_exibicao_nome,
    a.sala_id,
    a.sala_nome,
    a.sala_observacoes,
    a.clinica_id,
    a.clinica_nome,
    a.convenio_id,
    a.convenio_nome,
    a.numero_carteirinha,
    a.responsavel_nome,
    a.responsavel_telefone,
    a.responsavel_email,
    a.atividade,
    a.ativo,
    a.raw_json,
    a.created_at,
    a.updated_at,
    "substring"(a.numero_carteirinha, 1, 6) AS empresa,
    "substring"(a.numero_carteirinha, 7, 7) AS matricula,
    "right"(regexp_replace(a.numero_carteirinha, '\D'::text, ''::text, 'g'::text), 2) AS dep,
    ao.crm,
    upper(replace(translate(COALESCE(ao.nome_medico, ''::text), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç.'::text, 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc '::text), '.'::text, ''::text)) AS nome_medico,
        CASE
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text])) THEN '22070384'::text
            WHEN (a.terapia_exibicao_nome = 'Fonoaudiologia'::text) THEN '22070397'::text
            WHEN (a.terapia_exibicao_nome = 'Psicomotricidade'::text) THEN '22070400'::text
            WHEN (a.terapia_exibicao_nome = 'Fisioterapia'::text) THEN '22070419'::text
            WHEN (a.terapia_exibicao_nome = 'Terapia Ocupacional'::text) THEN '22070427'::text
            WHEN (a.terapia_exibicao_nome = 'Psicopedagogia'::text) THEN '22070435'::text
            WHEN (a.terapia_exibicao_nome = 'Musicoterapia'::text) THEN '22070451'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text, 'Terapia Alimentar'::text])) THEN '22070460'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text, 'Fisioterapia Aquática'::text])) THEN '22070265'::text
            WHEN (a.terapia_exibicao_nome = 'Equoterapia'::text) THEN '22070257'::text
            ELSE NULL::text
        END AS codigo_tuss
   FROM (public.agenda_tita a
     LEFT JOIN LATERAL ( SELECT o.crm,
            o.nome_medico
           FROM public.agenda_orbita o
          WHERE (o.paciente_nome = a.paciente_nome)
         LIMIT 1) ao ON (true))
  WHERE ((a.paciente_nome <> ALL (ARRAY['Horário Administrativo'::text, 'Notificação Prévia'::text])) AND (
        CASE
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Psicologia'::text, 'Psicologia ABA'::text, 'Arteterapia'::text, 'Arteterapia (Psicologia ABA)'::text])) THEN '22070384'::text
            WHEN (a.terapia_exibicao_nome = 'Fonoaudiologia'::text) THEN '22070397'::text
            WHEN (a.terapia_exibicao_nome = 'Psicomotricidade'::text) THEN '22070400'::text
            WHEN (a.terapia_exibicao_nome = 'Fisioterapia'::text) THEN '22070419'::text
            WHEN (a.terapia_exibicao_nome = 'Terapia Ocupacional'::text) THEN '22070427'::text
            WHEN (a.terapia_exibicao_nome = 'Psicopedagogia'::text) THEN '22070435'::text
            WHEN (a.terapia_exibicao_nome = 'Musicoterapia'::text) THEN '22070451'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Nutrição'::text, 'Terapia Alimentar'::text])) THEN '22070460'::text
            WHEN (a.terapia_exibicao_nome = ANY (ARRAY['Hidroterapia'::text, 'Fisioterapia Aquática'::text])) THEN '22070265'::text
            WHEN (a.terapia_exibicao_nome = 'Equoterapia'::text) THEN '22070257'::text
            ELSE NULL::text
        END IS NOT NULL));


CREATE OR REPLACE FUNCTION public.ajustar_crm_fila()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.crm IS NOT NULL THEN
    NEW.crm := REGEXP_REPLACE(NEW.crm, '[^0-9]', '', 'g');
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ajustar_matricula_fila()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.matricula IS NOT NULL THEN
    NEW.matricula := LEFT(NEW.matricula, 7);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.atualizar_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_worker_token()
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  new_token uuid;
begin
  new_token := gen_random_uuid();

  insert into public.worker_tokens (token, user_id, expires_at)
  values (
    new_token,
    auth.uid(),
    now() + interval '2 minutes'
  );

  return new_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.usuarios (
    id,
    nome,
    email
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', ''),
    new.email
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inserir_na_fila_autorizacoes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin

  -- só entra se for manual e tiver dados essenciais
  if new.status = 'manual'
     and new.matricula is not null
     and new.tuss is not null then

    insert into fila_autorizacoes (
      agenda_id,
      paciente_nome,
      matricula,
      data_atendimento,
      horario,
      status,
      empresa,
      dep,
      crm,
      nome_medico,
      tuss,
      machine_id,
      created_at
    )
    values (
      new.id,
      new.paciente_nome,
      new.matricula,
      new.data_atendimento,
      new.horario,
      'concluido',
      new.empresa,
      new.dep,
      new.crm,
      new.nome_medico,
      new.tuss,
      'manual_trigger',
      now()
    )
    on conflict do nothing;

  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.preencher_paciente_assim()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin

  -- 🔥 SEMPRE sobrescreve, não importa o que veio
  new.matricula_limpa := 
    case 
      when new.matricula like '%.%.%' 
        then split_part(new.matricula, '.', 2)
      else regexp_replace(new.matricula, '\D', '', 'g')
    end;

  -- 🔥 SEMPRE recalcula paciente_id
  select ao.paciente_id::bigint
  into new.paciente_id
  from agenda_orbita ao
  where ao.matricula = new.matricula_limpa
  limit 1;

  return new;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_horarios_disponiveis(p_data date, p_unidade text)
 RETURNS TABLE(hora time without time zone)
 LANGUAGE sql
AS $function$

    select distinct
        hora_inicial as hora

    from vw_central_terapeutica

    where
        data_atendimento = p_data
        and unidade = p_unidade

    order by hora_inicial;

$function$
;

CREATE OR REPLACE FUNCTION public.set_data_atualizacao()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.data_atualizacao = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_assim_results()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN

  UPDATE fila_autorizacoes fa
  SET
    status_assim = vm.status_assim,
    numero_autorizacao = vm.guia,
    horario_autorizacao = vm.data_execucao,
    error_message = CASE
      WHEN vm.status_assim ILIKE '%REINCIDENCIA%'
        THEN vm.status_assim
      WHEN vm.status_assim ILIKE '%ERRO%'
        THEN vm.status_assim
      ELSE NULL
    END,
    assim_updated_at = NOW()
  FROM vw_match_autorizacoes_assim vm
  WHERE fa.paciente_id::bigint = vm.paciente_id
    AND fa.data_atendimento = vm.data_atendimento
    AND fa.horario = vm.hora_inicial;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN

  UPDATE public.profiles
  SET ativo = NEW.email_confirmed_at IS NOT NULL
  WHERE id = NEW.id;

  RETURN NEW;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_log_fila_autorizacoes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$

declare

  descricao_evento text;

begin

  -- ============================================
  -- INSERT
  -- ============================================

  if tg_op = 'INSERT' then

    descricao_evento :=

      case

        when new.status = 'pendente'
          then 'Solicitação criada'

        when new.status = 'processando'
          then 'Processamento iniciado'

        when new.status = 'concluido'
          then 'Autorização concluída'

        when new.status = 'falta'
          then 'Falta registrada'

        when new.status = 'erro'
          then 'Erro operacional'

        else
          'Registro criado'

      end;

    insert into fila_autorizacoes_logs (

      fila_id,
      status,
      descricao,
      machine_id,
      horario_autorizacao,
      numero_autorizacao,
      metadata

    )

    values (

      new.id,
      new.status,
      descricao_evento,
      new.machine_id,
      new.horario_autorizacao,
      new.numero_autorizacao,

      jsonb_build_object(

        'completion_type',
        new.completion_type,

        'tipo_falta',
        new.tipo_falta,

        'numero_autorizacao',
        new.numero_autorizacao

      )

    );

    return new;

  end if;

  -- ============================================
  -- UPDATE
  -- ============================================

  if tg_op = 'UPDATE' then

    if

      old.status is not distinct from new.status

      and old.numero_autorizacao
      is not distinct from
      new.numero_autorizacao

      and old.tipo_falta
      is not distinct from
      new.tipo_falta

      and old.completion_type
      is not distinct from
      new.completion_type

    then
      return new;
    end if;

    descricao_evento :=

      case

        when new.status = 'pendente'
          then 'Autorização reenviada'

        when new.status = 'processando'
          then 'Worker iniciou processamento'

        when new.status = 'concluido'
          then 'Autorização concluída'

        when new.status = 'erro'
          then 'Erro operacional'

        when new.status = 'falta'

          then

            case

              when new.tipo_falta = 'terapeuta'
                then 'Falta do terapeuta'

              when new.tipo_falta = 'paciente'
                then 'Falta do paciente'

              else 'Falta registrada'

            end

        else

          concat(
            'Status alterado para ',
            coalesce(new.status, 'desconhecido')
          )

      end;

    insert into fila_autorizacoes_logs (

      fila_id,
      status,
      descricao,
      machine_id,
      horario_autorizacao,
      numero_autorizacao,
      metadata

    )

    values (

      new.id,
      new.status,
      descricao_evento,
      new.machine_id,
      new.horario_autorizacao,
      new.numero_autorizacao,

      jsonb_build_object(

        'status_anterior',
        old.status,

        'status_novo',
        new.status,

        'completion_type',
        new.completion_type,

        'tipo_falta',
        new.tipo_falta,

        'numero_autorizacao',
        new.numero_autorizacao

      )

    );

    return new;

  end if;

  return new;

end;

$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_controle_disponibilidade()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$
;

create or replace view "public"."vw_central_pacientes" as  SELECT DISTINCT ON (fa.id) fa.id,
    fa.agenda_id,
    fa.paciente_id,
    fa.paciente_nome,
    fa.data_atendimento,
    fa.horario,
    ((((fa.data_atendimento)::text || ' '::text) || (fa.horario)::text))::timestamp without time zone AS data_horario,
    fa.status,
    fa.status_assim,
    fa.tipo_falta,
    fa.completion_type,
    fa.numero_autorizacao,
    fa.machine_id,
    fa.error_message,
    fa.execution_time_ms,
    fa.created_at,
    fa.updated_at,
    fa.assim_updated_at,
    fa.horario_autorizacao,
    fa.terapia_exibicao_id,
    fa.terapia_nome AS classificacao_terapia,
    ag.hora_inicial,
    ag.hora_final,
    ag.profissional_nome,
    ag.profissional_id,
    ag.terapia_nome,
    ag.terapia_exibicao_nome,
    ag.sala_nome,
    ag.clinica_nome,
    ag.convenio_nome,
    ag.responsavel_nome,
    ag.responsavel_telefone,
    ag.numero_carteirinha,
    ag.sala_nome AS unidade,
    ag.convenio_nome AS convenio,
    maq.nome AS usuario_nome,
        CASE
            WHEN (fa.status = 'erro'::text) THEN 'erro'::text
            WHEN (fa.status = 'processando'::text) THEN 'processando'::text
            WHEN (fa.tipo_falta = 'terapeuta'::text) THEN 'falta_terapeuta'::text
            WHEN (fa.tipo_falta = 'paciente'::text) THEN 'falta_paciente'::text
            WHEN (fa.status_assim = 'autorizado'::text) THEN 'autorizado'::text
            WHEN (fa.status = 'concluido'::text) THEN 'autorizado'::text
            WHEN (fa.status = 'pendente'::text) THEN 'pendente'::text
            ELSE COALESCE(fa.status, 'pendente'::text)
        END AS status_operacional
   FROM ((public.fila_autorizacoes fa
     LEFT JOIN public.maquinas maq ON ((maq.id = fa.machine_id)))
     LEFT JOIN public.agenda_tita_autorizacao ag ON ((((fa.paciente_id)::bigint = ag.paciente_id) AND (fa.data_atendimento = ag.data_atendimento) AND (fa.horario = ag.hora_inicial) AND (lower(TRIM(BOTH FROM COALESCE(fa.terapia_nome, ''::text))) = lower(TRIM(BOTH FROM COALESCE(ag.terapia_nome, ''::text)))))))
  WHERE ((fa.id IS NOT NULL) AND ((fa.status IS NOT NULL) OR (fa.status_assim IS NOT NULL) OR (fa.numero_autorizacao IS NOT NULL) OR (fa.tipo_falta IS NOT NULL)))
  ORDER BY fa.id, fa.created_at DESC NULLS LAST, ag.updated_at DESC NULLS LAST, ag.created_at DESC NULLS LAST;


create or replace view "public"."vw_central_terapeutica" as  SELECT a.tita_agendamento_id,
    a.data_atendimento,
    a.hora_inicial,
    a.hora_final,
    a.paciente_id,
    a.paciente_nome,
    a.profissional_id,
    a.profissional_nome,
    a.terapia_id,
    a.terapia_nome,
    a.sala_id,
    a.sala_nome,
        CASE
            WHEN (a.sala_nome ~~* '%Realengo%'::text) THEN 'Realengo'::text
            WHEN (a.sala_nome ~~* '%Fazendinha%'::text) THEN 'Fazendinha'::text
            WHEN (a.sala_nome ~~* '%Padre Miguel%'::text) THEN 'Padre Miguel'::text
            ELSE 'Outros'::text
        END AS unidade,
    regexp_replace(a.sala_nome, '^Unid\.\s(Realengo|Fazendinha|Padre Miguel)\s-\s'::text, ''::text) AS sala_operacional,
    a.clinica_id,
    a.clinica_nome,
    a.convenio_nome,
    COALESCE(ct.status, 'pendente'::text) AS status,
    ct.profissional_substituto_id,
    sub.profissional_nome AS profissional_substituto_nome,
    ct.observacao,
    ct.confirmado_por,
    ct.confirmado_em,
    ct.created_at AS controle_created_at,
    ct.updated_at AS controle_updated_at
   FROM (((public.agenda_tita a
     JOIN public.terapias_controle tc ON (((tc.terapia_id = a.terapia_id) AND (tc.ativo = true))))
     LEFT JOIN public.controle_terapeutico ct ON ((ct.tita_agendamento_id = a.tita_agendamento_id)))
     LEFT JOIN ( SELECT DISTINCT agenda_tita.profissional_id,
            agenda_tita.profissional_nome
           FROM public.agenda_tita) sub ON ((sub.profissional_id = ct.profissional_substituto_id)));


create or replace view "public"."vw_match_autorizacoes_assim" as  WITH blocos_operacionais AS (
         SELECT ag.paciente_id,
            ag.paciente_nome,
            ag.cpf,
            ag.data_nascimento,
            ag.data_atendimento,
            ag.hora_inicial,
            ag.codigo_tuss,
            ag.matricula,
            ag.dep,
            min(ag.tita_agendamento_id) AS tita_agendamento_id,
            array_agg(DISTINCT ag.terapia_nome) AS terapias,
            row_number() OVER (PARTITION BY ag.matricula, ag.dep, ag.data_atendimento, ag.codigo_tuss ORDER BY ag.hora_inicial) AS ordem_consumo
           FROM public.agenda_tita_autorizacao ag
          WHERE ((ag.data_atendimento = (timezone('America/Sao_Paulo'::text, now()))::date) AND (lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text, 'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text, 'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text, 'técnico terapêutico particular'::text, 'triagem'::text])) AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text) AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text))
          GROUP BY ag.paciente_id, ag.paciente_nome, ag.cpf, ag.data_nascimento, ag.data_atendimento, ag.hora_inicial, ag.codigo_tuss, ag.matricula, ag.dep
        ), consumos_falta AS (
         SELECT DISTINCT bo.matricula,
            bo.dep,
            bo.data_atendimento,
            bo.codigo_tuss,
            bo.ordem_consumo
           FROM (blocos_operacionais bo
             JOIN public.fila_autorizacoes fa ON (((fa.matricula = bo.matricula) AND (COALESCE(fa.dep, ''::text) = COALESCE(bo.dep, ''::text)) AND (fa.data_atendimento = bo.data_atendimento) AND (fa.horario = bo.hora_inicial) AND (fa.status = 'falta'::text))))
        ), autorizacoes_numeradas AS (
         SELECT aa.guia,
            aa.paciente_id,
            aa.paciente_nome,
            aa.matricula_limpa AS matricula,
            "right"(aa.matricula, 2) AS dep,
            aa.codigo_tuss,
            aa.status AS status_assim,
            aa.data_execucao,
            date(aa.data_execucao) AS data_atendimento,
            row_number() OVER (PARTITION BY aa.matricula_limpa, ("right"(aa.matricula, 2)), (date(aa.data_execucao)), aa.codigo_tuss ORDER BY aa.data_execucao) AS ordem_autorizacao
           FROM public.autorizacoes_assim aa
          WHERE (date(aa.data_execucao) = (timezone('America/Sao_Paulo'::text, now()))::date)
        ), matches_externos AS (
         SELECT bo.tita_agendamento_id,
            bo.paciente_id,
            bo.paciente_nome,
            bo.cpf,
            bo.data_nascimento,
            bo.data_atendimento,
            bo.hora_inicial,
            bo.codigo_tuss,
            an.guia,
            an.data_execucao,
            an.status_assim,
            true AS consome_autorizacao,
            bo.ordem_consumo,
            an.ordem_autorizacao
           FROM (blocos_operacionais bo
             JOIN autorizacoes_numeradas an ON (((an.matricula = bo.matricula) AND (COALESCE(an.dep, ''::text) = COALESCE(bo.dep, ''::text)) AND (an.data_atendimento = bo.data_atendimento) AND (an.codigo_tuss = bo.codigo_tuss) AND (an.ordem_autorizacao = bo.ordem_consumo))))
        ), matches_falta AS (
         SELECT bo.tita_agendamento_id,
            bo.paciente_id,
            bo.paciente_nome,
            bo.cpf,
            bo.data_nascimento,
            bo.data_atendimento,
            bo.hora_inicial,
            bo.codigo_tuss,
            NULL::text AS guia,
            NULL::timestamp without time zone AS data_execucao,
            'falta'::text AS status_assim,
            true AS consome_autorizacao,
            bo.ordem_consumo,
            NULL::bigint AS ordem_autorizacao
           FROM (blocos_operacionais bo
             JOIN consumos_falta cf ON (((cf.matricula = bo.matricula) AND (COALESCE(cf.dep, ''::text) = COALESCE(bo.dep, ''::text)) AND (cf.data_atendimento = bo.data_atendimento) AND (cf.codigo_tuss = bo.codigo_tuss) AND (cf.ordem_consumo = bo.ordem_consumo))))
        )
 SELECT matches_externos.tita_agendamento_id,
    matches_externos.paciente_id,
    matches_externos.paciente_nome,
    matches_externos.cpf,
    matches_externos.data_nascimento,
    matches_externos.data_atendimento,
    matches_externos.hora_inicial,
    matches_externos.codigo_tuss,
    matches_externos.guia,
    matches_externos.data_execucao,
    matches_externos.status_assim,
    matches_externos.consome_autorizacao,
    matches_externos.ordem_consumo,
    matches_externos.ordem_autorizacao
   FROM matches_externos
UNION ALL
 SELECT matches_falta.tita_agendamento_id,
    matches_falta.paciente_id,
    matches_falta.paciente_nome,
    matches_falta.cpf,
    matches_falta.data_nascimento,
    matches_falta.data_atendimento,
    matches_falta.hora_inicial,
    matches_falta.codigo_tuss,
    matches_falta.guia,
    matches_falta.data_execucao,
    matches_falta.status_assim,
    matches_falta.consome_autorizacao,
    matches_falta.ordem_consumo,
    matches_falta.ordem_autorizacao
   FROM matches_falta;


create or replace view "public"."vw_profissionais_disponiveis" as  SELECT id,
    grade_terapeuta_id,
    grade_clinica_id,
    profissional_id,
    nome_profissional,
    cpf_profissional,
    numero_telefone,
    cbo_profissional,
    registro_profissional,
    tipo_registro_profissional,
    uf_registro_profissional,
    id_unidade,
    nome_unidade,
    dia_semana,
    data,
    hora_inicial,
    hora_final,
    status_agendamento,
    terapia_id,
    nome_terapia,
    terapia_exibicao_id,
    terapia_exibicao,
    id_sala,
    sala,
    observacoes_sala,
    raw_json,
    created_at,
    updated_at
   FROM public.grade_profissionais_tita
  WHERE ((status_agendamento = 'Livre'::text) AND (id_unidade = 280));


create or replace view "public"."vw_central_autorizacoes" as  WITH base AS (
         SELECT ag.paciente_id,
            ag.paciente_nome,
            ag.cpf,
            ag.data_nascimento,
            ag.data_atendimento,
            ag.hora_inicial AS horario,
            array_agg(DISTINCT ag.terapia_nome) AS terapias,
            array_agg(DISTINCT ag.sala_nome) AS sala_nome,
            array_agg(DISTINCT ag.profissional_nome) AS profissionais,
            array_agg(DISTINCT ag.codigo_tuss) AS codigos_tuss,
            array_agg(DISTINCT (ag.tita_agendamento_id)::text) AS agendamentos,
            ag.convenio_nome,
            ag.convenio_id,
            ag.empresa,
            ag.matricula,
            ag.dep,
            ag.crm,
            ag.nome_medico
           FROM public.agenda_tita_autorizacao ag
          WHERE ((lower(COALESCE(ag.terapia_nome, ''::text)) <> ALL (ARRAY['aplicador aba escola'::text, 'aplicador aba casa'::text, 'aplicador suporte'::text, 'apoio operacional'::text, 'especialista técnico de área'::text, 'estágio'::text, 'facilitador técnico'::text, 'operações clínicas'::text, 'supervisão aba'::text, 'técnico terapêutico particular'::text, 'triagem'::text])) AND (lower(COALESCE(ag.paciente_nome, ''::text)) <> 'horário bloqueado'::text) AND (lower(COALESCE(ag.sala_nome, ''::text)) !~~ '%sala teste%'::text))
          GROUP BY ag.paciente_id, ag.paciente_nome, ag.cpf, ag.data_nascimento, ag.data_atendimento, ag.hora_inicial, ag.convenio_nome, ag.convenio_id, ag.empresa, ag.matricula, ag.dep, ag.crm, ag.nome_medico
        ), match_assim AS (
         SELECT DISTINCT vw_match_autorizacoes_assim.paciente_id,
            vw_match_autorizacoes_assim.data_atendimento,
            vw_match_autorizacoes_assim.hora_inicial AS horario,
            vw_match_autorizacoes_assim.status_assim,
            vw_match_autorizacoes_assim.data_execucao
           FROM public.vw_match_autorizacoes_assim
        ), ultima_fila AS (
         SELECT DISTINCT ON (fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario) fila_autorizacoes.paciente_id,
            fila_autorizacoes.data_atendimento,
            fila_autorizacoes.horario,
            fila_autorizacoes.status,
            fila_autorizacoes.horario_autorizacao,
            fila_autorizacoes.created_at
           FROM public.fila_autorizacoes
          ORDER BY fila_autorizacoes.paciente_id, fila_autorizacoes.data_atendimento, fila_autorizacoes.horario, fila_autorizacoes.created_at DESC
        )
 SELECT b.paciente_id,
    b.paciente_nome,
    b.cpf,
    b.data_nascimento,
    b.data_atendimento,
    b.horario,
    b.terapias,
    b.sala_nome,
    b.profissionais,
    b.codigos_tuss,
    b.agendamentos,
    b.convenio_nome,
    b.convenio_id,
    b.empresa,
    b.matricula,
    b.dep,
    b.crm,
    b.nome_medico,
    uf.horario_autorizacao,
    ( SELECT max(ma2.data_execucao) AS max
           FROM match_assim ma2
          WHERE ((ma2.paciente_id = b.paciente_id) AND (ma2.data_atendimento = b.data_atendimento) AND (ma2.horario < b.horario))) AS ultima_autorizacao_anterior,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN 'autorizado_externo'::text
            WHEN (uf.status = 'concluido'::text) THEN 'concluido'::text
            WHEN (uf.status = 'falta'::text) THEN 'falta'::text
            WHEN (uf.status = 'processando'::text) THEN 'processando'::text
            WHEN (uf.status = 'pendente'::text) THEN 'pendente'::text
            WHEN (uf.status = 'erro'::text) THEN 'erro'::text
            ELSE 'sem_acao'::text
        END AS status_final,
        CASE
            WHEN (ma.paciente_id IS NOT NULL) THEN false
            WHEN (uf.status = ANY (ARRAY['concluido'::text, 'falta'::text])) THEN false
            ELSE true
        END AS mostrar_na_tela,
        CASE
            WHEN (lower(COALESCE(b.convenio_nome, ''::text)) ~~ '%assim%'::text) THEN 'autorizacao'::text
            ELSE 'presenca'::text
        END AS tipo_fluxo
   FROM ((base b
     LEFT JOIN match_assim ma ON (((ma.paciente_id = b.paciente_id) AND (ma.data_atendimento = b.data_atendimento) AND (ma.horario = b.horario))))
     LEFT JOIN ultima_fila uf ON ((((uf.paciente_id)::bigint = b.paciente_id) AND (uf.data_atendimento = b.data_atendimento) AND (uf.horario = b.horario))));


grant delete on table "public"."agenda_orbita" to "anon";

grant insert on table "public"."agenda_orbita" to "anon";

grant references on table "public"."agenda_orbita" to "anon";

grant select on table "public"."agenda_orbita" to "anon";

grant trigger on table "public"."agenda_orbita" to "anon";

grant truncate on table "public"."agenda_orbita" to "anon";

grant update on table "public"."agenda_orbita" to "anon";

grant delete on table "public"."agenda_orbita" to "authenticated";

grant insert on table "public"."agenda_orbita" to "authenticated";

grant references on table "public"."agenda_orbita" to "authenticated";

grant select on table "public"."agenda_orbita" to "authenticated";

grant trigger on table "public"."agenda_orbita" to "authenticated";

grant truncate on table "public"."agenda_orbita" to "authenticated";

grant update on table "public"."agenda_orbita" to "authenticated";

grant delete on table "public"."agenda_orbita" to "service_role";

grant insert on table "public"."agenda_orbita" to "service_role";

grant references on table "public"."agenda_orbita" to "service_role";

grant select on table "public"."agenda_orbita" to "service_role";

grant trigger on table "public"."agenda_orbita" to "service_role";

grant truncate on table "public"."agenda_orbita" to "service_role";

grant update on table "public"."agenda_orbita" to "service_role";

grant delete on table "public"."agenda_terapias" to "anon";

grant insert on table "public"."agenda_terapias" to "anon";

grant references on table "public"."agenda_terapias" to "anon";

grant select on table "public"."agenda_terapias" to "anon";

grant trigger on table "public"."agenda_terapias" to "anon";

grant truncate on table "public"."agenda_terapias" to "anon";

grant update on table "public"."agenda_terapias" to "anon";

grant delete on table "public"."agenda_terapias" to "authenticated";

grant insert on table "public"."agenda_terapias" to "authenticated";

grant references on table "public"."agenda_terapias" to "authenticated";

grant select on table "public"."agenda_terapias" to "authenticated";

grant trigger on table "public"."agenda_terapias" to "authenticated";

grant truncate on table "public"."agenda_terapias" to "authenticated";

grant update on table "public"."agenda_terapias" to "authenticated";

grant delete on table "public"."agenda_terapias" to "service_role";

grant insert on table "public"."agenda_terapias" to "service_role";

grant references on table "public"."agenda_terapias" to "service_role";

grant select on table "public"."agenda_terapias" to "service_role";

grant trigger on table "public"."agenda_terapias" to "service_role";

grant truncate on table "public"."agenda_terapias" to "service_role";

grant update on table "public"."agenda_terapias" to "service_role";

grant delete on table "public"."agenda_tita" to "anon";

grant insert on table "public"."agenda_tita" to "anon";

grant references on table "public"."agenda_tita" to "anon";

grant select on table "public"."agenda_tita" to "anon";

grant trigger on table "public"."agenda_tita" to "anon";

grant truncate on table "public"."agenda_tita" to "anon";

grant update on table "public"."agenda_tita" to "anon";

grant delete on table "public"."agenda_tita" to "authenticated";

grant insert on table "public"."agenda_tita" to "authenticated";

grant references on table "public"."agenda_tita" to "authenticated";

grant select on table "public"."agenda_tita" to "authenticated";

grant trigger on table "public"."agenda_tita" to "authenticated";

grant truncate on table "public"."agenda_tita" to "authenticated";

grant update on table "public"."agenda_tita" to "authenticated";

grant delete on table "public"."agenda_tita" to "service_role";

grant insert on table "public"."agenda_tita" to "service_role";

grant references on table "public"."agenda_tita" to "service_role";

grant select on table "public"."agenda_tita" to "service_role";

grant trigger on table "public"."agenda_tita" to "service_role";

grant truncate on table "public"."agenda_tita" to "service_role";

grant update on table "public"."agenda_tita" to "service_role";

grant delete on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant insert on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant references on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant select on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant trigger on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant truncate on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant update on table "public"."agenda_tita_autorizacao_backup_20260508" to "anon";

grant delete on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant insert on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant references on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant select on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant trigger on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant truncate on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant update on table "public"."agenda_tita_autorizacao_backup_20260508" to "authenticated";

grant delete on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant insert on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant references on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant select on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant trigger on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant truncate on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant update on table "public"."agenda_tita_autorizacao_backup_20260508" to "service_role";

grant delete on table "public"."autorizacoes" to "anon";

grant insert on table "public"."autorizacoes" to "anon";

grant references on table "public"."autorizacoes" to "anon";

grant select on table "public"."autorizacoes" to "anon";

grant trigger on table "public"."autorizacoes" to "anon";

grant truncate on table "public"."autorizacoes" to "anon";

grant update on table "public"."autorizacoes" to "anon";

grant delete on table "public"."autorizacoes" to "authenticated";

grant insert on table "public"."autorizacoes" to "authenticated";

grant references on table "public"."autorizacoes" to "authenticated";

grant select on table "public"."autorizacoes" to "authenticated";

grant trigger on table "public"."autorizacoes" to "authenticated";

grant truncate on table "public"."autorizacoes" to "authenticated";

grant update on table "public"."autorizacoes" to "authenticated";

grant delete on table "public"."autorizacoes" to "service_role";

grant insert on table "public"."autorizacoes" to "service_role";

grant references on table "public"."autorizacoes" to "service_role";

grant select on table "public"."autorizacoes" to "service_role";

grant trigger on table "public"."autorizacoes" to "service_role";

grant truncate on table "public"."autorizacoes" to "service_role";

grant update on table "public"."autorizacoes" to "service_role";

grant delete on table "public"."autorizacoes_assim" to "anon";

grant insert on table "public"."autorizacoes_assim" to "anon";

grant references on table "public"."autorizacoes_assim" to "anon";

grant select on table "public"."autorizacoes_assim" to "anon";

grant trigger on table "public"."autorizacoes_assim" to "anon";

grant truncate on table "public"."autorizacoes_assim" to "anon";

grant update on table "public"."autorizacoes_assim" to "anon";

grant delete on table "public"."autorizacoes_assim" to "authenticated";

grant insert on table "public"."autorizacoes_assim" to "authenticated";

grant references on table "public"."autorizacoes_assim" to "authenticated";

grant select on table "public"."autorizacoes_assim" to "authenticated";

grant trigger on table "public"."autorizacoes_assim" to "authenticated";

grant truncate on table "public"."autorizacoes_assim" to "authenticated";

grant update on table "public"."autorizacoes_assim" to "authenticated";

grant delete on table "public"."autorizacoes_assim" to "service_role";

grant insert on table "public"."autorizacoes_assim" to "service_role";

grant references on table "public"."autorizacoes_assim" to "service_role";

grant select on table "public"."autorizacoes_assim" to "service_role";

grant trigger on table "public"."autorizacoes_assim" to "service_role";

grant truncate on table "public"."autorizacoes_assim" to "service_role";

grant update on table "public"."autorizacoes_assim" to "service_role";

grant delete on table "public"."backup_fila_null_terapia" to "anon";

grant insert on table "public"."backup_fila_null_terapia" to "anon";

grant references on table "public"."backup_fila_null_terapia" to "anon";

grant select on table "public"."backup_fila_null_terapia" to "anon";

grant trigger on table "public"."backup_fila_null_terapia" to "anon";

grant truncate on table "public"."backup_fila_null_terapia" to "anon";

grant update on table "public"."backup_fila_null_terapia" to "anon";

grant delete on table "public"."backup_fila_null_terapia" to "authenticated";

grant insert on table "public"."backup_fila_null_terapia" to "authenticated";

grant references on table "public"."backup_fila_null_terapia" to "authenticated";

grant select on table "public"."backup_fila_null_terapia" to "authenticated";

grant trigger on table "public"."backup_fila_null_terapia" to "authenticated";

grant truncate on table "public"."backup_fila_null_terapia" to "authenticated";

grant update on table "public"."backup_fila_null_terapia" to "authenticated";

grant delete on table "public"."backup_fila_null_terapia" to "service_role";

grant insert on table "public"."backup_fila_null_terapia" to "service_role";

grant references on table "public"."backup_fila_null_terapia" to "service_role";

grant select on table "public"."backup_fila_null_terapia" to "service_role";

grant trigger on table "public"."backup_fila_null_terapia" to "service_role";

grant truncate on table "public"."backup_fila_null_terapia" to "service_role";

grant update on table "public"."backup_fila_null_terapia" to "service_role";

grant delete on table "public"."chamada_paciente" to "anon";

grant insert on table "public"."chamada_paciente" to "anon";

grant references on table "public"."chamada_paciente" to "anon";

grant select on table "public"."chamada_paciente" to "anon";

grant trigger on table "public"."chamada_paciente" to "anon";

grant truncate on table "public"."chamada_paciente" to "anon";

grant update on table "public"."chamada_paciente" to "anon";

grant delete on table "public"."chamada_paciente" to "authenticated";

grant insert on table "public"."chamada_paciente" to "authenticated";

grant references on table "public"."chamada_paciente" to "authenticated";

grant select on table "public"."chamada_paciente" to "authenticated";

grant trigger on table "public"."chamada_paciente" to "authenticated";

grant truncate on table "public"."chamada_paciente" to "authenticated";

grant update on table "public"."chamada_paciente" to "authenticated";

grant delete on table "public"."chamada_paciente" to "service_role";

grant insert on table "public"."chamada_paciente" to "service_role";

grant references on table "public"."chamada_paciente" to "service_role";

grant select on table "public"."chamada_paciente" to "service_role";

grant trigger on table "public"."chamada_paciente" to "service_role";

grant truncate on table "public"."chamada_paciente" to "service_role";

grant update on table "public"."chamada_paciente" to "service_role";

grant delete on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant insert on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant references on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant select on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant trigger on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant truncate on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant update on table "public"."controle_disponibilidade_terapeutas" to "anon";

grant delete on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant insert on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant references on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant select on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant trigger on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant truncate on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant update on table "public"."controle_disponibilidade_terapeutas" to "authenticated";

grant delete on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant insert on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant references on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant select on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant trigger on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant truncate on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant update on table "public"."controle_disponibilidade_terapeutas" to "service_role";

grant delete on table "public"."controle_terapeutico" to "anon";

grant insert on table "public"."controle_terapeutico" to "anon";

grant references on table "public"."controle_terapeutico" to "anon";

grant select on table "public"."controle_terapeutico" to "anon";

grant trigger on table "public"."controle_terapeutico" to "anon";

grant truncate on table "public"."controle_terapeutico" to "anon";

grant update on table "public"."controle_terapeutico" to "anon";

grant delete on table "public"."controle_terapeutico" to "authenticated";

grant insert on table "public"."controle_terapeutico" to "authenticated";

grant references on table "public"."controle_terapeutico" to "authenticated";

grant select on table "public"."controle_terapeutico" to "authenticated";

grant trigger on table "public"."controle_terapeutico" to "authenticated";

grant truncate on table "public"."controle_terapeutico" to "authenticated";

grant update on table "public"."controle_terapeutico" to "authenticated";

grant delete on table "public"."controle_terapeutico" to "service_role";

grant insert on table "public"."controle_terapeutico" to "service_role";

grant references on table "public"."controle_terapeutico" to "service_role";

grant select on table "public"."controle_terapeutico" to "service_role";

grant trigger on table "public"."controle_terapeutico" to "service_role";

grant truncate on table "public"."controle_terapeutico" to "service_role";

grant update on table "public"."controle_terapeutico" to "service_role";

grant delete on table "public"."fila_autorizacoes" to "anon";

grant insert on table "public"."fila_autorizacoes" to "anon";

grant references on table "public"."fila_autorizacoes" to "anon";

grant select on table "public"."fila_autorizacoes" to "anon";

grant trigger on table "public"."fila_autorizacoes" to "anon";

grant truncate on table "public"."fila_autorizacoes" to "anon";

grant update on table "public"."fila_autorizacoes" to "anon";

grant delete on table "public"."fila_autorizacoes" to "authenticated";

grant insert on table "public"."fila_autorizacoes" to "authenticated";

grant references on table "public"."fila_autorizacoes" to "authenticated";

grant select on table "public"."fila_autorizacoes" to "authenticated";

grant trigger on table "public"."fila_autorizacoes" to "authenticated";

grant truncate on table "public"."fila_autorizacoes" to "authenticated";

grant update on table "public"."fila_autorizacoes" to "authenticated";

grant delete on table "public"."fila_autorizacoes" to "service_role";

grant insert on table "public"."fila_autorizacoes" to "service_role";

grant references on table "public"."fila_autorizacoes" to "service_role";

grant select on table "public"."fila_autorizacoes" to "service_role";

grant trigger on table "public"."fila_autorizacoes" to "service_role";

grant truncate on table "public"."fila_autorizacoes" to "service_role";

grant update on table "public"."fila_autorizacoes" to "service_role";

grant delete on table "public"."fila_autorizacoes_logs" to "anon";

grant insert on table "public"."fila_autorizacoes_logs" to "anon";

grant references on table "public"."fila_autorizacoes_logs" to "anon";

grant select on table "public"."fila_autorizacoes_logs" to "anon";

grant trigger on table "public"."fila_autorizacoes_logs" to "anon";

grant truncate on table "public"."fila_autorizacoes_logs" to "anon";

grant update on table "public"."fila_autorizacoes_logs" to "anon";

grant delete on table "public"."fila_autorizacoes_logs" to "authenticated";

grant insert on table "public"."fila_autorizacoes_logs" to "authenticated";

grant references on table "public"."fila_autorizacoes_logs" to "authenticated";

grant select on table "public"."fila_autorizacoes_logs" to "authenticated";

grant trigger on table "public"."fila_autorizacoes_logs" to "authenticated";

grant truncate on table "public"."fila_autorizacoes_logs" to "authenticated";

grant update on table "public"."fila_autorizacoes_logs" to "authenticated";

grant delete on table "public"."fila_autorizacoes_logs" to "service_role";

grant insert on table "public"."fila_autorizacoes_logs" to "service_role";

grant references on table "public"."fila_autorizacoes_logs" to "service_role";

grant select on table "public"."fila_autorizacoes_logs" to "service_role";

grant trigger on table "public"."fila_autorizacoes_logs" to "service_role";

grant truncate on table "public"."fila_autorizacoes_logs" to "service_role";

grant update on table "public"."fila_autorizacoes_logs" to "service_role";

grant delete on table "public"."grade_profissionais_tita" to "anon";

grant insert on table "public"."grade_profissionais_tita" to "anon";

grant references on table "public"."grade_profissionais_tita" to "anon";

grant select on table "public"."grade_profissionais_tita" to "anon";

grant trigger on table "public"."grade_profissionais_tita" to "anon";

grant truncate on table "public"."grade_profissionais_tita" to "anon";

grant update on table "public"."grade_profissionais_tita" to "anon";

grant delete on table "public"."grade_profissionais_tita" to "authenticated";

grant insert on table "public"."grade_profissionais_tita" to "authenticated";

grant references on table "public"."grade_profissionais_tita" to "authenticated";

grant select on table "public"."grade_profissionais_tita" to "authenticated";

grant trigger on table "public"."grade_profissionais_tita" to "authenticated";

grant truncate on table "public"."grade_profissionais_tita" to "authenticated";

grant update on table "public"."grade_profissionais_tita" to "authenticated";

grant delete on table "public"."grade_profissionais_tita" to "service_role";

grant insert on table "public"."grade_profissionais_tita" to "service_role";

grant references on table "public"."grade_profissionais_tita" to "service_role";

grant select on table "public"."grade_profissionais_tita" to "service_role";

grant trigger on table "public"."grade_profissionais_tita" to "service_role";

grant truncate on table "public"."grade_profissionais_tita" to "service_role";

grant update on table "public"."grade_profissionais_tita" to "service_role";

grant delete on table "public"."guia_terapias" to "anon";

grant insert on table "public"."guia_terapias" to "anon";

grant references on table "public"."guia_terapias" to "anon";

grant select on table "public"."guia_terapias" to "anon";

grant trigger on table "public"."guia_terapias" to "anon";

grant truncate on table "public"."guia_terapias" to "anon";

grant update on table "public"."guia_terapias" to "anon";

grant delete on table "public"."guia_terapias" to "authenticated";

grant insert on table "public"."guia_terapias" to "authenticated";

grant references on table "public"."guia_terapias" to "authenticated";

grant select on table "public"."guia_terapias" to "authenticated";

grant trigger on table "public"."guia_terapias" to "authenticated";

grant truncate on table "public"."guia_terapias" to "authenticated";

grant update on table "public"."guia_terapias" to "authenticated";

grant delete on table "public"."guia_terapias" to "service_role";

grant insert on table "public"."guia_terapias" to "service_role";

grant references on table "public"."guia_terapias" to "service_role";

grant select on table "public"."guia_terapias" to "service_role";

grant trigger on table "public"."guia_terapias" to "service_role";

grant truncate on table "public"."guia_terapias" to "service_role";

grant update on table "public"."guia_terapias" to "service_role";

grant delete on table "public"."guias_processadas" to "anon";

grant insert on table "public"."guias_processadas" to "anon";

grant references on table "public"."guias_processadas" to "anon";

grant select on table "public"."guias_processadas" to "anon";

grant trigger on table "public"."guias_processadas" to "anon";

grant truncate on table "public"."guias_processadas" to "anon";

grant update on table "public"."guias_processadas" to "anon";

grant delete on table "public"."guias_processadas" to "authenticated";

grant insert on table "public"."guias_processadas" to "authenticated";

grant references on table "public"."guias_processadas" to "authenticated";

grant select on table "public"."guias_processadas" to "authenticated";

grant trigger on table "public"."guias_processadas" to "authenticated";

grant truncate on table "public"."guias_processadas" to "authenticated";

grant update on table "public"."guias_processadas" to "authenticated";

grant delete on table "public"."guias_processadas" to "service_role";

grant insert on table "public"."guias_processadas" to "service_role";

grant references on table "public"."guias_processadas" to "service_role";

grant select on table "public"."guias_processadas" to "service_role";

grant trigger on table "public"."guias_processadas" to "service_role";

grant truncate on table "public"."guias_processadas" to "service_role";

grant update on table "public"."guias_processadas" to "service_role";

grant delete on table "public"."logs" to "anon";

grant insert on table "public"."logs" to "anon";

grant references on table "public"."logs" to "anon";

grant select on table "public"."logs" to "anon";

grant trigger on table "public"."logs" to "anon";

grant truncate on table "public"."logs" to "anon";

grant update on table "public"."logs" to "anon";

grant delete on table "public"."logs" to "authenticated";

grant insert on table "public"."logs" to "authenticated";

grant references on table "public"."logs" to "authenticated";

grant select on table "public"."logs" to "authenticated";

grant trigger on table "public"."logs" to "authenticated";

grant truncate on table "public"."logs" to "authenticated";

grant update on table "public"."logs" to "authenticated";

grant delete on table "public"."logs" to "service_role";

grant insert on table "public"."logs" to "service_role";

grant references on table "public"."logs" to "service_role";

grant select on table "public"."logs" to "service_role";

grant trigger on table "public"."logs" to "service_role";

grant truncate on table "public"."logs" to "service_role";

grant update on table "public"."logs" to "service_role";

grant delete on table "public"."logs_execucao" to "anon";

grant insert on table "public"."logs_execucao" to "anon";

grant references on table "public"."logs_execucao" to "anon";

grant select on table "public"."logs_execucao" to "anon";

grant trigger on table "public"."logs_execucao" to "anon";

grant truncate on table "public"."logs_execucao" to "anon";

grant update on table "public"."logs_execucao" to "anon";

grant delete on table "public"."logs_execucao" to "authenticated";

grant insert on table "public"."logs_execucao" to "authenticated";

grant references on table "public"."logs_execucao" to "authenticated";

grant select on table "public"."logs_execucao" to "authenticated";

grant trigger on table "public"."logs_execucao" to "authenticated";

grant truncate on table "public"."logs_execucao" to "authenticated";

grant update on table "public"."logs_execucao" to "authenticated";

grant delete on table "public"."logs_execucao" to "service_role";

grant insert on table "public"."logs_execucao" to "service_role";

grant references on table "public"."logs_execucao" to "service_role";

grant select on table "public"."logs_execucao" to "service_role";

grant trigger on table "public"."logs_execucao" to "service_role";

grant truncate on table "public"."logs_execucao" to "service_role";

grant update on table "public"."logs_execucao" to "service_role";

grant delete on table "public"."maquinas" to "anon";

grant insert on table "public"."maquinas" to "anon";

grant references on table "public"."maquinas" to "anon";

grant select on table "public"."maquinas" to "anon";

grant trigger on table "public"."maquinas" to "anon";

grant truncate on table "public"."maquinas" to "anon";

grant update on table "public"."maquinas" to "anon";

grant delete on table "public"."maquinas" to "authenticated";

grant insert on table "public"."maquinas" to "authenticated";

grant references on table "public"."maquinas" to "authenticated";

grant select on table "public"."maquinas" to "authenticated";

grant trigger on table "public"."maquinas" to "authenticated";

grant truncate on table "public"."maquinas" to "authenticated";

grant update on table "public"."maquinas" to "authenticated";

grant delete on table "public"."maquinas" to "service_role";

grant insert on table "public"."maquinas" to "service_role";

grant references on table "public"."maquinas" to "service_role";

grant select on table "public"."maquinas" to "service_role";

grant trigger on table "public"."maquinas" to "service_role";

grant truncate on table "public"."maquinas" to "service_role";

grant update on table "public"."maquinas" to "service_role";

grant delete on table "public"."paciente_classificacao" to "anon";

grant insert on table "public"."paciente_classificacao" to "anon";

grant references on table "public"."paciente_classificacao" to "anon";

grant select on table "public"."paciente_classificacao" to "anon";

grant trigger on table "public"."paciente_classificacao" to "anon";

grant truncate on table "public"."paciente_classificacao" to "anon";

grant update on table "public"."paciente_classificacao" to "anon";

grant delete on table "public"."paciente_classificacao" to "authenticated";

grant insert on table "public"."paciente_classificacao" to "authenticated";

grant references on table "public"."paciente_classificacao" to "authenticated";

grant select on table "public"."paciente_classificacao" to "authenticated";

grant trigger on table "public"."paciente_classificacao" to "authenticated";

grant truncate on table "public"."paciente_classificacao" to "authenticated";

grant update on table "public"."paciente_classificacao" to "authenticated";

grant delete on table "public"."paciente_classificacao" to "service_role";

grant insert on table "public"."paciente_classificacao" to "service_role";

grant references on table "public"."paciente_classificacao" to "service_role";

grant select on table "public"."paciente_classificacao" to "service_role";

grant trigger on table "public"."paciente_classificacao" to "service_role";

grant truncate on table "public"."paciente_classificacao" to "service_role";

grant update on table "public"."paciente_classificacao" to "service_role";

grant delete on table "public"."perfis" to "anon";

grant insert on table "public"."perfis" to "anon";

grant references on table "public"."perfis" to "anon";

grant select on table "public"."perfis" to "anon";

grant trigger on table "public"."perfis" to "anon";

grant truncate on table "public"."perfis" to "anon";

grant update on table "public"."perfis" to "anon";

grant delete on table "public"."perfis" to "authenticated";

grant insert on table "public"."perfis" to "authenticated";

grant references on table "public"."perfis" to "authenticated";

grant select on table "public"."perfis" to "authenticated";

grant trigger on table "public"."perfis" to "authenticated";

grant truncate on table "public"."perfis" to "authenticated";

grant update on table "public"."perfis" to "authenticated";

grant delete on table "public"."perfis" to "service_role";

grant insert on table "public"."perfis" to "service_role";

grant references on table "public"."perfis" to "service_role";

grant select on table "public"."perfis" to "service_role";

grant trigger on table "public"."perfis" to "service_role";

grant truncate on table "public"."perfis" to "service_role";

grant update on table "public"."perfis" to "service_role";

grant delete on table "public"."pre_auditoria_snapshot" to "anon";

grant insert on table "public"."pre_auditoria_snapshot" to "anon";

grant references on table "public"."pre_auditoria_snapshot" to "anon";

grant select on table "public"."pre_auditoria_snapshot" to "anon";

grant trigger on table "public"."pre_auditoria_snapshot" to "anon";

grant truncate on table "public"."pre_auditoria_snapshot" to "anon";

grant update on table "public"."pre_auditoria_snapshot" to "anon";

grant delete on table "public"."pre_auditoria_snapshot" to "authenticated";

grant insert on table "public"."pre_auditoria_snapshot" to "authenticated";

grant references on table "public"."pre_auditoria_snapshot" to "authenticated";

grant select on table "public"."pre_auditoria_snapshot" to "authenticated";

grant trigger on table "public"."pre_auditoria_snapshot" to "authenticated";

grant truncate on table "public"."pre_auditoria_snapshot" to "authenticated";

grant update on table "public"."pre_auditoria_snapshot" to "authenticated";

grant delete on table "public"."pre_auditoria_snapshot" to "service_role";

grant insert on table "public"."pre_auditoria_snapshot" to "service_role";

grant references on table "public"."pre_auditoria_snapshot" to "service_role";

grant select on table "public"."pre_auditoria_snapshot" to "service_role";

grant trigger on table "public"."pre_auditoria_snapshot" to "service_role";

grant truncate on table "public"."pre_auditoria_snapshot" to "service_role";

grant update on table "public"."pre_auditoria_snapshot" to "service_role";

grant delete on table "public"."sessions" to "anon";

grant insert on table "public"."sessions" to "anon";

grant references on table "public"."sessions" to "anon";

grant select on table "public"."sessions" to "anon";

grant trigger on table "public"."sessions" to "anon";

grant truncate on table "public"."sessions" to "anon";

grant update on table "public"."sessions" to "anon";

grant delete on table "public"."sessions" to "authenticated";

grant insert on table "public"."sessions" to "authenticated";

grant references on table "public"."sessions" to "authenticated";

grant select on table "public"."sessions" to "authenticated";

grant trigger on table "public"."sessions" to "authenticated";

grant truncate on table "public"."sessions" to "authenticated";

grant update on table "public"."sessions" to "authenticated";

grant delete on table "public"."sessions" to "service_role";

grant insert on table "public"."sessions" to "service_role";

grant references on table "public"."sessions" to "service_role";

grant select on table "public"."sessions" to "service_role";

grant trigger on table "public"."sessions" to "service_role";

grant truncate on table "public"."sessions" to "service_role";

grant update on table "public"."sessions" to "service_role";

grant delete on table "public"."sync_controle" to "anon";

grant insert on table "public"."sync_controle" to "anon";

grant references on table "public"."sync_controle" to "anon";

grant select on table "public"."sync_controle" to "anon";

grant trigger on table "public"."sync_controle" to "anon";

grant truncate on table "public"."sync_controle" to "anon";

grant update on table "public"."sync_controle" to "anon";

grant delete on table "public"."sync_controle" to "authenticated";

grant insert on table "public"."sync_controle" to "authenticated";

grant references on table "public"."sync_controle" to "authenticated";

grant select on table "public"."sync_controle" to "authenticated";

grant trigger on table "public"."sync_controle" to "authenticated";

grant truncate on table "public"."sync_controle" to "authenticated";

grant update on table "public"."sync_controle" to "authenticated";

grant delete on table "public"."sync_controle" to "service_role";

grant insert on table "public"."sync_controle" to "service_role";

grant references on table "public"."sync_controle" to "service_role";

grant select on table "public"."sync_controle" to "service_role";

grant trigger on table "public"."sync_controle" to "service_role";

grant truncate on table "public"."sync_controle" to "service_role";

grant update on table "public"."sync_controle" to "service_role";

grant delete on table "public"."sync_status" to "anon";

grant insert on table "public"."sync_status" to "anon";

grant references on table "public"."sync_status" to "anon";

grant select on table "public"."sync_status" to "anon";

grant trigger on table "public"."sync_status" to "anon";

grant truncate on table "public"."sync_status" to "anon";

grant update on table "public"."sync_status" to "anon";

grant delete on table "public"."sync_status" to "authenticated";

grant insert on table "public"."sync_status" to "authenticated";

grant references on table "public"."sync_status" to "authenticated";

grant select on table "public"."sync_status" to "authenticated";

grant trigger on table "public"."sync_status" to "authenticated";

grant truncate on table "public"."sync_status" to "authenticated";

grant update on table "public"."sync_status" to "authenticated";

grant delete on table "public"."sync_status" to "service_role";

grant insert on table "public"."sync_status" to "service_role";

grant references on table "public"."sync_status" to "service_role";

grant select on table "public"."sync_status" to "service_role";

grant trigger on table "public"."sync_status" to "service_role";

grant truncate on table "public"."sync_status" to "service_role";

grant update on table "public"."sync_status" to "service_role";

grant delete on table "public"."terapeuta_eventos" to "anon";

grant insert on table "public"."terapeuta_eventos" to "anon";

grant references on table "public"."terapeuta_eventos" to "anon";

grant select on table "public"."terapeuta_eventos" to "anon";

grant trigger on table "public"."terapeuta_eventos" to "anon";

grant truncate on table "public"."terapeuta_eventos" to "anon";

grant update on table "public"."terapeuta_eventos" to "anon";

grant delete on table "public"."terapeuta_eventos" to "authenticated";

grant insert on table "public"."terapeuta_eventos" to "authenticated";

grant references on table "public"."terapeuta_eventos" to "authenticated";

grant select on table "public"."terapeuta_eventos" to "authenticated";

grant trigger on table "public"."terapeuta_eventos" to "authenticated";

grant truncate on table "public"."terapeuta_eventos" to "authenticated";

grant update on table "public"."terapeuta_eventos" to "authenticated";

grant delete on table "public"."terapeuta_eventos" to "service_role";

grant insert on table "public"."terapeuta_eventos" to "service_role";

grant references on table "public"."terapeuta_eventos" to "service_role";

grant select on table "public"."terapeuta_eventos" to "service_role";

grant trigger on table "public"."terapeuta_eventos" to "service_role";

grant truncate on table "public"."terapeuta_eventos" to "service_role";

grant update on table "public"."terapeuta_eventos" to "service_role";

grant delete on table "public"."terapeutas" to "anon";

grant insert on table "public"."terapeutas" to "anon";

grant references on table "public"."terapeutas" to "anon";

grant select on table "public"."terapeutas" to "anon";

grant trigger on table "public"."terapeutas" to "anon";

grant truncate on table "public"."terapeutas" to "anon";

grant update on table "public"."terapeutas" to "anon";

grant delete on table "public"."terapeutas" to "authenticated";

grant insert on table "public"."terapeutas" to "authenticated";

grant references on table "public"."terapeutas" to "authenticated";

grant select on table "public"."terapeutas" to "authenticated";

grant trigger on table "public"."terapeutas" to "authenticated";

grant truncate on table "public"."terapeutas" to "authenticated";

grant update on table "public"."terapeutas" to "authenticated";

grant delete on table "public"."terapeutas" to "service_role";

grant insert on table "public"."terapeutas" to "service_role";

grant references on table "public"."terapeutas" to "service_role";

grant select on table "public"."terapeutas" to "service_role";

grant trigger on table "public"."terapeutas" to "service_role";

grant truncate on table "public"."terapeutas" to "service_role";

grant update on table "public"."terapeutas" to "service_role";

grant delete on table "public"."terapias_controle" to "anon";

grant insert on table "public"."terapias_controle" to "anon";

grant references on table "public"."terapias_controle" to "anon";

grant select on table "public"."terapias_controle" to "anon";

grant trigger on table "public"."terapias_controle" to "anon";

grant truncate on table "public"."terapias_controle" to "anon";

grant update on table "public"."terapias_controle" to "anon";

grant delete on table "public"."terapias_controle" to "authenticated";

grant insert on table "public"."terapias_controle" to "authenticated";

grant references on table "public"."terapias_controle" to "authenticated";

grant select on table "public"."terapias_controle" to "authenticated";

grant trigger on table "public"."terapias_controle" to "authenticated";

grant truncate on table "public"."terapias_controle" to "authenticated";

grant update on table "public"."terapias_controle" to "authenticated";

grant delete on table "public"."terapias_controle" to "service_role";

grant insert on table "public"."terapias_controle" to "service_role";

grant references on table "public"."terapias_controle" to "service_role";

grant select on table "public"."terapias_controle" to "service_role";

grant trigger on table "public"."terapias_controle" to "service_role";

grant truncate on table "public"."terapias_controle" to "service_role";

grant update on table "public"."terapias_controle" to "service_role";

grant delete on table "public"."tita_grade_profissionais" to "anon";

grant insert on table "public"."tita_grade_profissionais" to "anon";

grant references on table "public"."tita_grade_profissionais" to "anon";

grant select on table "public"."tita_grade_profissionais" to "anon";

grant trigger on table "public"."tita_grade_profissionais" to "anon";

grant truncate on table "public"."tita_grade_profissionais" to "anon";

grant update on table "public"."tita_grade_profissionais" to "anon";

grant delete on table "public"."tita_grade_profissionais" to "authenticated";

grant insert on table "public"."tita_grade_profissionais" to "authenticated";

grant references on table "public"."tita_grade_profissionais" to "authenticated";

grant select on table "public"."tita_grade_profissionais" to "authenticated";

grant trigger on table "public"."tita_grade_profissionais" to "authenticated";

grant truncate on table "public"."tita_grade_profissionais" to "authenticated";

grant update on table "public"."tita_grade_profissionais" to "authenticated";

grant delete on table "public"."tita_grade_profissionais" to "service_role";

grant insert on table "public"."tita_grade_profissionais" to "service_role";

grant references on table "public"."tita_grade_profissionais" to "service_role";

grant select on table "public"."tita_grade_profissionais" to "service_role";

grant trigger on table "public"."tita_grade_profissionais" to "service_role";

grant truncate on table "public"."tita_grade_profissionais" to "service_role";

grant update on table "public"."tita_grade_profissionais" to "service_role";

grant delete on table "public"."usuarios" to "anon";

grant insert on table "public"."usuarios" to "anon";

grant references on table "public"."usuarios" to "anon";

grant select on table "public"."usuarios" to "anon";

grant trigger on table "public"."usuarios" to "anon";

grant truncate on table "public"."usuarios" to "anon";

grant update on table "public"."usuarios" to "anon";

grant delete on table "public"."usuarios" to "authenticated";

grant references on table "public"."usuarios" to "authenticated";

grant select on table "public"."usuarios" to "authenticated";

grant trigger on table "public"."usuarios" to "authenticated";

grant truncate on table "public"."usuarios" to "authenticated";

grant update on table "public"."usuarios" to "authenticated";

grant delete on table "public"."usuarios" to "service_role";

grant insert on table "public"."usuarios" to "service_role";

grant references on table "public"."usuarios" to "service_role";

grant select on table "public"."usuarios" to "service_role";

grant trigger on table "public"."usuarios" to "service_role";

grant truncate on table "public"."usuarios" to "service_role";

grant update on table "public"."usuarios" to "service_role";

grant delete on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant insert on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant references on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant select on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant trigger on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant truncate on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant update on table "public"."vw_central_pacientes_backup_20260508" to "anon";

grant delete on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant insert on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant references on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant select on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant trigger on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant truncate on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant update on table "public"."vw_central_pacientes_backup_20260508" to "authenticated";

grant delete on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant insert on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant references on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant select on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant trigger on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant truncate on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant update on table "public"."vw_central_pacientes_backup_20260508" to "service_role";

grant delete on table "public"."worker_tokens" to "anon";

grant insert on table "public"."worker_tokens" to "anon";

grant references on table "public"."worker_tokens" to "anon";

grant select on table "public"."worker_tokens" to "anon";

grant trigger on table "public"."worker_tokens" to "anon";

grant truncate on table "public"."worker_tokens" to "anon";

grant update on table "public"."worker_tokens" to "anon";

grant delete on table "public"."worker_tokens" to "authenticated";

grant insert on table "public"."worker_tokens" to "authenticated";

grant references on table "public"."worker_tokens" to "authenticated";

grant select on table "public"."worker_tokens" to "authenticated";

grant trigger on table "public"."worker_tokens" to "authenticated";

grant truncate on table "public"."worker_tokens" to "authenticated";

grant update on table "public"."worker_tokens" to "authenticated";

grant delete on table "public"."worker_tokens" to "service_role";

grant insert on table "public"."worker_tokens" to "service_role";

grant references on table "public"."worker_tokens" to "service_role";

grant select on table "public"."worker_tokens" to "service_role";

grant trigger on table "public"."worker_tokens" to "service_role";

grant truncate on table "public"."worker_tokens" to "service_role";

grant update on table "public"."worker_tokens" to "service_role";


  create policy "allow insert agenda_orbita"
  on "public"."agenda_orbita"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "allow select agenda_orbita"
  on "public"."agenda_orbita"
  as permissive
  for select
  to authenticated
using (true);



  create policy "allow update agenda_orbita"
  on "public"."agenda_orbita"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Leitura agenda para usuarios autenticados"
  on "public"."agenda_terapias"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "select agenda"
  on "public"."agenda_terapias"
  as permissive
  for select
  to authenticated
using (true);



  create policy "select_agenda"
  on "public"."agenda_terapias"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Permitir update de autorizacoes"
  on "public"."autorizacoes"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "insert autorizacao"
  on "public"."autorizacoes"
  as permissive
  for insert
  to authenticated
with check ((usuario_id = auth.uid()));



  create policy "insert publico"
  on "public"."autorizacoes"
  as permissive
  for insert
  to public
with check (true);



  create policy "no delete"
  on "public"."autorizacoes"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "select liberado geral"
  on "public"."autorizacoes"
  as permissive
  for select
  to public
using (true);



  create policy "update autorizacoes liberado"
  on "public"."autorizacoes"
  as permissive
  for update
  to public
using (true)
with check (true);



  create policy "authenticated read"
  on "public"."autorizacoes_assim"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "block delete frontend"
  on "public"."autorizacoes_assim"
  as permissive
  for delete
  to public
using (false);



  create policy "block insert frontend"
  on "public"."autorizacoes_assim"
  as permissive
  for insert
  to public
with check (false);



  create policy "block update frontend"
  on "public"."autorizacoes_assim"
  as permissive
  for update
  to public
using (false);



  create policy "service role full access"
  on "public"."autorizacoes_assim"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



  create policy "Liberar tudo chamada"
  on "public"."chamada_paciente"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "Permitir insert chamada"
  on "public"."chamada_paciente"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Permitir select controle terapeutico autenticado"
  on "public"."controle_terapeutico"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Permitir update controle terapeutico autenticado"
  on "public"."controle_terapeutico"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "controle_terapeutico_select_authenticated"
  on "public"."controle_terapeutico"
  as permissive
  for select
  to authenticated
using (true);



  create policy "controle_terapeutico_update_authenticated"
  on "public"."controle_terapeutico"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Leitura fila para usuarios autenticados"
  on "public"."fila_autorizacoes"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "Usuarios autenticados podem acessar"
  on "public"."fila_autorizacoes"
  as permissive
  for all
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "Usuarios autenticados podem atualizar classificacao"
  on "public"."fila_autorizacoes"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Usuarios autenticados podem ver registros"
  on "public"."fila_autorizacoes"
  as permissive
  for select
  to authenticated
using (true);



  create policy "full access fila"
  on "public"."fila_autorizacoes"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "select_fila"
  on "public"."fila_autorizacoes"
  as permissive
  for select
  to authenticated
using (true);



  create policy "update fila"
  on "public"."fila_autorizacoes"
  as permissive
  for update
  to public
using (true);



  create policy "authenticated_access"
  on "public"."fila_autorizacoes_logs"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "insert logs liberado geral"
  on "public"."logs"
  as permissive
  for insert
  to public
with check (true);



  create policy "insert logs liberado"
  on "public"."logs"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "user can view own logs"
  on "public"."logs_execucao"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "admin_ver_todas_maquinas"
  on "public"."maquinas"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.usuarios u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));



  create policy "maquina_select_propria"
  on "public"."maquinas"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "maquina_update_propria"
  on "public"."maquinas"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "insert classificacao"
  on "public"."paciente_classificacao"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "select classificacao"
  on "public"."paciente_classificacao"
  as permissive
  for select
  to authenticated
using (true);



  create policy "update classificacao"
  on "public"."paciente_classificacao"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "perfil próprio"
  on "public"."perfis"
  as permissive
  for select
  to authenticated
using ((id = auth.uid()));



  create policy "user can access own sessions"
  on "public"."sessions"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Permitir select sync"
  on "public"."sync_controle"
  as permissive
  for select
  to public
using (true);



  create policy "Permitir update sync"
  on "public"."sync_controle"
  as permissive
  for update
  to public
using (true);



  create policy "Admin pode atualizar usuarios"
  on "public"."usuarios"
  as permissive
  for update
  to public
using (public.is_admin());



  create policy "Admin pode ver todos usuarios"
  on "public"."usuarios"
  as permissive
  for select
  to public
using (public.is_admin());



  create policy "Usuário pode ver próprio perfil"
  on "public"."usuarios"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "user can manage own tokens"
  on "public"."worker_tokens"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));


CREATE TRIGGER trg_autorizacoes_set_updated_at BEFORE UPDATE ON public.autorizacoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_autorizacoes_updated_at BEFORE UPDATE ON public.autorizacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_preencher_paciente_assim BEFORE INSERT ON public.autorizacoes_assim FOR EACH ROW EXECUTE FUNCTION public.preencher_paciente_assim();

CREATE TRIGGER trg_preencher_paciente_assim_update BEFORE UPDATE ON public.autorizacoes_assim FOR EACH ROW EXECUTE FUNCTION public.preencher_paciente_assim();

CREATE TRIGGER update_autorizacoes_updated_at BEFORE UPDATE ON public.autorizacoes_assim FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_update_controle_disponibilidade_updated_at BEFORE UPDATE ON public.controle_disponibilidade_terapeutas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_controle_disponibilidade();

CREATE TRIGGER trg_controle_terapeutico_data_atualizacao BEFORE UPDATE ON public.controle_terapeutico FOR EACH ROW EXECUTE FUNCTION public.set_data_atualizacao();

CREATE TRIGGER trg_controle_terapeutico_updated_at BEFORE UPDATE ON public.controle_terapeutico FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_log_fila_autorizacoes AFTER INSERT OR UPDATE ON public.fila_autorizacoes FOR EACH ROW EXECUTE FUNCTION public.trigger_log_fila_autorizacoes();

CREATE TRIGGER trigger_ajustar_crm BEFORE INSERT OR UPDATE ON public.fila_autorizacoes FOR EACH ROW EXECUTE FUNCTION public.ajustar_crm_fila();

CREATE TRIGGER trigger_ajustar_matricula BEFORE INSERT OR UPDATE ON public.fila_autorizacoes FOR EACH ROW EXECUTE FUNCTION public.ajustar_matricula_fila();

CREATE TRIGGER trigger_updated_at BEFORE UPDATE ON public.fila_autorizacoes FOR EACH ROW EXECUTE FUNCTION public.atualizar_updated_at();

CREATE TRIGGER on_auth_user_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.sync_user_activation();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


