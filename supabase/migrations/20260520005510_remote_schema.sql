create sequence "public"."config_regras_terapias_id_seq";

revoke insert on table "public"."usuarios" from "authenticated";


  create table "public"."config_regras_terapias" (
    "id" bigint not null default nextval('public.config_regras_terapias_id_seq'::regclass),
    "categoria" text not null,
    "terapia_nome" text not null,
    "descricao" text,
    "ativo" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."config_regras_terapias" enable row level security;


  create table "public"."crm_inconsistencias" (
    "id" uuid not null default gen_random_uuid(),
    "nome_medico_normalizado" text,
    "crm_numero" text,
    "ocorrencias" integer,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."crm_inconsistencias" enable row level security;


  create table "public"."paciente_medico_vigente" (
    "paciente_id" text not null,
    "crm_numero" text,
    "crm_uf" text,
    "crm_formatado" text,
    "nome_medico" text,
    "origem" text default 'orbita'::text,
    "vigente_desde" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "nome_medico_normalizado" text,
    "crm_original" text,
    "crm_suspeito" boolean default false
      );


alter table "public"."paciente_medico_vigente" enable row level security;

alter table "public"."agenda_orbita" add column "crm_formatado" text;

alter table "public"."agenda_orbita" add column "crm_numero" text;

alter table "public"."agenda_orbita" add column "crm_uf" text;

alter table "public"."agenda_orbita" add column "nome_medico_normalizado" text;

alter sequence "public"."config_regras_terapias_id_seq" owned by "public"."config_regras_terapias"."id";

CREATE UNIQUE INDEX config_regras_terapias_pkey ON public.config_regras_terapias USING btree (id);

CREATE UNIQUE INDEX crm_inconsistencias_pkey ON public.crm_inconsistencias USING btree (id);

CREATE INDEX idx_autorizacoes_assim_auditoria ON public.autorizacoes_assim USING btree (paciente_id, codigo_tuss, data_execucao);

CREATE INDEX idx_config_regras_terapias_categoria ON public.config_regras_terapias USING btree (categoria, ativo);

CREATE INDEX idx_fila_autorizacoes_auditoria ON public.fila_autorizacoes USING btree (paciente_id, tuss, data_atendimento);

CREATE INDEX idx_fila_autorizacoes_match ON public.fila_autorizacoes USING btree (empresa, matricula, dep, data_atendimento, tuss);

CREATE INDEX idx_paciente_medico_vigente ON public.paciente_medico_vigente USING btree (paciente_id);

CREATE UNIQUE INDEX paciente_medico_vigente_pkey ON public.paciente_medico_vigente USING btree (paciente_id);

alter table "public"."config_regras_terapias" add constraint "config_regras_terapias_pkey" PRIMARY KEY using index "config_regras_terapias_pkey";

alter table "public"."crm_inconsistencias" add constraint "crm_inconsistencias_pkey" PRIMARY KEY using index "crm_inconsistencias_pkey";

alter table "public"."paciente_medico_vigente" add constraint "paciente_medico_vigente_pkey" PRIMARY KEY using index "paciente_medico_vigente_pkey";

set check_function_bodies = off;

create or replace view "public"."agenda_tita_autorizacao_v2" as  SELECT a.id,
    a.tita_agendamento_id,
    a.origem,
    a.data_atendimento,
    a.hora_inicial,
    a.hora_final,
    a.paciente_id,
    a.paciente_nome,
    a.cpf,
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
    a.data_nascimento,
    "substring"(a.numero_carteirinha, 1, 6) AS empresa,
    "substring"(a.numero_carteirinha, 7, 7) AS matricula,
    "right"(regexp_replace(a.numero_carteirinha, '\D'::text, ''::text, 'g'::text), 2) AS dep,
    pmv.crm_formatado AS crm,
    pmv.crm_numero,
    pmv.crm_uf,
    upper(replace(translate(COALESCE(pmv.nome_medico, ''::text), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç.'::text, 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc '::text), '.'::text, ''::text)) AS nome_medico
   FROM (public.agenda_tita a
     LEFT JOIN public.paciente_medico_vigente pmv ON ((pmv.paciente_id = (a.paciente_id)::text)));


CREATE OR REPLACE FUNCTION public.executar_relatorio_crm_inconsistente()
 RETURNS TABLE(nome_medico_normalizado text, qtd_crms bigint)
 LANGUAGE sql
AS $function$
    select
        nome_medico_normalizado,
        count(distinct crm_numero)
    from paciente_medico_vigente
    where crm_numero is not null
    and crm_numero <> ''
    group by nome_medico_normalizado
    having count(distinct crm_numero) > 1;
$function$
;

create or replace view "public"."vw_blocos_autorizaveis_assim" as  WITH agenda_filtrada AS (
         SELECT a.id,
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
            a.empresa,
            a.matricula,
            a.dep,
            a.crm,
            a.nome_medico,
            a.codigo_tuss
           FROM public.agenda_tita_autorizacao a
          WHERE ((a.convenio_nome ~~* '%assim%'::text) AND (NOT (EXISTS ( SELECT 1
                   FROM public.config_regras_terapias r
                  WHERE ((r.categoria = 'BLACKLIST_AUTORIZACAO'::text) AND (r.ativo = true) AND (a.terapia_nome ~~* (('%'::text || r.terapia_nome) || '%'::text)))))))
        ), agenda_sem_falta AS (
         SELECT a.id,
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
            a.empresa,
            a.matricula,
            a.dep,
            a.crm,
            a.nome_medico,
            a.codigo_tuss
           FROM agenda_filtrada a
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.fila_autorizacoes f
                  WHERE (((f.paciente_id)::bigint = a.paciente_id) AND (f.data_atendimento = a.data_atendimento) AND (f.horario = a.hora_inicial) AND ((upper(COALESCE(f.status_assim, ''::text)) ~~ '%FALTA%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%PACIENTE%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%TERAPEUTA%'::text))))))
        )
 SELECT concat_ws('_'::text, paciente_id, data_atendimento, codigo_tuss, hora_inicial) AS bloco_id,
    paciente_id,
    paciente_nome,
    empresa,
    matricula,
    dep,
    concat_ws('.'::text, empresa, matricula, dep) AS carteirinha,
    data_atendimento,
    hora_inicial,
    codigo_tuss,
    convenio_nome,
    string_agg(DISTINCT terapia_exibicao_nome, ' | '::text ORDER BY terapia_exibicao_nome) AS terapias,
    string_agg(DISTINCT profissional_nome, ' | '::text ORDER BY profissional_nome) AS profissionais,
    count(*) AS quantidade_sessoes
   FROM agenda_sem_falta
  GROUP BY paciente_id, paciente_nome, empresa, matricula, dep, data_atendimento, hora_inicial, codigo_tuss, convenio_nome;


CREATE OR REPLACE FUNCTION public.inserir_na_fila_autorizacoes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare

  v_crm text;
  v_nome_medico text;

begin

  -- só entra se for manual e tiver dados essenciais
  if new.status = 'manual'
     and new.matricula is not null
     and new.tuss is not null then

    -- ============================================
    -- BUSCA MÉDICO VIGENTE
    -- ============================================

    select
      pmv.crm_numero,
      pmv.nome_medico
    into
      v_crm,
      v_nome_medico
    from paciente_medico_vigente pmv
    where pmv.paciente_id = new.paciente_id::text
    limit 1;

    -- fallback
    v_crm := coalesce(v_crm, new.crm);

    v_nome_medico :=
      coalesce(v_nome_medico, new.nome_medico);

    -- ============================================
    -- INSERE FILA
    -- ============================================

    insert into fila_autorizacoes (

      agenda_id,
      paciente_id,
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
      new.paciente_id,
      new.paciente_nome,

      new.matricula,
      new.data_atendimento,
      new.horario,

      'concluido',

      new.empresa,
      new.dep,

      v_crm,
      v_nome_medico,

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

create or replace view "public"."vw_auditoria_autorizacoes_assim" as  WITH fila_operacional AS (
         SELECT DISTINCT f.empresa,
            f.matricula,
            f.dep,
            f.data_atendimento,
            f.horario,
            f.tuss AS codigo_tuss
           FROM public.fila_autorizacoes f
          WHERE (NOT ((upper(COALESCE(f.status_assim, ''::text)) ~~ '%FALTA%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%PACIENTE%'::text) OR (upper(COALESCE(f.tipo_falta, ''::text)) ~~ '%TERAPEUTA%'::text)))
        ), match_temporal AS (
         WITH sessoes AS (
                 SELECT b_1.bloco_id,
                    b_1.paciente_id,
                    b_1.paciente_nome,
                    b_1.empresa,
                    b_1.matricula,
                    b_1.dep,
                    b_1.carteirinha,
                    b_1.data_atendimento,
                    b_1.hora_inicial,
                    b_1.codigo_tuss,
                    b_1.convenio_nome,
                    b_1.terapias,
                    b_1.profissionais,
                    b_1.quantidade_sessoes,
                    row_number() OVER (PARTITION BY b_1.empresa, b_1.matricula, b_1.dep, b_1.data_atendimento, b_1.codigo_tuss ORDER BY b_1.hora_inicial) AS ordem_sessao
                   FROM public.vw_blocos_autorizaveis_assim b_1
                ), autorizacoes AS (
                 SELECT aa.guia,
                    aa.matricula,
                    aa.paciente_nome,
                    aa.data_execucao,
                    aa.data_autorizacao,
                    aa.status,
                    aa.codigo_tuss,
                    aa.codigo_erro,
                    aa.descricao_erro,
                    aa.teve_token,
                    aa.updated_at,
                    aa.token,
                    aa.status_tratado,
                    aa.matricula_limpa,
                    aa.paciente_id,
                    split_part(aa.matricula, '.'::text, 1) AS empresa,
                    split_part(aa.matricula, '.'::text, 2) AS matricula_base,
                    split_part(aa.matricula, '.'::text, 3) AS dep,
                    row_number() OVER (PARTITION BY (split_part(aa.matricula, '.'::text, 1)), (split_part(aa.matricula, '.'::text, 2)), (split_part(aa.matricula, '.'::text, 3)), (date(aa.data_execucao)), aa.codigo_tuss ORDER BY aa.data_execucao) AS ordem_autorizacao
                   FROM public.autorizacoes_assim aa
                )
         SELECT DISTINCT ON (s.bloco_id) s.bloco_id,
            a.guia,
            a.status,
            a.codigo_erro,
            a.descricao_erro,
            a.data_execucao,
            a.updated_at,
            (EXTRACT(epoch FROM ((a.data_execucao)::time without time zone - s.hora_inicial)) / (60)::numeric) AS diferenca_minutos
           FROM (sessoes s
             LEFT JOIN autorizacoes a ON (((a.empresa = s.empresa) AND (a.matricula_base = s.matricula) AND (a.dep = s.dep) AND (date(a.data_execucao) = s.data_atendimento) AND (a.codigo_tuss = s.codigo_tuss) AND (a.ordem_autorizacao = s.ordem_sessao))))
          ORDER BY s.bloco_id, a.updated_at DESC
        )
 SELECT b.bloco_id,
    b.paciente_id,
    b.paciente_nome,
    b.empresa,
    b.matricula,
    b.dep,
    b.carteirinha,
    b.data_atendimento,
    b.hora_inicial,
    b.codigo_tuss,
    b.convenio_nome,
    b.terapias,
    b.profissionais,
    b.quantidade_sessoes,
    mt.guia,
    mt.status AS status_assim,
    mt.codigo_erro,
    mt.descricao_erro,
    mt.data_execucao,
    mt.updated_at AS autorizacao_updated_at,
    mt.diferenca_minutos,
        CASE
            WHEN (mt.codigo_erro IS NOT NULL) THEN 'GLOSA'::text
            WHEN (mt.status = 'Liberado *'::text) THEN 'CANCELADA'::text
            WHEN (mt.status = 'Liberado'::text) THEN 'LIBERADA'::text
            WHEN (fo.matricula IS NOT NULL) THEN 'AGUARDANDO_RETORNO'::text
            ELSE 'NAO_SOLICITADA'::text
        END AS situacao,
        CASE
            WHEN (mt.codigo_erro IS NOT NULL) THEN 2
            WHEN (mt.status = 'Liberado *'::text) THEN 4
            WHEN (mt.status = 'Liberado'::text) THEN 5
            WHEN (fo.matricula IS NOT NULL) THEN 3
            ELSE 1
        END AS prioridade,
    (CURRENT_DATE - b.data_atendimento) AS dias_atraso,
        CASE
            WHEN (mt.status = 'Liberado'::text) THEN true
            ELSE false
        END AS possui_autorizacao,
        CASE
            WHEN (fo.matricula IS NOT NULL) THEN true
            ELSE false
        END AS possui_solicitacao,
        CASE
            WHEN (mt.codigo_erro IS NOT NULL) THEN concat('Glosa: ', COALESCE(mt.codigo_erro, ''::text), ' - ', COALESCE(mt.descricao_erro, ''::text))
            WHEN (mt.status = 'Liberado'::text) THEN 'Autorização confirmada pela ASSIM'::text
            WHEN (mt.status = 'Liberado *'::text) THEN 'Autorização cancelada'::text
            WHEN (fo.matricula IS NOT NULL) THEN 'Solicitação enviada aguardando retorno da ASSIM'::text
            ELSE 'Nenhuma solicitação encontrada'::text
        END AS observacao
   FROM ((public.vw_blocos_autorizaveis_assim b
     LEFT JOIN match_temporal mt ON ((mt.bloco_id = b.bloco_id)))
     LEFT JOIN fila_operacional fo ON (((fo.empresa = b.empresa) AND (fo.matricula = b.matricula) AND (fo.dep = b.dep) AND (fo.data_atendimento = b.data_atendimento) AND (fo.codigo_tuss = b.codigo_tuss) AND (fo.horario = b.hora_inicial))));


create or replace view "public"."vw_kpis_auditoria_assim" as  WITH auditoria AS (
         SELECT vw_auditoria_autorizacoes_assim.bloco_id,
            vw_auditoria_autorizacoes_assim.paciente_id,
            vw_auditoria_autorizacoes_assim.paciente_nome,
            vw_auditoria_autorizacoes_assim.empresa,
            vw_auditoria_autorizacoes_assim.matricula,
            vw_auditoria_autorizacoes_assim.dep,
            vw_auditoria_autorizacoes_assim.carteirinha,
            vw_auditoria_autorizacoes_assim.data_atendimento,
            vw_auditoria_autorizacoes_assim.hora_inicial,
            vw_auditoria_autorizacoes_assim.codigo_tuss,
            vw_auditoria_autorizacoes_assim.convenio_nome,
            vw_auditoria_autorizacoes_assim.terapias,
            vw_auditoria_autorizacoes_assim.profissionais,
            vw_auditoria_autorizacoes_assim.quantidade_sessoes,
            vw_auditoria_autorizacoes_assim.guia,
            vw_auditoria_autorizacoes_assim.status_assim,
            vw_auditoria_autorizacoes_assim.codigo_erro,
            vw_auditoria_autorizacoes_assim.descricao_erro,
            vw_auditoria_autorizacoes_assim.data_execucao,
            vw_auditoria_autorizacoes_assim.autorizacao_updated_at,
            vw_auditoria_autorizacoes_assim.diferenca_minutos,
            vw_auditoria_autorizacoes_assim.situacao,
            vw_auditoria_autorizacoes_assim.prioridade,
            vw_auditoria_autorizacoes_assim.dias_atraso,
            vw_auditoria_autorizacoes_assim.possui_autorizacao,
            vw_auditoria_autorizacoes_assim.possui_solicitacao,
            vw_auditoria_autorizacoes_assim.observacao
           FROM public.vw_auditoria_autorizacoes_assim
          WHERE (vw_auditoria_autorizacoes_assim.data_atendimento = CURRENT_DATE)
        ), liberadas_assim AS (
         SELECT count(*) AS total_liberadas
           FROM public.autorizacoes_assim
          WHERE ((date(autorizacoes_assim.data_execucao) = CURRENT_DATE) AND (autorizacoes_assim.status = 'Liberado'::text))
        )
 SELECT ( SELECT count(*) AS count
           FROM auditoria auditoria_1) AS total,
    ( SELECT liberadas_assim.total_liberadas
           FROM liberadas_assim) AS liberadas,
    count(*) FILTER (WHERE (situacao = 'NAO_SOLICITADA'::text)) AS nao_solicitadas,
    count(*) FILTER (WHERE (situacao = 'AGUARDANDO_RETORNO'::text)) AS aguardando_retorno,
    count(*) FILTER (WHERE (situacao = 'CANCELADA'::text)) AS canceladas,
    count(*) FILTER (WHERE (situacao = 'GLOSA'::text)) AS glosas
   FROM auditoria;


grant delete on table "public"."config_regras_terapias" to "anon";

grant insert on table "public"."config_regras_terapias" to "anon";

grant references on table "public"."config_regras_terapias" to "anon";

grant select on table "public"."config_regras_terapias" to "anon";

grant trigger on table "public"."config_regras_terapias" to "anon";

grant truncate on table "public"."config_regras_terapias" to "anon";

grant update on table "public"."config_regras_terapias" to "anon";

grant delete on table "public"."config_regras_terapias" to "authenticated";

grant insert on table "public"."config_regras_terapias" to "authenticated";

grant references on table "public"."config_regras_terapias" to "authenticated";

grant select on table "public"."config_regras_terapias" to "authenticated";

grant trigger on table "public"."config_regras_terapias" to "authenticated";

grant truncate on table "public"."config_regras_terapias" to "authenticated";

grant update on table "public"."config_regras_terapias" to "authenticated";

grant delete on table "public"."config_regras_terapias" to "service_role";

grant insert on table "public"."config_regras_terapias" to "service_role";

grant references on table "public"."config_regras_terapias" to "service_role";

grant select on table "public"."config_regras_terapias" to "service_role";

grant trigger on table "public"."config_regras_terapias" to "service_role";

grant truncate on table "public"."config_regras_terapias" to "service_role";

grant update on table "public"."config_regras_terapias" to "service_role";

grant delete on table "public"."crm_inconsistencias" to "anon";

grant insert on table "public"."crm_inconsistencias" to "anon";

grant references on table "public"."crm_inconsistencias" to "anon";

grant select on table "public"."crm_inconsistencias" to "anon";

grant trigger on table "public"."crm_inconsistencias" to "anon";

grant truncate on table "public"."crm_inconsistencias" to "anon";

grant update on table "public"."crm_inconsistencias" to "anon";

grant delete on table "public"."crm_inconsistencias" to "authenticated";

grant insert on table "public"."crm_inconsistencias" to "authenticated";

grant references on table "public"."crm_inconsistencias" to "authenticated";

grant select on table "public"."crm_inconsistencias" to "authenticated";

grant trigger on table "public"."crm_inconsistencias" to "authenticated";

grant truncate on table "public"."crm_inconsistencias" to "authenticated";

grant update on table "public"."crm_inconsistencias" to "authenticated";

grant delete on table "public"."crm_inconsistencias" to "service_role";

grant insert on table "public"."crm_inconsistencias" to "service_role";

grant references on table "public"."crm_inconsistencias" to "service_role";

grant select on table "public"."crm_inconsistencias" to "service_role";

grant trigger on table "public"."crm_inconsistencias" to "service_role";

grant truncate on table "public"."crm_inconsistencias" to "service_role";

grant update on table "public"."crm_inconsistencias" to "service_role";

grant delete on table "public"."paciente_medico_vigente" to "anon";

grant insert on table "public"."paciente_medico_vigente" to "anon";

grant references on table "public"."paciente_medico_vigente" to "anon";

grant select on table "public"."paciente_medico_vigente" to "anon";

grant trigger on table "public"."paciente_medico_vigente" to "anon";

grant truncate on table "public"."paciente_medico_vigente" to "anon";

grant update on table "public"."paciente_medico_vigente" to "anon";

grant delete on table "public"."paciente_medico_vigente" to "authenticated";

grant insert on table "public"."paciente_medico_vigente" to "authenticated";

grant references on table "public"."paciente_medico_vigente" to "authenticated";

grant select on table "public"."paciente_medico_vigente" to "authenticated";

grant trigger on table "public"."paciente_medico_vigente" to "authenticated";

grant truncate on table "public"."paciente_medico_vigente" to "authenticated";

grant update on table "public"."paciente_medico_vigente" to "authenticated";

grant delete on table "public"."paciente_medico_vigente" to "service_role";

grant insert on table "public"."paciente_medico_vigente" to "service_role";

grant references on table "public"."paciente_medico_vigente" to "service_role";

grant select on table "public"."paciente_medico_vigente" to "service_role";

grant trigger on table "public"."paciente_medico_vigente" to "service_role";

grant truncate on table "public"."paciente_medico_vigente" to "service_role";

grant update on table "public"."paciente_medico_vigente" to "service_role";


