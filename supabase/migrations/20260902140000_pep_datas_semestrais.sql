-- Datas nas entregas semestrais da PEP (OE/RT/PIC).
--
-- Por que isto NÃO é registro de jornada (PRD §2.1/§2.2, princípios
-- inegociáveis de compliance):
--
--   * data_planejada é a data acordada no Planejamento das periódicas, que o
--     próprio PRD trata como data — §2.6 ("alteração de data é negociada,
--     nunca imposta") e §12.6 ("Planejamento das periódicas editável pelo
--     prestador; alteração de data pela clínica exige negociação").
--   * data_entrega é a data própria do documento entregue, expressamente
--     permitida pelo §2.2: "Documentos de evidência podem ter data própria;
--     o registro no sistema é mensal".
--
-- A COMPETÊNCIA continua sendo a unidade de apuração (§3, §6): ela é derivada
-- da data, nunca substituída por ela. Nenhuma das colunas guarda hora (§2.2),
-- e nenhuma delas mede atividade do prestador — a existência do documento é
-- que é medida (§2.3/§2.4).
--
-- O caso que motivou: planejado 07/01/2026, entregue 04/04/2026. A entrega
-- entra na competência de abril E dispara a devolução integral dos ajustes já
-- aplicados desde janeiro (§9.6) — regra que o motor já implementa. As datas
-- só tornam o atraso visível na tela.

ALTER TABLE pep_planejamento_semestral
  ADD COLUMN IF NOT EXISTS data_planejada date;

ALTER TABLE pep_registros_entrega
  ADD COLUMN IF NOT EXISTS data_entrega date;

COMMENT ON COLUMN pep_planejamento_semestral.data_planejada IS
  'Data acordada no Planejamento das periódicas (PRD §2.6/§12.6). competencia_planejada continua sendo a unidade de apuração (§6) e é derivada desta data. Sem hora (§2.2).';

COMMENT ON COLUMN pep_registros_entrega.data_entrega IS
  'Data própria do documento de evidência entregue (PRD §2.2). NÃO é registro de atividade nem de jornada (§2.1); a apuração continua por competência (§3). Sem hora.';

-- Backfill: planejamentos existentes só tinham a competência (AAAA-MM), então
-- a data assumida é o 1º dia dela — melhor que NULL, e o usuário ajusta na tela.
UPDATE pep_planejamento_semestral
SET data_planejada = (competencia_planejada || '-01')::date
WHERE data_planejada IS NULL
  AND competencia_planejada ~ '^\d{4}-\d{2}$';

-- Backfill: entregas já marcadas usam a data do ato administrativo que as
-- registrou (entregue_em) como melhor estimativa da data do documento.
UPDATE pep_registros_entrega
SET data_entrega = (entregue_em AT TIME ZONE 'America/Sao_Paulo')::date
WHERE data_entrega IS NULL
  AND status = 'entregue'
  AND entregue_em IS NOT NULL;
