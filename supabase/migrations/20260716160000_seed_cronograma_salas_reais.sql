-- Seed do inventário real de salas, gerado a partir dos valores distintos de
-- `sala_nome` já em uso em agenda_tita_autorizacao_v2 (agenda real, sem CSV
-- manual). 54 salas físicas detectadas (Realengo, Fazendinha, Padre Miguel).
--
-- IMPORTANTE — revisar antes de rodar:
-- 1. Todas entram com capacidade='unico' e status='ativa' por padrão — isso é
--    um CHUTE SEGURO, não um fato. Ajuste pela tela /cronograma/ocupacao-salas
--    as salas que na prática comportam duplo/múltiplo atendimento simultâneo.
-- 2. `nucleo`/`andar` ficaram null — não existem no texto livre da agenda,
--    preencha manualmente pela tela se forem relevantes pros filtros.
-- 3. Salas com observação "Coordenação de caso/Unidade", "Cozinha", "Piscina"
--    podem ser, na prática, salas administrativas (status='adm', capacidade
--    projetada 0) em vez de salas de atendimento — não assumi isso, revise
--    caso a caso.
-- 4. NÃO estão aqui (por não serem salas físicas numeradas — não têm
--    correspondência automática com nenhuma linha da agenda por unidade+número):
--    "AT Externo Escola" (9568 ocorrências), "AT Externo Casa" (201),
--    "Sala Teste" (101), "Especialista Técnico de Área" (28),
--    "Consulta 4/6 - Nutrição" (1). Se "AT Externo Escola/Casa" precisarem de
--    indicador de ocupação também, isso é um modelo de dado diferente (não é
--    sala física com capacidade fixa) — decidir em uma fase futura.

insert into public.cronograma_salas
  (unidade_nome, nucleo, andar, numero_sala, nome_exibicao, capacidade, status, sala_nome_referencia, observacoes)
values
  ('Fazendinha', null, null, '1', 'Sala 1', 'unico', 'ativa', 'Unid. Fazendinha - Sala 1 (Psicoeducação)', 'Psicoeducação'),
  ('Fazendinha', null, null, '2', 'Sala 2', 'unico', 'ativa', 'Unid. Fazendinha - Sala 2', 'conhecimento'),
  ('Fazendinha', null, null, '3', 'Sala 3', 'unico', 'ativa', 'Unid. Fazendinha - Sala 3', null),
  ('Fazendinha', null, null, '4', 'Sala 4', 'unico', 'ativa', 'Unid. Fazendinha - Sala 4', null),
  ('Fazendinha', null, null, '5', 'Sala 5', 'unico', 'ativa', 'Unid. Fazendinha - Sala 5 (Cozinha)', 'Cozinha'),
  ('Fazendinha', null, null, '7', 'Sala 7', 'unico', 'ativa', 'Unid. Fazendinha - Sala 7', null),
  ('Fazendinha', null, null, '8', 'Sala 8', 'unico', 'ativa', 'Unid. Fazendinha - Sala 8', null),
  ('Fazendinha', null, null, '9', 'Sala 9', 'unico', 'ativa', 'Unid. Fazendinha - Sala 9 (Piscina)', 'Piscina'),
  ('Fazendinha', null, null, '10', 'Sala 10', 'unico', 'ativa', 'Unid. Fazendinha - Sala 10 (Equoterapia)', 'Equoterapia'),
  ('Fazendinha', null, null, '11', 'Sala 11', 'unico', 'ativa', 'Unid. Fazendinha - Sala 11 (Coordenação de Caso)', 'Coordenação de Caso'),
  ('Fazendinha', null, null, '12', 'Sala 12', 'unico', 'ativa', 'Unid. Fazendinha - Sala 12', null),
  ('Padre Miguel', null, null, '1', 'Sala 1', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 1', null),
  ('Padre Miguel', null, null, '8', 'Sala 8', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 8 (Cozinha)', 'Cozinha'),
  ('Padre Miguel', null, null, '9', 'Sala 9', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 09', null),
  ('Padre Miguel', null, null, '10', 'Sala 10', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 10', null),
  ('Padre Miguel', null, null, '11', 'Sala 11', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 11', null),
  ('Padre Miguel', null, null, '12', 'Sala 12', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 12', null),
  ('Padre Miguel', null, null, '13', 'Sala 13', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 13', null),
  ('Padre Miguel', null, null, '14', 'Sala 14', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 14', null),
  ('Padre Miguel', null, null, '15', 'Sala 15', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 15', null),
  ('Padre Miguel', null, null, '26', 'Sala 26', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 26 (Coordenação de Unidade)', 'Coordenação de Unidade'),
  ('Realengo', null, null, '4', 'Sala 4', 'unico', 'ativa', 'Unid. Realengo - Sala 4', null),
  ('Realengo', null, null, '5', 'Sala 5', 'unico', 'ativa', 'Unid. Realengo - Sala 5', null),
  ('Realengo', null, null, '6', 'Sala 6', 'unico', 'ativa', 'Unid. Realengo - Sala 6', null),
  ('Realengo', null, null, '7', 'Sala 7', 'unico', 'ativa', 'Unid. Realengo - Sala 7', null),
  ('Realengo', null, null, '8', 'Sala 8', 'unico', 'ativa', 'Unid. Realengo - Sala 8 (Cozinha)', 'Cozinha'),
  ('Realengo', null, null, '10', 'Sala 10', 'unico', 'ativa', 'Unid. Realengo - Sala 10', null),
  ('Realengo', null, null, '11', 'Sala 11', 'unico', 'ativa', 'Unid. Realengo - Sala 11', null),
  ('Realengo', null, null, '12', 'Sala 12', 'unico', 'ativa', 'Unid. Realengo - Sala 12 (Piscina)', 'Piscina'),
  ('Realengo', null, null, '13', 'Sala 13', 'unico', 'ativa', 'Unid. Realengo - Sala 13', null),
  ('Realengo', null, null, '14', 'Sala 14', 'unico', 'ativa', 'Unid. Realengo - Sala 14', null),
  ('Realengo', null, null, '15', 'Sala 15', 'unico', 'ativa', 'Unid. Realengo - Sala 15', null),
  ('Realengo', null, null, '16', 'Sala 16', 'unico', 'ativa', 'Unid. Realengo - Sala 16', null),
  ('Realengo', null, null, '18', 'Sala 18', 'unico', 'ativa', 'Unid. Realengo - Sala 18 (Coordenação de caso)', 'Coordenação de caso'),
  ('Realengo', null, null, '19', 'Sala 19', 'unico', 'ativa', 'Unid. Realengo - Sala 19', null),
  ('Realengo', null, null, '20', 'Sala 20', 'unico', 'ativa', 'Unid. Realengo - Sala 20', null),
  ('Realengo', null, null, '21', 'Sala 21', 'unico', 'ativa', 'Unid. Realengo - Sala 21', null),
  ('Realengo', null, null, '22', 'Sala 22', 'unico', 'ativa', 'Unid. Realengo - Sala 22 (Coordenação de caso)', 'Coordenação de caso'),
  ('Realengo', null, null, '24', 'Sala 24', 'unico', 'ativa', 'Unid. Realengo - Sala 24', null),
  ('Realengo', null, null, '25', 'Sala 25', 'unico', 'ativa', 'Unid. Realengo - Sala 25', null),
  ('Realengo', null, null, '26', 'Sala 26', 'unico', 'ativa', 'Unid. Realengo - Sala 26', null),
  ('Realengo', null, null, '27', 'Sala 27', 'unico', 'ativa', 'Unid. Realengo - Sala 27', null),
  ('Realengo', null, null, '29', 'Sala 29', 'unico', 'ativa', 'Unid. Realengo - Sala 29', null),
  ('Realengo', null, null, '30', 'Sala 30', 'unico', 'ativa', 'Unid. Realengo - Sala 30', null),
  ('Realengo', null, null, '31', 'Sala 31', 'unico', 'ativa', 'Unid. Realengo - Sala 31', null),
  ('Realengo', null, null, '33', 'Sala 33', 'unico', 'ativa', 'Unid. Realengo - Sala 33', null),
  ('Realengo', null, null, '35', 'Sala 35', 'unico', 'ativa', 'Unid. Realengo - Sala 35', null),
  ('Realengo', null, null, '36', 'Sala 36', 'unico', 'ativa', 'Unid. Realengo - Sala 36', null),
  ('Realengo', null, null, '37', 'Sala 37', 'unico', 'ativa', 'Unid. Realengo - Sala 37', null),
  ('Realengo', null, null, '38', 'Sala 38', 'unico', 'ativa', 'Unid. Realengo - Sala 38', null),
  ('Realengo', null, null, '39', 'Sala 39', 'unico', 'ativa', 'Unid. Realengo - Sala 39', null),
  ('Realengo', null, null, '40', 'Sala 40', 'unico', 'ativa', 'Unid. Realengo - Sala 40', null),
  ('Realengo', null, null, '41', 'Sala 41', 'unico', 'ativa', 'Unid. Realengo - Sala 41', null),
  ('Realengo', null, null, '42', 'Sala 42', 'unico', 'ativa', 'Unid. Realengo - Sala 42', null)
on conflict (unidade_nome, numero_sala) do nothing;
