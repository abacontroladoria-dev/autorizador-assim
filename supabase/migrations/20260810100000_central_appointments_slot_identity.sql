-- Central de Atendimento — Agendamentos: identidade da vaga (slot)
-- Depends on:
--   20260701010000_central_nina_tables.sql (central.appointments)
--   20260701010100_central_nina_indexes.sql (idx_appointments_org_date, ...)
--
-- PROBLEMA QUE ESTA MIGRATION RESOLVE
--
-- central.appointments nasceu como "registro de intenção" genérico, com apenas
-- date + time + duration + tita_session_id. Isso é suficiente para uma agenda
-- comercial (demo/reunião), mas não para a agenda clínica: aqui um agendamento
-- ocupa a vaga de UM profissional específico, para UMA terapia, em UMA sala.
--
-- A vaga livre vem de public.vw_grade_base com status_agendamento = 'Livre'.
-- Medido em 2026-08-10 sobre 97.048 linhas de csv_grades_profissionais:
--   Agendado → 96.427 linhas, 96.427 com paciente_id
--   Livre    →    619 linhas,       0 com paciente_id e 0 com tita_agendamento_id
--
-- Ou seja: a vaga livre NÃO é um registro endereçável do TiTa — ela não tem id.
-- A TiTa a devolve com paciente_nome = 'Ainda não selecionado'. A única chave
-- que a identifica é a tupla natural (profissional_id, data, hora_inicial).
--
-- Consequência para tita_session_id: ele continua nullable e continua sendo o
-- vínculo com o TiTa, mas só pode ser preenchido DEPOIS que alguém efetivamente
-- cria a sessão no TiTa. Ele não serve para reservar, apenas para reconciliar.
--
-- Sem as colunas abaixo, dois agendamentos podiam cair na mesma vaga do mesmo
-- profissional sem que nada detectasse, e a recepção não tinha como saber qual
-- vaga honrar no TiTa.
--
-- ROLLBACK:
--   drop index if exists central.uq_appointments_slot_ocupada;
--   drop index if exists central.idx_appointments_org_profissional;
--   alter table central.appointments drop constraint if exists ck_appointments_status;
--   alter table central.appointments
--     drop column if exists tita_paciente_id,
--     drop column if exists sala_nome,
--     drop column if exists unidade_id,
--     drop column if exists terapia_nome,
--     drop column if exists terapia_id,
--     drop column if exists profissional_nome,
--     drop column if exists profissional_id;

-- ============================================================================
-- ALTER TABLE: central.appointments — identidade da vaga
--
-- Os campos *_nome são desnormalizados de propósito. A grade é congelada
-- (csv_grades_profissionais nunca sofre DELETE físico, linhas antigas viram
-- ativo = false), então o nome no momento da reserva é um fato histórico que
-- não deve mudar quando o profissional é desligado — o prefixo INATIVO- que a
-- TiTa aplica ao nome não deve reescrever agendamentos já registrados.
--
-- tita_paciente_id:
--   Paciente do TiTa que ocupará a vaga. BIGINT, não FK — o TiTa não é
--   controlado por este banco (mesma decisão de central.contact_patient_links).
--   Nullable: numa triagem de lead novo o paciente ainda não existe no TiTa.
-- ============================================================================
alter table central.appointments
  add column if not exists profissional_id   bigint,
  add column if not exists profissional_nome text,
  add column if not exists terapia_id        bigint,
  add column if not exists terapia_nome      text,
  add column if not exists unidade_id        bigint,
  add column if not exists sala_nome         text,
  add column if not exists tita_paciente_id  bigint;

comment on column central.appointments.profissional_id is
  'profissional_id do TiTa (vw_grade_base.profissional_id). Junto com date e time forma a identidade da vaga reservada.';
comment on column central.appointments.profissional_nome is
  'Nome do profissional no momento da reserva. Desnormalizado: é fato histórico e não deve mudar com desligamento (prefixo INATIVO-).';
comment on column central.appointments.terapia_id is
  'terapia_id do TiTa. A vaga livre é sempre de uma terapia específica — não é um horário genérico.';
comment on column central.appointments.unidade_id is
  'unidade_id do TiTa (280 = Realengo nos syncs atuais).';
comment on column central.appointments.tita_paciente_id is
  'Paciente do TiTa que ocupará a vaga. Nullable: em triagem de lead novo o paciente ainda não existe no TiTa.';

-- ============================================================================
-- CHECK: central.appointments.status
--
-- A coluna nasceu como text livre com default 'scheduled' e os valores válidos
-- só existiam no comentário da migration. Sem constraint, um typo ('confirmed '
-- com espaço, 'Confirmado') passa e some do índice parcial abaixo, o que
-- silenciosamente libera a vaga para reserva dupla.
--
-- NOT VALID: a tabela está vazia hoje, mas manter a validação barata e não
-- travar a migration caso ela rode depois de dados legados entrarem.
-- ============================================================================
alter table central.appointments
  drop constraint if exists ck_appointments_status;

alter table central.appointments
  add constraint ck_appointments_status
  check (status in ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'))
  not valid;

-- ============================================================================
-- INDEX: uq_appointments_slot_ocupada
--
-- Guarda de reserva dupla no banco, não na aplicação: a mesma vaga
-- (profissional + data + hora) não pode ter dois agendamentos que a ocupem.
--
-- O predicado inclui apenas os status que de fato OCUPAM a vaga:
--   scheduled / confirmed → ocupam
--   cancelled / no_show   → liberam a vaga (o horário volta a ser oferecível)
--   completed             → passado, não disputa vaga futura
--
-- Isso é o que permite cancelar e reagendar para o mesmo horário sem
-- colidir com o registro cancelado.
--
-- profissional_id is not null: agendamentos administrativos (reunião com
-- responsável, followup) não consomem vaga de grade e ficam fora da guarda.
-- ============================================================================
create unique index if not exists uq_appointments_slot_ocupada
  on central.appointments (profissional_id, date, "time")
  where profissional_id is not null
    and status in ('scheduled', 'confirmed');

-- ============================================================================
-- INDEX: idx_appointments_org_profissional
--
-- Consulta "quais vagas deste profissional já estão reservadas na janela X"
-- roda a cada oferta de horário feita pelo agente. Sem este índice ela vira
-- seq scan em appointments a cada mensagem do WhatsApp.
-- ============================================================================
create index if not exists idx_appointments_org_profissional
  on central.appointments (organization_id, profissional_id, date)
  where profissional_id is not null;
