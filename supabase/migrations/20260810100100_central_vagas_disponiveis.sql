-- Central de Atendimento — Motor de disponibilidade
-- Depends on:
--   20260810100000_central_appointments_slot_identity.sql (colunas de vaga em appointments)
--   public.vw_grade_base (20260806* — leitura única da grade)
--
-- POR QUE ISSO É UMA FUNÇÃO NO BANCO E NÃO CÓDIGO NO FRONTEND
--
-- A disponibilidade é a subtração de duas fontes que vivem em schemas diferentes:
--   public.vw_grade_base       → a vaga existe na grade do TiTa (status 'Livre')
--   central.appointments       → a vaga já foi prometida por nós a alguém
--
-- PostgREST não faz join entre schemas, então fazer isso no cliente exigiria
-- duas requisições e a subtração em memória — e, pior, cada consumidor
-- (a página de Agendamentos e o agente de WhatsApp) reimplementaria a regra,
-- que é exatamente como as duas telas passam a divergir. Uma função só,
-- consumida pelos dois, mantém a regra em um lugar.
--
-- SECURITY INVOKER (padrão, não DEFINER):
--   O chamador precisa de SELECT em public.vw_grade_base e em
--   central.appointments por direito próprio. A RLS de appointments continua
--   valendo — não há escalonamento de privilégio por aqui.
--
-- ROLLBACK:
--   drop function if exists central.listar_vagas_disponiveis(date, date, bigint, bigint, bigint, integer);
--   drop function if exists central.vaga_esta_disponivel(bigint, date, time);

-- ============================================================================
-- FUNCTION: central.listar_vagas_disponiveis
--
-- Uma "vaga" é a tupla (profissional_id, data, hora_inicial). Medido em
-- 2026-08-10: 619 vagas livres na base, 619 tuplas distintas — a tupla é chave
-- natural, o que também é o que a unique index uq_appointments_slot_ocupada
-- presume.
--
-- Filtro de passado (p_data_inicio default = hoje em São Paulo):
--   Oferecer horário que já passou é o erro mais visível que um atendente
--   automático pode cometer. No dia corrente a comparação é por hora, não só
--   por data — às 14h não se oferece a vaga das 09h20.
--
-- p_terapia_id filtra por terapia_id, nunca por terapia_nome:
--   34 das 619 vagas trazem terapia_nome como lista separada por vírgula
--   ("Aplicador ABA (PS), Psicopedagogia") porque o profissional atende mais de
--   uma especialidade naquele horário. O nome é texto de exibição; só o id é
--   chave confiável de filtro.
--
-- Janela default de 30 dias: a grade só é populada algumas semanas à frente
-- (em 2026-08-10 o horizonte ia até 2026-08-19). Pedir mais que isso não
-- devolve mais vaga, só custa scan.
-- ============================================================================
create or replace function central.listar_vagas_disponiveis(
  p_data_inicio     date    default null,
  p_data_fim        date    default null,
  p_terapia_id      bigint  default null,
  p_profissional_id bigint  default null,
  p_unidade_id      bigint  default null,
  p_limite          integer default 50
)
returns table (
  data              date,
  dia_semana        text,
  hora_inicial      time,
  hora_final        time,
  profissional_id   bigint,
  profissional_nome text,
  terapia_id        bigint,
  terapia_nome      text,
  unidade_id        bigint,
  unidade_nome      text,
  sala_nome         text
)
language sql
stable
set search_path = public, central
as $$
  with agora as (
    select (now() at time zone 'America/Sao_Paulo') as ts
  ),
  janela as (
    select
      coalesce(p_data_inicio, (select ts::date from agora))                as inicio,
      coalesce(p_data_fim,    (select ts::date from agora) + interval '30 days') as fim
  )
  select
    g.data,
    g.dia_semana,
    g.hora_inicial,
    g.hora_final,
    g.profissional_id,
    g.profissional_nome,
    g.terapia_id,
    g.terapia_nome,
    g.unidade_id,
    g.unidade_nome,
    g.sala_nome
  from public.vw_grade_base g
  cross join agora a
  cross join janela j
  where g.status_agendamento = 'Livre'
    and g.profissional_id is not null
    and g.hora_inicial     is not null
    and g.data >= j.inicio
    and g.data <= j.fim::date
    -- No dia corrente, descarta vaga cujo horário já passou
    and (g.data > a.ts::date or g.hora_inicial > a.ts::time)
    and (p_terapia_id      is null or g.terapia_id      = p_terapia_id)
    and (p_profissional_id is null or g.profissional_id = p_profissional_id)
    and (p_unidade_id      is null or g.unidade_id      = p_unidade_id)
    -- A vaga não pode já ter sido prometida por nós
    and not exists (
      select 1
      from central.appointments ap
      where ap.profissional_id = g.profissional_id
        and ap.date            = g.data
        and ap.time            = g.hora_inicial
        and ap.status in ('scheduled', 'confirmed')
    )
  order by g.data, g.hora_inicial, g.profissional_nome
  limit greatest(1, least(coalesce(p_limite, 50), 500));
$$;

comment on function central.listar_vagas_disponiveis(date, date, bigint, bigint, bigint, integer) is
  'Vagas ofertáveis: grade do TiTa com status_agendamento = Livre, menos as vagas já prometidas em central.appointments, menos o passado. Fonte única para a página de Agendamentos e para o agente de WhatsApp.';

grant execute on function central.listar_vagas_disponiveis(date, date, bigint, bigint, bigint, integer)
  to authenticated, service_role;

-- ============================================================================
-- FUNCTION: central.vaga_esta_disponivel
--
-- Checagem pontual de uma vaga específica, para o instante da reserva.
--
-- Por que existe além da unique index: a index rejeita a reserva dupla, mas com
-- erro 23505 genérico, e não distingue "essa vaga nunca existiu na grade" de
-- "essa vaga existia e alguém pegou primeiro". O agente precisa dessa diferença
-- para responder ao paciente com a frase certa. A index continua sendo a
-- garantia real contra corrida — esta função é a checagem amigável.
-- ============================================================================
create or replace function central.vaga_esta_disponivel(
  p_profissional_id bigint,
  p_data            date,
  p_hora            time
)
returns table (
  existe_na_grade boolean,
  ja_reservada    boolean,
  no_passado      boolean
)
language sql
stable
set search_path = public, central
as $$
  select
    exists (
      select 1 from public.vw_grade_base g
      where g.profissional_id   = p_profissional_id
        and g.data              = p_data
        and g.hora_inicial      = p_hora
        and g.status_agendamento = 'Livre'
    ) as existe_na_grade,
    exists (
      select 1 from central.appointments ap
      where ap.profissional_id = p_profissional_id
        and ap.date            = p_data
        and ap.time            = p_hora
        and ap.status in ('scheduled', 'confirmed')
    ) as ja_reservada,
    (p_data + p_hora) <= (now() at time zone 'America/Sao_Paulo') as no_passado;
$$;

comment on function central.vaga_esta_disponivel(bigint, date, time) is
  'Diagnóstico de uma vaga específica no instante da reserva: existe na grade, já foi reservada, ou está no passado. Separa os três motivos de recusa para o agente responder com precisão.';

grant execute on function central.vaga_esta_disponivel(bigint, date, time)
  to authenticated, service_role;
