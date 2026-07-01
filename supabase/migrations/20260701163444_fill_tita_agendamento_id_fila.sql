-- Preenche fila_autorizacoes.tita_agendamento_id a partir de agenda_tita.
--
-- Contexto: a coluna existe no schema mas está NULL em todos os registros —
-- nunca houve lógica que a preenchesse. O relacionamento entre as tabelas já é
-- feito pelo sistema via soft-join de 4 campos (ver vw_central_pacientes):
--   (fa.paciente_id)::bigint = ag.paciente_id
--   AND fa.data_atendimento  = ag.data_atendimento
--   AND fa.horario           = ag.hora_inicial
--   AND lower(trim(fa.terapia_nome)) = lower(trim(ag.terapia_nome))
--
-- Esta migration é puramente ADITIVA: só escreve a coluna tita_agendamento_id.
-- Não cria FK, não altera views/RLS, não toca no UNIQUE INDEX existente
-- (paciente_id, data_atendimento, horario, terapia_nome).

-- =====================================================================
-- (a) Função de lookup reutilizável — encapsula a chave de match.
--     Filtra ativo = true (agenda_tita é versionada; a linha verdadeira é a
--     ativa) e, por segurança contra múltiplos ativos, pega a mais recente.
-- =====================================================================
create or replace function public.fn_match_tita_agendamento_id(
  p_paciente_id   text,
  p_data          date,
  p_horario       time,
  p_terapia_nome  text
) returns bigint
language sql
stable
as $$
  select at.tita_agendamento_id
  from public.agenda_tita at
  where at.ativo = true
    and p_paciente_id is not null
    and p_paciente_id ~ '^\d+$'                    -- evita erro de cast em texto não-numérico
    and at.paciente_id = (p_paciente_id)::bigint
    and at.data_atendimento = p_data
    and at.hora_inicial = p_horario
    and lower(trim(coalesce(at.terapia_nome, ''))) = lower(trim(coalesce(p_terapia_nome, '')))
  order by at.updated_at desc nulls last
  limit 1
$$;

-- =====================================================================
-- (b) Trigger BEFORE INSERT — preenche automaticamente em QUALQUER caminho
--     de inserção (frontend criarAutorizacao, trigger inserir_na_fila_autorizacoes,
--     edge functions). Só mexe em NEW.tita_agendamento_id; se não achar match,
--     deixa NULL (comportamento atual). Nunca falha o insert.
-- =====================================================================
create or replace function public.fn_set_tita_agendamento_id()
returns trigger
language plpgsql
as $$
begin
  if new.tita_agendamento_id is null then
    new.tita_agendamento_id := public.fn_match_tita_agendamento_id(
      new.paciente_id,
      new.data_atendimento,
      new.horario,
      new.terapia_nome
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_tita_agendamento_id on public.fila_autorizacoes;
create trigger trg_set_tita_agendamento_id
  before insert on public.fila_autorizacoes
  for each row
  execute function public.fn_set_tita_agendamento_id();

-- =====================================================================
-- (c) Backfill único das linhas NULL existentes, garantindo 1:1.
--     row_number() por tita_agendamento_id impede que a normalização do
--     terapia_nome faça duas linhas convergirem para a mesma sessão.
--     Linhas que empatariam ficam NULL (inspeção manual), nunca duplicam.
-- =====================================================================
with candidatos as (
  select
    fa.id,
    public.fn_match_tita_agendamento_id(
      fa.paciente_id,
      fa.data_atendimento,
      fa.horario,
      fa.terapia_nome
    ) as tid
  from public.fila_autorizacoes fa
  where fa.tita_agendamento_id is null
),
ranqueados as (
  select
    id,
    tid,
    row_number() over (
      partition by tid
      order by id
    ) as rn
  from candidatos
  where tid is not null
)
update public.fila_autorizacoes fa
set tita_agendamento_id = r.tid
from ranqueados r
where fa.id = r.id
  and r.rn = 1;
