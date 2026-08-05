-- Fase 1.6 — View base da grade, com os recortes de calendário já calculados.
--
-- Com o histórico de Jan–Jun/2026 na tabela, os recortes que a operação pede
-- ("só a primeira semana de cada mês", "só a última", "semana 3 de março") viram
-- consulta corriqueira. Em vez de uma view por recorte — vw_primeira_semana,
-- vw_ultima_semana, vw_penultima… — esta view expõe as colunas derivadas e cada
-- recorte vira um WHERE, sem migration nova:
--
--   SELECT * FROM vw_grade_base WHERE is_primeira_semana AND ano_mes = '2026-03';
--   SELECT * FROM vw_grade_base WHERE semana_do_mes = 3;
--   SELECT * FROM vw_grade_base WHERE is_ultima_data_mes;
--
-- Definição de semana: CALENDÁRIO do mês (dias 1–7 = semana 1, 8–14 = semana 2,
-- 15–21 = 3, 22–28 = 4, 29–31 = 5), não semana ISO. Decisão de produto: é o que
-- as regras da clínica usam e não tem a ambiguidade da ISO, em que a "primeira
-- semana" de um mês pode começar no mês anterior.
--
-- profissional_cpf fica FORA de propósito. A tabela tem policy
-- `for select to authenticated using (true)`, ou seja, qualquer usuário logado
-- — recepção, faturamento, terapêutico — lê CPF de profissional. Ver o pendente
-- em SECURITY_CHECKLIST.md ("csv_grades_profissionais aberta pra qualquer
-- authenticated"). Todo consumidor que migrar para esta view deixa de expor o
-- campo; a migração dos consumidores é Fase 2.

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

  EXTRACT(year  FROM data)::int AS ano,
  EXTRACT(month FROM data)::int AS mes,
  to_char(data, 'YYYY-MM')      AS ano_mes,
  -- Semana ISO do ano, exposta só para quem precisar cruzar com relatório externo.
  -- Os flags abaixo NÃO usam esta coluna.
  EXTRACT(week  FROM data)::int AS semana_iso,

  (EXTRACT(day FROM data)::int - 1) / 7 + 1       AS semana_do_mes,
  (EXTRACT(day FROM data)::int - 1) / 7 + 1 = 1   AS is_primeira_semana,
  -- Último bloco de 7 dias do mês, na mesma contagem de semana_do_mes: compara o
  -- bloco do dia com o bloco do último dia do mês. Em mês de 31 dias o último
  -- bloco tem 3 dias (29–31); é o comportamento pretendido da contagem por
  -- calendário.
  (EXTRACT(day FROM data)::int - 1) / 7
    = (EXTRACT(day FROM (date_trunc('month', data) + interval '1 month' - interval '1 day'))::int - 1) / 7
                                                  AS is_ultima_semana,

  data = date_trunc('month', data)::date          AS is_primeiro_dia_mes,
  data = (date_trunc('month', data) + interval '1 month' - interval '1 day')::date
                                                  AS is_ultima_data_mes,
  -- Dia útil aqui é seg–sex; a clínica não atende fim de semana.
  EXTRACT(isodow FROM data)::int BETWEEN 1 AND 5  AS is_dia_util,

  -- Espelha exatamente a regra do trigger trg_congelar_grade_passada: true = a
  -- linha já é imutável.
  data < (now() AT TIME ZONE 'America/Sao_Paulo')::date AS is_congelado

FROM public.csv_grades_profissionais
WHERE ativo
  AND unidade_id = 280
  -- Slots vagos ('Livre') e reservas sem agendamento não são atendimento; ambos
  -- vêm sem tita_agendamento_id. O histórico semeado do backup também não os tem,
  -- então incluí-los faria a série temporal mudar de significado em 2026-07-01.
  AND status_agendamento = 'Agendado'
  AND COALESCE(profissional_nome, '') NOT IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta')
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Testes Técnicos%'
  AND COALESCE(profissional_nome, '') NOT ILIKE 'Combinar Consulta%';

COMMENT ON VIEW public.vw_grade_base IS
  'Grade de atendimentos (csv_grades_profissionais) já filtrada e com recortes de calendário calculados. Semana = calendário do mês (1-7, 8-14, ...), não ISO. Sem profissional_cpf.';

GRANT SELECT ON public.vw_grade_base TO authenticated;
