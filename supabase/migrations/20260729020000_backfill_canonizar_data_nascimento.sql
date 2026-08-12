-- ============================================================================
-- Backfill: canoniza agenda_tita.data_nascimento por paciente (via raw_json)
-- ----------------------------------------------------------------------------
-- Causa-raiz (confirmada 2026-07-29): o sync_tita_agenda nunca reatualizava
-- data_nascimento de uma linha já existente. Correções de cadastro na TiTa só
-- chegavam nas linhas NOVAS; as antigas ficavam congeladas com nascimento
-- nulo/errado. Como o badge do /solicitar mostra o valor da linha DAQUELA data,
-- o mesmo paciente aparecia com nascimento divergente conforme o dia aberto.
-- (O CPF/nascimento do /solicitar é a fonte de copiar-e-colar da atendente
-- quando o auto-preenchimento da ASSIM falha — daí a correção importar.)
--
-- A correção de origem está no código (sync_tita_agenda passa a refrescar
-- cpf/data_nascimento/raw_json quando a TiTa traz valor não-nulo diferente).
-- Este backfill conserta as linhas PASSADAS que o re-sync não toca.
--
-- MÉTODO (robusto): canoniza para o nascimento que a TiTa DE FATO mandou
-- (raw_json->favorecido->data_nascimento), escolhendo a linha de
-- data_atendimento MAIS RECENTE — que é a re-sincronizada = cadastro atual.
-- NÃO usa updated_at (um backfill anterior que ordenava por updated_at foi
-- corrompido quando outro backfill setou updated_at=now() em massa; ordenar por
-- data_atendimento é imune a isso). Idempotente: só altera linha divergente.
--
-- PRÉ-REQUISITO: deploy do sync_tita_agenda corrigido + re-sync da janela ativa,
-- para que as linhas de data mais recente carreguem o raw_json vigente da TiTa.
-- ============================================================================

-- ── PREVIEW (não escreve) ───────────────────────────────────────────────────
-- with canon as (
--   select distinct on (paciente_id) paciente_id,
--     to_date(raw_json->'favorecido'->>'data_nascimento','DD/MM/YYYY') as nasc
--   from public.agenda_tita
--   where ativo and paciente_id is not null
--     and raw_json->'favorecido'->>'data_nascimento' ~ '^\d{2}/\d{2}/\d{4}$'
--   order by paciente_id, data_atendimento desc
-- )
-- select count(*) as linhas, count(distinct a.paciente_id) as pacientes
-- from public.agenda_tita a join canon c on c.paciente_id = a.paciente_id
-- where a.ativo and a.data_nascimento is distinct from c.nasc;

-- ── APLICAÇÃO ───────────────────────────────────────────────────────────────
with canon as (
  select distinct on (paciente_id)
    paciente_id,
    to_date(raw_json->'favorecido'->>'data_nascimento','DD/MM/YYYY') as nasc
  from public.agenda_tita
  where ativo
    and paciente_id is not null
    and raw_json->'favorecido'->>'data_nascimento' ~ '^\d{2}/\d{2}/\d{4}$'
  order by paciente_id, data_atendimento desc
)
update public.agenda_tita a
set data_nascimento = c.nasc,
    updated_at      = now()
from canon c
where a.paciente_id = c.paciente_id
  and a.ativo
  and c.nasc is not null
  and a.data_nascimento is distinct from c.nasc;
