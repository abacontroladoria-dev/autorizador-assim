-- terapia_id perde profissionais com mais de uma terapia.
--
-- A TiTa manda "Id Terapia" como uma única string CSV que pode trazer mais de
-- um id separado por vírgula (ex.: "2260, 2283, 2254") quando o profissional
-- tem mais de um vínculo de terapia. sync-grade-csv extrai terapia_id com
-- parseInt, que para no primeiro caractere não numérico — sobra só o 2260, os
-- outros dois somem silenciosamente.
--
-- Esta coluna guarda o valor bruto da TiTa, sem nenhum parsing, com o mesmo
-- nome do CSV original ("Id Terapia") para não haver dúvida de qual campo é
-- espelho de qual. terapia_id continua existindo e não muda de tipo/valor —
-- código que já lê terapia_id não quebra.
--
-- Escopo: só sync daqui para frente. Linhas com data anterior a hoje já estão
-- congeladas por trg_congelar_grade_passada (20260806100100), que trata
-- qualquer coluna de identidade — e esta é uma delas — como imutável no
-- passado. Backfill de histórico foi decisão explícita de não fazer: exigiria
-- desligar o trigger de congelamento, o que vai contra o propósito dele.
ALTER TABLE public.csv_grades_profissionais
  ADD COLUMN IF NOT EXISTS "Id Terapia" text;

COMMENT ON COLUMN public.csv_grades_profissionais."Id Terapia" IS
  'Valor bruto da coluna "Id Terapia" do CSV da TiTa, sem parsing — pode conter múltiplos ids separados por vírgula quando o profissional tem mais de uma terapia (ex.: "2260, 2283, 2254"). terapia_id é apenas o primeiro desses ids. Populada só a partir de 2026-08-18 (sync futuro); histórico anterior fica sem este dado por estar congelado.';
