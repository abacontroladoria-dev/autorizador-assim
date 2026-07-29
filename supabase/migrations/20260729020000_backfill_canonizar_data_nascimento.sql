-- ============================================================================
-- Backfill: canoniza agenda_tita.data_nascimento por paciente
-- ----------------------------------------------------------------------------
-- Causa-raiz (confirmada 2026-07-29): o sync_tita_agenda nunca reatualizava
-- data_nascimento de uma linha já existente. Correções de cadastro na TiTa só
-- chegavam nas linhas NOVAS; as antigas ficavam congeladas com nascimento
-- nulo/errado. Como o badge do /solicitar mostra o valor da linha DAQUELA data,
-- o mesmo paciente aparecia com nascimento divergente conforme o dia aberto.
--
-- A correção de origem está no código (sync_tita_agenda passa a refrescar
-- cpf/data_nascimento/raw_json quando a TiTa traz valor não-nulo diferente),
-- mas o re-sync só toca datas que a TiTa ainda retorna (hoje → fim do mês
-- seguinte). Este backfill conserta as linhas PASSADAS (inclui as retroativas
-- do item 5), canonizando cada paciente para o nascimento não-nulo mais recente.
--
-- Segurança: validado com a recepção que "não-nulo mais recente = cadastro
-- correto" (nascimento vem confiável do endpoint agendamento). Idempotente:
-- só altera linha cujo valor difere do canônico; nunca grava nulo.
--
-- NÃO faz nada para CPF (o histórico não contém, de forma confiável, o CPF
-- correto — ex.: Arthur Vitorino). CPF é corrigido só via re-sync após a
-- recepção acertar o cadastro na TiTa.
-- ============================================================================

-- ── PREVIEW (rode ANTES de aplicar; não escreve nada) ───────────────────────
-- Quantas linhas e pacientes seriam alterados, e amostra do de/para:
--
-- with canon as (
--   select distinct on (paciente_id) paciente_id, data_nascimento
--   from public.agenda_tita
--   where ativo = true and paciente_id is not null and data_nascimento is not null
--   order by paciente_id, updated_at desc
-- )
-- select count(*) as linhas_afetadas,
--        count(distinct a.paciente_id) as pacientes_afetados
-- from public.agenda_tita a
-- join canon c on c.paciente_id = a.paciente_id
-- where a.ativo = true
--   and a.data_nascimento is distinct from c.data_nascimento;

-- ── APLICAÇÃO ───────────────────────────────────────────────────────────────
with canon as (
  select distinct on (paciente_id)
    paciente_id,
    data_nascimento
  from public.agenda_tita
  where ativo = true
    and paciente_id is not null
    and data_nascimento is not null
  order by paciente_id, updated_at desc
)
update public.agenda_tita a
set data_nascimento = c.data_nascimento,
    updated_at      = now()
from canon c
where a.paciente_id = c.paciente_id
  and a.ativo = true
  and a.data_nascimento is distinct from c.data_nascimento;
