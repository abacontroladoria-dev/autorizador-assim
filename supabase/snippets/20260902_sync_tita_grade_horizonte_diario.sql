-- =============================================================================
-- O horizonte da grade da TiTa passa a avançar todo dia, não só na segunda
-- =============================================================================
-- Empacota a migration 20260902100000_sync_tita_grade_horizonte_diario.sql para
-- ser colada de uma vez no SQL Editor. Ver supabase/snippets/README.md.
--
-- O SINTOMA
-- 02/09/2026, /cronograma/ocupacao-paciente: "Confirmar implantação" de uma
-- terapia nova respondia
--   "Este horário ainda não está disponível para implantação. Aguarde alguns
--    minutos e tente novamente. (1/1 sessões afetadas)"
-- para um horário genuinamente livre. Aguardar, como a mensagem manda, não
-- resolveria: faltavam até 6 dias.
--
-- A CAUSA
-- Duas fontes alimentam o mesmo fluxo, com a MESMA fórmula de horizonte ("hoje
-- → fim do mês seguinte", corrigida em 20260805150000) e cadências diferentes:
--   csv_grades_profissionais   → sync DIÁRIO. É de onde saem as sugestões.
--   grade_profissionais_tita   → sync '35 6 * * 1', SEGUNDA. É de onde
--                                resolverGradeTerapeuta tira o id_grade_terapeuta.
-- A última execução de horizonte completo foi 31/08, quando "fim do mês
-- seguinte" ainda era 30/09. Em 01/09 a fórmula passou a valer 31/10, e nada a
-- reexecutou — o próximo disparo era 08/09 06:35.
--
-- Medido em produção em 02/09, antes de aplicar:
--   data         grade_profissionais_tita   csv_grades_profissionais
--   2026-09-30                        868                        903
--   2026-10-01                          0                        855
--   2026-10-13                          0                        927
-- Toda sugestão de outubro caía em id_grade_terapeuta_nao_encontrado.
--
-- A janela é estrutural, não azar deste mês: do dia 1º até a primeira
-- segunda-feira, TODO mês, o mês seguinte inteiro fica inimplantável — calado,
-- porque a tela oferece o horário e só a confirmação falha.
--
-- A CORREÇÃO
-- A cadência do horizonte completo passa a ser diária, igual à da fonte com que
-- ele precisa concordar. Não é mais trabalho por execução: é o mesmo laço de 7
-- em 7 dias de 20260805150000 (o que evita o timeout da Edge Function), e o
-- upsert por (grade_terapeuta_id, data, hora_inicial) faz a reexecução ser
-- inofensiva. 06:20 para não concorrer com o sync-tita-grade-diario das 07:05.
--
-- Nenhum corpo de função muda aqui — só QUANDO fn_sync_tita_grade() roda.
-- =============================================================================

begin;

SELECT cron.unschedule('sync-tita-grade-semanal')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-tita-grade-semanal');

SELECT cron.schedule(
  'sync-tita-grade-horizonte-diario',
  '20 6 * * *',
  'SELECT public.fn_sync_tita_grade()'
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260902100000', 'sync_tita_grade_horizonte_diario')
ON CONFLICT (version) DO NOTHING;

commit;

-- =============================================================================
-- DEPOIS DO COMMIT — o backfill que desbloqueia agora
-- =============================================================================
-- Fora da transação de propósito: fn_sync_tita_grade() dispara net.http_post, que
-- é assíncrono e só é ENFILEIRADO no commit. Dentro do begin/commit acima o
-- disparo aconteceria de todo modo, mas separá-lo deixa explícito que esta parte
-- é efeito em sistema externo, não DDL — e permite reexecutá-la sozinha.
--
-- São ~9 chamadas (01/09 → 31/10 em blocos de 7 dias). Retornam na hora; o
-- preenchimento vem depois, conforme cada Edge Function responde.

SELECT public.fn_sync_tita_grade();

-- =============================================================================
-- VERIFICAÇÃO — rodar 2 a 3 minutos depois
-- =============================================================================
-- 1. Outubro deixou de ser zero, e a cobertura acompanha o CSV:
--      SELECT d::date AS data,
--             (SELECT count(*) FROM grade_profissionais_tita  g WHERE g.data = d::date) AS tita,
--             (SELECT count(*) FROM csv_grades_profissionais  c WHERE c.data = d::date AND c.ativo) AS csv
--      FROM generate_series('2026-09-29'::date, '2026-10-31'::date, '1 day') d
--      ORDER BY 1;
--    Esperado: nenhuma linha de dia útil com tita = 0.
--
-- 2. O job novo existe e o semanal não:
--      SELECT jobname, schedule, active FROM cron.job
--      WHERE jobname LIKE 'sync-tita-grade%';
--    Esperado: 'sync-tita-grade-horizonte-diario' ('20 6 * * *') e
--    'sync-tita-grade-diario'; NADA chamado 'sync-tita-grade-semanal'.
--
-- 3. As chamadas do backfill responderam 200:
--      SELECT status_code, count(*)
--      FROM net._http_response
--      WHERE created >= now() - interval '10 minutes'
--      GROUP BY 1;
--
-- 4. O teste que importa é na tela: implantar uma terapia em data de OUTUBRO
--    em /cronograma/ocupacao-paciente deixa de responder "ainda não está
--    disponível para implantação".
-- =============================================================================
