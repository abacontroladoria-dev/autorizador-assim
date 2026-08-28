-- ============================================================================
-- Backfill: canoniza agenda_tita.cpf por paciente (via raw_json) ⚠ PÓS RE-SYNC
-- ----------------------------------------------------------------------------
-- Mesma causa-raiz do nascimento (20260729020000): o sync nunca reatualizava
-- cpf de linha existente. A correção de código faz o re-sync refrescar as datas
-- que a TiTa ainda retorna (hoje → fim do mês seguinte). Este backfill estende a
-- correção às linhas PASSADAS.
--
-- MÉTODO (robusto): canoniza para o CPF que a TiTa DE FATO mandou
-- (raw_json->favorecido->cpf, só dígitos), escolhendo a linha de
-- data_atendimento MAIS RECENTE = re-sincronizada = cadastro atual. NÃO usa
-- updated_at (imune a backfills que setam updated_at em massa). O CPF do
-- histórico NÃO é confiável (ex.: Arthur Vitorino tinha só o CPF antigo errado
-- em todas as linhas); por isso a fonte é o raw_json da linha mais recente.
--
-- ⚠ PRÉ-REQUISITO OBRIGATÓRIO: deploy do sync corrigido + re-sync da janela ativa
-- CONCLUÍDO, para que a linha de data mais recente carregue o raw_json vigente.
-- Rodar antes do re-sync propagaria o CPF antigo.
--
-- Escopo prático: só impacta o fluxo ASSIM (a atendente copia o CPF da tela do
-- /solicitar quando o auto-preenchimento da ASSIM falha). Idempotente.
-- ============================================================================

-- ── PREVIEW (não escreve) ───────────────────────────────────────────────────
-- with canon as (
--   select distinct on (paciente_id) paciente_id,
--     nullif(regexp_replace(coalesce(raw_json->'favorecido'->>'cpf',''), '\D','','g'), '') as cpf
--   from public.agenda_tita
--   where ativo and paciente_id is not null
--     and nullif(regexp_replace(coalesce(raw_json->'favorecido'->>'cpf',''), '\D','','g'), '') is not null
--   order by paciente_id, data_atendimento desc
-- )
-- select count(*) as linhas, count(distinct a.paciente_id) as pacientes
-- from public.agenda_tita a join canon c on c.paciente_id = a.paciente_id
-- where a.ativo and a.cpf is distinct from c.cpf;

-- ── APLICAÇÃO ───────────────────────────────────────────────────────────────
with canon as (
  select distinct on (paciente_id)
    paciente_id,
    nullif(regexp_replace(coalesce(raw_json->'favorecido'->>'cpf',''), '\D', '', 'g'), '') as cpf
  from public.agenda_tita
  where ativo
    and paciente_id is not null
    and nullif(regexp_replace(coalesce(raw_json->'favorecido'->>'cpf',''), '\D', '', 'g'), '') is not null
  order by paciente_id, data_atendimento desc
)
update public.agenda_tita a
set cpf        = c.cpf,
    updated_at = now()
from canon c
where a.paciente_id = c.paciente_id
  and a.ativo
  and c.cpf is not null
  and a.cpf is distinct from c.cpf;
