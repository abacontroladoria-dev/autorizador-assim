-- Fase 1.1 — Fundação para congelar o histórico de csv_grades_profissionais.
--
-- Contexto: a TiTa apaga agendamentos passados quando o cadastro muda (o
-- desligamento de um terapeuta remove retroativamente todos os atendimentos
-- dele). A tabela hoje é reescrita todo dia por DELETE+INSERT na Edge Function
-- sync-grade-csv, então qualquer releitura de uma data passada perderia
-- histórico. A partir desta fase o sync passa a MERGE (só INSERT/UPDATE) e o
-- passado fica imutável — ver migration do trigger trg_congelar_grade_passada.
--
-- Sem DELETE físico, precisamos de soft delete: uma sessão futura cancelada ou
-- remarcada na TiTa não pode simplesmente desaparecer, senão a linha antiga e a
-- nova coexistiriam para sempre na janela futura. Mesmo padrão que agenda_tita
-- já usa desde 20260530000000_versioning_agenda_tita.sql.
--
-- Nenhum índice novo aqui de propósito: as fatias do sync são de 7 dias
-- (~4 mil linhas) e o idx_csv_grades_data_unidade (data, unidade_id) existente
-- já as resolve. Índice de chave natural fica para a Fase 2, depois da carga
-- completa do histórico.

ALTER TABLE public.csv_grades_profissionais
  -- false = linha que a TiTa deixou de retornar (ou foi substituída por outra
  -- versão). Nunca apagamos; todo consumidor novo filtra ativo = true.
  ADD COLUMN IF NOT EXISTS ativo             boolean NOT NULL DEFAULT true,
  -- 'alterado' → campos-chave mudaram na TiTa e uma nova linha entrou no lugar
  -- 'excluido' → agendamento não voltou mais na resposta da TiTa
  -- NULL       → linha ativa
  ADD COLUMN IF NOT EXISTS motivo_inativacao text,
  -- 'tita_csv'   → veio da API csv_grade_profissionais (data >= 2026-08-05)
  -- 'backup_xls' → veio do backup agendamentos_profissionais_20260101_20260831
  --                (data <= 2026-08-04), única fonte que ainda descreve Jan–Jun
  ADD COLUMN IF NOT EXISTS origem            text NOT NULL DEFAULT 'tita_csv',
  -- Quando o sync gravou ESTA versão da linha. Não é carimbo por execução: o
  -- sync não reescreve linha inalterada (seria dezenas de milhares de versões
  -- de linha por dia no WAL, e esta tabela já apareceu no diagnóstico de Disk
  -- IO do projeto). O soft delete não depende desta coluna — a Edge Function
  -- calcula em memória o que veio e o que não veio da TiTa.
  ADD COLUMN IF NOT EXISTS visto_em          timestamptz;

COMMENT ON COLUMN public.csv_grades_profissionais.ativo IS
  'false = linha que a TiTa deixou de retornar ou que foi substituída. Nunca há DELETE físico nesta tabela.';
COMMENT ON COLUMN public.csv_grades_profissionais.motivo_inativacao IS
  'alterado | excluido | NULL (ativa). Mesma semântica de agenda_tita.motivo_inativacao.';
COMMENT ON COLUMN public.csv_grades_profissionais.origem IS
  'tita_csv (API, data >= 2026-08-05) | backup_xls (seed do histórico, data <= 2026-08-04).';
COMMENT ON COLUMN public.csv_grades_profissionais.visto_em IS
  'Quando o sync gravou esta versão da linha. Linha inalterada não é reescrita, então não é um carimbo por execução.';
