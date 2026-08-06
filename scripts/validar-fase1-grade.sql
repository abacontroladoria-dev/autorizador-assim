-- Bateria de validação da Fase 1 do congelamento de csv_grades_profissionais.
-- Roda contra um banco JÁ MIGRADO (local, via supabase db reset). Não depende de
-- dado de produção: cria as próprias linhas de teste e limpa no fim.
--
--   docker exec -i supabase_db_sistema-pulsar psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < scripts/validar-fase1-grade.sql
--
-- Cada caso imprime PASSOU / FALHOU. Qualquer FALHOU invalida a entrega.
--
-- ATENÇÃO — a limpeza do fim é PARCIAL, por construção: o trigger
-- trg_congelar_grade_passada bloqueia DELETE em data passada, então as ~4 linhas
-- de teste com data no passado SOBREVIVEM (é o que a última consulta reporta).
-- Rodar a bateria duas vezes sem limpar faz 1.8 e 2.1 falharem por contagem
-- inflada, sem que nada esteja quebrado. Para uma segunda rodada limpa:
--
--   ALTER TABLE csv_grades_profissionais DISABLE TRIGGER trg_congelar_grade_passada;
--   DELETE FROM csv_grades_profissionais WHERE profissional_nome = 'ZZ Teste Fase1';
--   ALTER TABLE csv_grades_profissionais ENABLE  TRIGGER trg_congelar_grade_passada;
--
-- (só em banco local — nunca em produção).

\set ON_ERROR_STOP off
\timing off
SET client_min_messages TO WARNING;

CREATE TEMP TABLE resultado(ordem serial, caso text, esperado text, obtido text, veredito text);

CREATE OR REPLACE FUNCTION pg_temp.registrar(p_caso text, p_esperado text, p_ok boolean, p_obtido text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO resultado(caso, esperado, obtido, veredito)
  VALUES (p_caso, p_esperado, COALESCE(p_obtido, CASE WHEN p_ok THEN 'idem' ELSE 'divergiu' END),
          CASE WHEN p_ok THEN 'PASSOU' ELSE '>>> FALHOU' END);
END $$;

-- Datas relativas ao fuso da clínica, igual ao trigger.
CREATE OR REPLACE FUNCTION pg_temp.hoje() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- ─── Cenário ──────────────────────────────────────────────────────────────────
-- Três linhas: uma no passado (congelada), uma hoje, uma no futuro.

DELETE FROM csv_grades_profissionais WHERE profissional_nome = 'ZZ Teste Fase1';

INSERT INTO csv_grades_profissionais
  (tita_agendamento_id, paciente_id, paciente_nome, data, hora_inicial, hora_final,
   profissional_id, profissional_nome, terapia_id, terapia_nome, sala_nome,
   unidade_id, unidade_nome, status_agendamento, origem, ativo)
VALUES
  (900001, 111, 'ZZ Paciente A', pg_temp.hoje() - 30, '08:00', '08:40', 9999, 'ZZ Teste Fase1', 2250, 'Fonoaudiologia', 'ZZ Sala', 280, 'CLÍNICA UNIVERSO ABA', 'Agendado', 'backup_xls', true),
  (900002, 222, 'ZZ Paciente B', pg_temp.hoje(),      '09:00', '09:40', 9999, 'ZZ Teste Fase1', 2250, 'Fonoaudiologia', 'ZZ Sala', 280, 'CLÍNICA UNIVERSO ABA', 'Agendado', 'tita_csv',   true),
  (900003, 333, 'ZZ Paciente C', pg_temp.hoje() + 10, '10:00', '10:40', 9999, 'ZZ Teste Fase1', 2250, 'Fonoaudiologia', 'ZZ Sala', 280, 'CLÍNICA UNIVERSO ABA', 'Agendado', 'tita_csv',   true);

-- ─── 1. Trigger ───────────────────────────────────────────────────────────────

-- 1.1 INSERT em data passada tem de passar (foi assim que o backup entrou)
DO $$
BEGIN
  INSERT INTO csv_grades_profissionais
    (tita_agendamento_id, paciente_id, paciente_nome, data, hora_inicial, profissional_id,
     profissional_nome, terapia_id, unidade_id, status_agendamento, origem, ativo)
  VALUES (900004, 444, 'ZZ Paciente D', pg_temp.hoje() - 200, '11:00', 9999,
          'ZZ Teste Fase1', 2250, 280, 'Agendado', 'backup_xls', true);
  PERFORM pg_temp.registrar('1.1 INSERT em data passada', 'permitido', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.registrar('1.1 INSERT em data passada', 'permitido', false, SQLERRM);
END $$;

-- 1.2 UPDATE em linha passada tem de ser bloqueado
DO $$
BEGIN
  UPDATE csv_grades_profissionais SET sala_nome = 'MEXIDO'
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() - 30;
  PERFORM pg_temp.registrar('1.2 UPDATE em linha passada', 'bloqueado', false, 'passou sem erro');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.registrar('1.2 UPDATE em linha passada', 'bloqueado', true, 'exceção levantada');
END $$;

-- 1.3 DELETE em linha passada tem de ser bloqueado
DO $$
BEGIN
  DELETE FROM csv_grades_profissionais
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() - 30;
  PERFORM pg_temp.registrar('1.3 DELETE em linha passada', 'bloqueado', false, 'passou sem erro');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.registrar('1.3 DELETE em linha passada', 'bloqueado', true, 'exceção levantada');
END $$;

-- 1.4 UPDATE na linha de HOJE tem de passar (é o que o sync faz)
DO $$
BEGIN
  UPDATE csv_grades_profissionais SET ativo = false, motivo_inativacao = 'excluido'
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje();
  PERFORM pg_temp.registrar('1.4 UPDATE em linha de hoje', 'permitido', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.registrar('1.4 UPDATE em linha de hoje', 'permitido', false, SQLERRM);
END $$;

-- 1.5 UPDATE em linha futura tem de passar
DO $$
BEGIN
  UPDATE csv_grades_profissionais SET sala_nome = 'ZZ Sala 2'
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() + 10;
  PERFORM pg_temp.registrar('1.5 UPDATE em linha futura', 'permitido', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.registrar('1.5 UPDATE em linha futura', 'permitido', false, SQLERRM);
END $$;

-- 1.6 Empurrar linha futura para o passado tem de ser bloqueado (só NEW.data pegaria isto)
DO $$
BEGIN
  UPDATE csv_grades_profissionais SET data = pg_temp.hoje() - 5
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() + 10;
  PERFORM pg_temp.registrar('1.6 mover linha futura p/ o passado', 'bloqueado', false, 'passou sem erro');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.registrar('1.6 mover linha futura p/ o passado', 'bloqueado', true, 'exceção levantada');
END $$;

-- 1.7 O congelamento usa o fuso de São Paulo, não o da sessão. Com a sessão em
-- UTC+14 o "hoje" local pode ser 1 dia à frente; a linha de ontem-SP tem de
-- continuar bloqueada e a de hoje-SP continuar editável.
DO $$
DECLARE v_bloqueou boolean := false;
BEGIN
  SET LOCAL TIME ZONE 'Pacific/Kiritimati';
  BEGIN
    UPDATE csv_grades_profissionais SET sala_nome = 'MEXIDO'
     WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() - 30;
  EXCEPTION WHEN OTHERS THEN v_bloqueou := true;
  END;
  PERFORM pg_temp.registrar('1.7 fuso da sessão não afeta o corte', 'bloqueado', v_bloqueou);
END $$;

-- 1.8 Nenhuma linha foi apagada fisicamente em nenhum dos casos acima
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM csv_grades_profissionais WHERE profissional_nome = 'ZZ Teste Fase1';
  PERFORM pg_temp.registrar('1.8 nada apagado fisicamente', '4 linhas', n = 4, n || ' linhas');
END $$;

-- ─── 2. Merge do sync (as operações que a Edge Function faz) ──────────────────

-- 2.1 Inativar a versão antiga de uma sessão futura e inserir a nova: as duas
-- operações do merge, na janela em que ele atua.
DO $$
DECLARE v_id uuid; n_ativas int; n_total int;
BEGIN
  SELECT id INTO v_id FROM csv_grades_profissionais
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() + 10 LIMIT 1;

  UPDATE csv_grades_profissionais
     SET ativo = false, motivo_inativacao = 'alterado' WHERE id = v_id;

  INSERT INTO csv_grades_profissionais
    (tita_agendamento_id, paciente_id, paciente_nome, data, hora_inicial, profissional_id,
     profissional_nome, terapia_id, unidade_id, status_agendamento, origem, ativo, visto_em)
  VALUES (900003, 333, 'ZZ Paciente C', pg_temp.hoje() + 10, '14:00', 9999,
          'ZZ Teste Fase1', 2250, 280, 'Agendado', 'tita_csv', true, now());

  SELECT count(*) FILTER (WHERE ativo), count(*) INTO n_ativas, n_total
    FROM csv_grades_profissionais
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() + 10;

  PERFORM pg_temp.registrar('2.1 merge futuro: 1 ativa + 1 versão inativa',
                            '1 ativa / 2 no total', n_ativas = 1 AND n_total = 2,
                            n_ativas || ' ativa / ' || n_total || ' no total');
END $$;

-- 2.2 A linha do passado continua exatamente como entrou
DO $$
DECLARE r record;
BEGIN
  SELECT sala_nome, ativo, motivo_inativacao, origem INTO r
    FROM csv_grades_profissionais
   WHERE profissional_nome = 'ZZ Teste Fase1' AND data = pg_temp.hoje() - 30;
  PERFORM pg_temp.registrar('2.2 linha passada intacta após tudo',
                            'ZZ Sala / ativa / backup_xls',
                            r.sala_nome = 'ZZ Sala' AND r.ativo AND r.motivo_inativacao IS NULL
                              AND r.origem = 'backup_xls',
                            r.sala_nome || ' / ' || CASE WHEN r.ativo THEN 'ativa' ELSE 'inativa' END
                              || ' / ' || r.origem);
END $$;

-- ─── 3. vw_grade_base ─────────────────────────────────────────────────────────

-- 3.1 Recortes de calendário sobre datas conhecidas (mês de 31 e mês de 28 dias)
DO $$
DECLARE r record; ok boolean := true; detalhe text := '';
BEGIN
  FOR r IN
    SELECT d::date AS data,
           (EXTRACT(day FROM d)::int - 1) / 7 + 1 AS sem,
           (EXTRACT(day FROM d)::int - 1) / 7 = (EXTRACT(day FROM (date_trunc('month', d) + interval '1 month' - interval '1 day'))::int - 1) / 7 AS ult
      FROM unnest(ARRAY['2026-03-01','2026-03-07','2026-03-08','2026-03-29','2026-03-31',
                        '2026-02-22','2026-02-28']::timestamp[]) AS d
  LOOP
    NULL;
  END LOOP;

  -- Confere os casos-limite um a um
  IF (EXTRACT(day FROM DATE '2026-03-01')::int - 1)/7 + 1 <> 1 THEN ok := false; detalhe := detalhe || '01/03 não é semana 1; '; END IF;
  IF (EXTRACT(day FROM DATE '2026-03-07')::int - 1)/7 + 1 <> 1 THEN ok := false; detalhe := detalhe || '07/03 não é semana 1; '; END IF;
  IF (EXTRACT(day FROM DATE '2026-03-08')::int - 1)/7 + 1 <> 2 THEN ok := false; detalhe := detalhe || '08/03 não é semana 2; '; END IF;
  IF (EXTRACT(day FROM DATE '2026-03-31')::int - 1)/7 + 1 <> 5 THEN ok := false; detalhe := detalhe || '31/03 não é semana 5; '; END IF;
  IF (EXTRACT(day FROM DATE '2026-02-28')::int - 1)/7 + 1 <> 4 THEN ok := false; detalhe := detalhe || '28/02 não é semana 4; '; END IF;
  PERFORM pg_temp.registrar('3.1 semana do mês (calendário 1-7, 8-14, …)', 'mar: 1,1,2,…,5 / fev: 4', ok, NULLIF(detalhe, ''));
END $$;

-- 3.2 A view existe, compila, esconde CPF e exclui inativas — MAS enxerga 'Livre'.
--
-- Atenção ao histórico desta asserção: até a migration 20260806110000 a
-- vw_grade_base excluía slots 'Livre' e fixava unidade_id = 280, e este bloco
-- conferia exatamente isso. Aquilo impedia a view de ser o ponto único de
-- leitura — consumidor legítimo precisa de 'Livre' (busca de reposição) e de
-- todas as unidades (Comparativo de Sessões). Os dois recortes passaram para a
-- vw_grade_atendimentos, conferida em 3.4.
DO $$
DECLARE tem_cpf boolean; n_livre int; n_inativa int;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'vw_grade_base' AND column_name = 'profissional_cpf')
    INTO tem_cpf;
  PERFORM pg_temp.registrar('3.2a vw_grade_base não expõe profissional_cpf', 'ausente', NOT tem_cpf);

  INSERT INTO csv_grades_profissionais
    (paciente_id, data, hora_inicial, profissional_id, profissional_nome, terapia_id,
     unidade_id, status_agendamento, origem, ativo)
  VALUES (NULL, pg_temp.hoje() + 11, '15:00', 9999, 'ZZ Teste Fase1', 2250, 280, 'Livre', 'tita_csv', true);

  SELECT count(*) INTO n_livre   FROM vw_grade_base WHERE profissional_nome = 'ZZ Teste Fase1' AND status_agendamento = 'Livre';
  SELECT count(*) INTO n_inativa FROM vw_grade_base v JOIN csv_grades_profissionais c ON c.id = v.id WHERE NOT c.ativo;

  PERFORM pg_temp.registrar('3.2b vw_grade_base ENXERGA slots Livre', '1', n_livre = 1, n_livre::text);
  PERFORM pg_temp.registrar('3.2c vw_grade_base exclui linhas inativas', '0', n_inativa = 0, n_inativa::text);
END $$;

-- 3.3 is_congelado espelha exatamente a regra do trigger
DO $$
DECLARE n_errado int;
BEGIN
  SELECT count(*) INTO n_errado FROM vw_grade_base
   WHERE is_congelado <> (data < (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  PERFORM pg_temp.registrar('3.3 is_congelado bate com a regra do trigger', '0 divergências', n_errado = 0, n_errado::text);
END $$;

-- 3.4 vw_grade_atendimentos: o recorte que saiu da base (Agendado + unidade 280)
DO $$
DECLARE n_livre int; n_outra_unidade int; faltando text;
BEGIN
  -- O slot 'Livre' inserido em 3.2 está na unidade 280 e continua ativo, então
  -- se aparecer aqui é porque o filtro de status não está valendo.
  --
  -- Qualificar por status_agendamento é obrigatório: os blocos 1.x e 2.x deixam
  -- várias linhas 'Agendado' de 'ZZ Teste Fase1' na unidade 280, e essas DEVEM
  -- aparecer em vw_grade_atendimentos. Contar todas as linhas do profissional
  -- de teste mediria a coisa errada e falharia por motivo nenhum.
  SELECT count(*) INTO n_livre
    FROM vw_grade_atendimentos
   WHERE profissional_nome = 'ZZ Teste Fase1' AND status_agendamento = 'Livre';
  PERFORM pg_temp.registrar('3.4a vw_grade_atendimentos exclui slots Livre', '0', n_livre = 0, n_livre::text);

  SELECT count(*) INTO n_outra_unidade
    FROM vw_grade_atendimentos WHERE unidade_id IS DISTINCT FROM 280;
  PERFORM pg_temp.registrar('3.4b vw_grade_atendimentos só tem unidade 280', '0', n_outra_unidade = 0, n_outra_unidade::text);

  -- As 10 colunas de execução (migration 20260806100000) precisam existir na
  -- base, senão todo consumidor que quiser saber o que ACONTECEU na sessão é
  -- obrigado a voltar para a tabela crua — que é o que se quer evitar.
  SELECT string_agg(c, ', ') INTO faltando
    FROM unnest(ARRAY['status_execucao','justificativa','possui_tratativa',
                      'tratativa_profissional_id','tratativa_profissional_nome',
                      'tratativa_criada_em','tratativa_origem','evolucao_vinculo',
                      'criado_em_tita','excluido_em_tita']) AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'vw_grade_base' AND column_name = c);
  PERFORM pg_temp.registrar('3.4c vw_grade_base expõe as 10 colunas de execução',
                            'nenhuma faltando', faltando IS NULL, faltando);
END $$;

-- 3.5 vw_grade_opcoes: substitui a varredura paginada das listas de formulário
DO $$
DECLARE n_tipos int; n_total int; n_teste int; n_nulo int;
BEGIN
  SELECT count(DISTINCT tipo) INTO n_tipos FROM vw_grade_opcoes;
  PERFORM pg_temp.registrar('3.5a vw_grade_opcoes tem os 3 tipos', '3', n_tipos = 3, n_tipos::text);

  -- O ganho da view é a cardinalidade: se isto voltar às dezenas de milhares, o
  -- DISTINCT parou de funcionar e o consumidor voltou a arrastar a grade inteira.
  SELECT count(*) INTO n_total FROM vw_grade_opcoes;
  PERFORM pg_temp.registrar('3.5b vw_grade_opcoes é da ordem de centenas', '< 5000',
                            n_total < 5000, n_total::text);

  -- Herda os filtros da base: nada de profissional de teste vaza para os selects.
  SELECT count(*) INTO n_teste FROM vw_grade_opcoes
   WHERE nome IN ('Profissional Teste', 'Testes Técnicos', 'Combinar Consulta');
  PERFORM pg_temp.registrar('3.5c vw_grade_opcoes não traz profissional de teste', '0', n_teste = 0, n_teste::text);

  SELECT count(*) INTO n_nulo FROM vw_grade_opcoes WHERE nome IS NULL;
  PERFORM pg_temp.registrar('3.5d vw_grade_opcoes não traz nome nulo', '0', n_nulo = 0, n_nulo::text);
END $$;

-- ─── 4. Views de roster (piso de 30 dias) ─────────────────────────────────────

DO $$
DECLARE n_salas int; n_rost int;
BEGIN
  -- O profissional de teste só tem linha futura e de 30/200 dias atrás; com piso de
  -- 30 dias ele aparece (por causa das linhas de hoje/futuro).
  SELECT count(*) INTO n_salas FROM vw_cronograma_profissionais_salas WHERE profissional_nome = 'ZZ Teste Fase1';
  SELECT count(*) INTO n_rost  FROM vw_remuneracao_profissionais_roster WHERE profissional_nome = 'ZZ Teste Fase1';
  PERFORM pg_temp.registrar('4.1 roster salas enxerga profissional recente', '1', n_salas = 1, n_salas::text);
  PERFORM pg_temp.registrar('4.2 roster remuneração enxerga profissional recente', '1', n_rost = 1, n_rost::text);
END $$;

DO $$
DECLARE n int;
BEGIN
  -- Profissional cuja única linha é de 200 dias atrás tem de ficar de fora.
  INSERT INTO csv_grades_profissionais
    (paciente_id, data, hora_inicial, profissional_id, profissional_nome, terapia_id,
     unidade_id, status_agendamento, origem, ativo)
  VALUES (555, pg_temp.hoje() - 200, '08:00', 9998, 'ZZ Desligado Fase1', 2250, 280, 'Agendado', 'backup_xls', true);

  SELECT count(*) INTO n FROM vw_cronograma_profissionais_salas WHERE profissional_nome = 'ZZ Desligado Fase1';
  PERFORM pg_temp.registrar('4.3 roster ignora quem só tem histórico antigo', '0', n = 0, n::text);
END $$;

-- ─── Resultado ────────────────────────────────────────────────────────────────

SELECT lpad(ordem::text, 3) AS "#", caso, esperado, obtido, veredito FROM resultado ORDER BY ordem;

SELECT count(*) FILTER (WHERE veredito = 'PASSOU')     AS passou,
       count(*) FILTER (WHERE veredito <> 'PASSOU')    AS falhou,
       CASE WHEN count(*) FILTER (WHERE veredito <> 'PASSOU') = 0
            THEN 'TUDO PASSOU' ELSE '>>> HÁ FALHAS' END AS veredito_final
  FROM resultado;

-- ─── Limpeza ──────────────────────────────────────────────────────────────────
-- Só dá para apagar o que não é passado: as linhas de teste com data anterior a
-- hoje estão congeladas pelo próprio trigger que acabamos de validar. Tentar
-- apagá-las levantaria exceção — o que, na prática, é a demonstração final de que
-- o cadeado funciona até contra quem escreveu o teste.
DELETE FROM csv_grades_profissionais
 WHERE profissional_nome IN ('ZZ Teste Fase1', 'ZZ Desligado Fase1')
   AND data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date;

SELECT count(*) AS linhas_de_teste_congeladas_no_passado
  FROM csv_grades_profissionais
 WHERE profissional_nome IN ('ZZ Teste Fase1', 'ZZ Desligado Fase1');
