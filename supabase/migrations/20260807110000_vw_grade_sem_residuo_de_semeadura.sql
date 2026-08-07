-- Fase 2.6 — Tirar da grade o resíduo da semeadura do backup XLS.
--
-- O achado
-- ────────
-- Conferindo julho/2026 contra o CSV da TiTa, o banco pagava R$ 360,00 a mais
-- que o upload. A origem são 116 linhas com `origem = 'backup_xls'` e
-- `tita_agendamento_id IS NULL`, inseridas pelo movimento A de
-- scripts/reconciliar-grade-sobreposicao.js, que tratou o XLS como autoridade
-- sobre quais agendamentos existem na janela 01/07 → 04/08.
--
-- O XLS estava errado. Conferido slot a slot (data + hora + profissional):
--
--     93 delas caem em horário que a própria TiTa reporta como 'Livre'
--     22 a TiTa não conhece de forma nenhuma
--      1 a TiTa também reporta como 'Agendado'
--
-- Como pagam sem existir
-- ──────────────────────
-- Elas não geram PA: a captura de execução casa por `tita_agendamento_id`, e sem
-- id nunca são alcançadas — ficam para sempre "não evoluídas". Mas não são
-- 'Cancelado', então entram em `diasPorEsp` no cálculo da remuneração e
-- transformam o dia em dia trabalhado, gerando DIÁRIA.
--
-- O caso que fecha o argumento: Patricia da Silva Souza Santos, 08/07/2026. As
-- 10 sessões dela naquele dia estão TODAS 'Cancelado' na TiTa. Uma única linha
-- fantasma às 08:40 — exatamente onde a TiTa diz 'Livre' — faz o dia contar e
-- paga R$ 300,00 de diária de Fonoaudiologia por um dia inteiramente cancelado.
--
-- Por que o recorte é por data, e estreito
-- ────────────────────────────────────────
-- "backup_xls sem id" NÃO pode ser filtrado em geral: antes de 01/07 são 93.797
-- linhas — o histórico de janeiro a junho inteiro, cuja única fonte é o XLS e
-- que nunca teve id por construção. Filtrar amplo apagaria seis meses.
--
-- A partir de 2026-07-01 a situação se inverte, e é o mesmo piso de
-- PISO_EXECUCAO_GRADE em lib/remuneracao/gradeRemuneracao.ts (medido: 30/06 tem
-- 0% de cobertura de execução, 01/07 tem 98,2%). Nessa janela quem descreve a
-- agenda é o sync: julho tem 19.000 linhas 'tita_csv' contra as 116 do XLS, e
-- nenhuma linha 'backup_xls' de julho tem id. Ou seja, ali o XLS não acrescenta
-- sessão nenhuma — só duplica slot com informação pior.
--
-- Alcance medido antes de escrever isto: exatamente 116 linhas, todas em julho
-- (agosto já tem zero), todas 'Agendado', **nenhuma com execução capturada e
-- nenhuma com tratativa**. Não há o que se perder — nem pagamento, nem evolução,
-- nem histórico anterior ao piso.
--
-- Não é inativação: as linhas continuam na tabela. O congelamento proíbe
-- ativo = false em data passada, e com razão. Elas saem da VIEW, que é o ponto
-- único de leitura — quem quiser auditar o resíduo consulta a tabela.

CREATE OR REPLACE VIEW public.vw_grade_base
WITH (security_invoker = true) AS
SELECT
  id,
  data,
  dia_semana,
  hora_inicial,
  hora_final,
  paciente_id,
  paciente_nome,
  profissional_id,
  profissional_nome,
  terapia_id,
  terapia_nome,
  terapia_exibicao_id,
  terapia_exibicao_nome,
  sala_nome,
  unidade_id,
  unidade_nome,
  convenio_nome,
  status_agendamento,
  tita_agendamento_id,
  origem,

  status_execucao,
  justificativa,
  possui_tratativa,
  tratativa_profissional_id,
  tratativa_profissional_nome,
  tratativa_criada_em,
  tratativa_origem,
  evolucao_vinculo,
  criado_em_tita,
  excluido_em_tita,

  EXTRACT(year  FROM data)::int AS ano,
  EXTRACT(month FROM data)::int AS mes,
  to_char(data, 'YYYY-MM')      AS ano_mes,
  EXTRACT(week  FROM data)::int AS semana_iso,

  (EXTRACT(day FROM data)::int - 1) / 7 + 1       AS semana_do_mes,
  (EXTRACT(day FROM data)::int - 1) / 7 + 1 = 1   AS is_primeira_semana,
  (EXTRACT(day FROM data)::int - 1) / 7
    = (EXTRACT(day FROM (date_trunc('month', data) + interval '1 month' - interval '1 day'))::int - 1) / 7
                                                  AS is_ultima_semana,

  data = date_trunc('month', data)::date          AS is_primeiro_dia_mes,
  data = (date_trunc('month', data) + interval '1 month' - interval '1 day')::date
                                                  AS is_ultima_data_mes,
  EXTRACT(isodow FROM data)::int BETWEEN 1 AND 5  AS is_dia_util,

  data < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS is_congelado

FROM public.csv_grades_profissionais
WHERE ativo
  AND COALESCE(profissional_nome, '') NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Testes Técnicos%'
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Combinar Consulta%'
  -- Resíduo da semeadura do XLS dentro da janela em que o sync é a autoridade.
  -- Ver o cabeçalho: 116 linhas de julho/2026, nenhuma com execução, que só
  -- serviam para gerar diária em dia que a TiTa reporta vazio ou cancelado.
  AND NOT (origem = 'backup_xls' AND tita_agendamento_id IS NULL AND data >= DATE '2026-07-01');

COMMENT ON VIEW public.vw_grade_base IS
  'Ponto único de leitura de csv_grades_profissionais. Garante linha ativa, sem profissional_cpf, sem profissional de teste e sem resíduo da semeadura do XLS a partir de 2026-07-01 (linha sem tita_agendamento_id nessa janela é slot que a TiTa reporta como Livre — não paga PA e só inflava diária). NÃO recorta unidade nem status (isso é WHERE do chamador — há consumidor legítimo de todas as unidades e de slots Livre). Traz identidade + execução + recortes de calendário. Semana = calendário do mês (1-7, 8-14, ...), não ISO.';
