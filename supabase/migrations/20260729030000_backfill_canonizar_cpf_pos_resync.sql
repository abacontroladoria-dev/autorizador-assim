-- ============================================================================
-- Backfill: canoniza agenda_tita.cpf por paciente  ⚠️ RODAR SÓ APÓS RE-SYNC ⚠️
-- ----------------------------------------------------------------------------
-- Mesma causa-raiz do nascimento (20260729020000): o sync nunca reatualizava
-- cpf de linha existente. A correção de código (sync_tita_agenda) faz o re-sync
-- refrescar as linhas das datas que a TiTa ainda retorna (hoje → fim do mês
-- seguinte). Este backfill estende a correção às linhas PASSADAS, canonizando
-- cada paciente para o CPF não-nulo mais recente.
--
-- ⚠️ PRÉ-REQUISITO OBRIGATÓRIO: deploy do sync_tita_agenda corrigido + re-sync
-- da janela ATUAL concluído. Só assim a "linha mais recente" de cada paciente
-- carrega o CPF vigente da TiTa (validado no probe 2026-07-29: o endpoint devolve
-- o CPF correto de Alice/Arthur/José Valter). Rodar ANTES do re-sync espalharia
-- o CPF ANTIGO/ERRADO (ex.: Arthur tinha só 11348638702 no histórico).
--
-- Guarda extra: canoniza só quando o CPF mais recente do paciente foi
-- sincronizado DEPOIS do início do re-sync — evita canonizar para valor velho
-- em pacientes que não têm sessão futura (não foram tocados pelo re-sync).
-- Ajuste a data-limite abaixo para o instante em que você disparou o re-sync.
-- Idempotente: só altera linha cujo cpf difere do canônico; nunca grava nulo.
-- ============================================================================

-- ── PREVIEW (rode ANTES; não escreve nada) ──────────────────────────────────
-- with canon as (
--   select distinct on (paciente_id) paciente_id, cpf
--   from public.agenda_tita
--   where ativo = true and paciente_id is not null and cpf is not null
--     and updated_at >= '2026-07-29 00:00:00+00'   -- << início do re-sync
--   order by paciente_id, updated_at desc
-- )
-- select count(*) as linhas_afetadas, count(distinct a.paciente_id) as pacientes
-- from public.agenda_tita a
-- join canon c on c.paciente_id = a.paciente_id
-- where a.ativo = true and a.cpf is distinct from c.cpf;

-- ── APLICAÇÃO ───────────────────────────────────────────────────────────────
with canon as (
  select distinct on (paciente_id)
    paciente_id,
    cpf
  from public.agenda_tita
  where ativo = true
    and paciente_id is not null
    and cpf is not null
    and updated_at >= '2026-07-29 00:00:00+00'   -- << ajuste p/ o início do re-sync
  order by paciente_id, updated_at desc
)
update public.agenda_tita a
set cpf        = c.cpf,
    updated_at = now()
from canon c
where a.paciente_id = c.paciente_id
  and a.ativo = true
  and a.cpf is distinct from c.cpf;
