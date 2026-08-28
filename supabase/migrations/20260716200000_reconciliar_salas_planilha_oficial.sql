-- Reconciliação do cadastro de salas com a planilha oficial de operação
-- ("Grade de salas 2026 - cópia 16.07.2026.xlsx", aba Planilha1), enviada
-- pelo usuário como fonte de verdade para núcleo/andar/capacidade/status.
--
-- A planilha tem 87 salas físicas distintas; só 56 já estavam cadastradas
-- (as que apareceram em agendamentos sincronizados na Fase 3). 31 nunca
-- tinham tido agendamento real sincronizado, então ficaram de fora do
-- inventário anterior — cadastradas agora.
--
-- Conflitos de capacidade (22 de 56 salas) entre o valor derivado dos dados
-- reais de agendamento (Fase 3) e o valor oficial da planilha: por decisão
-- do usuário, a PLANILHA prevalece. Onde o uso real exceder a capacidade
-- oficial, isso vai aparecer como "inconsistência" na tela — sinal de que a
-- sala está sendo usada além do planejado, não um bug.
--
-- 5 salas (já cadastradas) viraram status='adm' (Realengo 22/35/36/37,
-- Fazendinha 11). Entre as 31 novas, "Realengo - Sala 3" entra como
-- status='bloqueada' (é a linha "EXTINTA" da planilha — sala desativada).

-- 1) Atualiza núcleo/andar/capacidade/status das salas já cadastradas, com base na planilha oficial (fonte de verdade).
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '51519a7f-fe77-4a66-bd04-d8894d4c3666'; -- Fazendinha|1 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Desenvolvimento E Autonomia', andar = '1', capacidade = 'unico', status = 'ativa' where id = '40ff4095-9d7f-4310-8e54-0c7a31392ca7'; -- Padre Miguel|1 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '1', capacidade = 'unico', status = 'ativa' where id = '8ef72f2d-e86f-4b35-b3b0-842e79a4d3d4'; -- Fazendinha|2 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '46a6298a-fd6f-492b-956e-66361939c761'; -- Fazendinha|3 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '69a1bfa3-e8ea-4fb4-96e5-80fc7503172a'; -- Realengo|4 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '889f15ae-0837-48bd-b597-83308fcf60d0'; -- Fazendinha|4 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'duplo', status = 'ativa' where id = 'bf27c7f0-fd02-4af1-8cbd-8d23a0aee7aa'; -- Realengo|5 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = 'cf170d73-39b6-4ca1-a92b-39ff8a67fe0c'; -- Fazendinha|5 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = 'add379de-ed31-4fe6-8a4d-78197580f96d'; -- Realengo|6 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '1', capacidade = 'unico', status = 'ativa' where id = '23966895-c70f-41d0-9fdf-14c81580311e'; -- Fazendinha|6 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '8daf7888-f211-41a4-b307-b858a2ef1d4e'; -- Realengo|7 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'duplo', status = 'ativa' where id = '313c2d98-29a0-49b1-ac93-4f5796b7fad1'; -- Realengo|8 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '6efc75a6-a34d-4e3b-9cc1-4653bdb311e8'; -- Fazendinha|8 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'duplo', status = 'ativa' where id = 'fb12208e-5635-4d31-84be-efbc4025c6ab'; -- Padre Miguel|8 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'multiplo', status = 'ativa' where id = '80f1fbdc-22df-48fd-8342-ce36210f1294'; -- Fazendinha|9 (atendimento planilha: MULTIPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'unico', status = 'ativa' where id = 'dda99a36-c26e-455f-84b2-4f1bcdf89fe0'; -- Padre Miguel|9 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '2517eb1a-677b-44e6-a6ac-519a653fb984'; -- Realengo|10 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = 'c807bd71-50eb-424b-b2ba-3a4e0d638f65'; -- Fazendinha|10 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'unico', status = 'ativa' where id = 'e7013499-632f-4dee-9063-268fb6688626'; -- Padre Miguel|10 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '8da83bed-8ccc-4919-b97d-9baa7c6eccc5'; -- Realengo|11 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'unico', status = 'ativa' where id = 'a5d07889-86c2-4fda-a22e-6d2b4be0fbe6'; -- Padre Miguel|11 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'duplo', status = 'ativa' where id = '28eefbf0-1b74-4074-bea6-024b2fb4a593'; -- Realengo|12 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '523f8243-500c-42f0-ba4f-c0bf5006f476'; -- Fazendinha|12 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'unico', status = 'ativa' where id = '7c167306-8c02-4a4b-b5bb-fc9e3f8bc7b1'; -- Padre Miguel|12 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'duplo', status = 'ativa' where id = '05d22cd7-11a2-40c2-9444-43faac69310a'; -- Realengo|13 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'unico', status = 'ativa' where id = '3f43873b-84f3-4e44-9093-a4bad6f957b9'; -- Padre Miguel|13 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '427407ab-eff2-4a50-b34a-adb2c0819dc9'; -- Realengo|14 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'duplo', status = 'ativa' where id = '14155f04-3229-41db-a27c-7accea8e84e2'; -- Padre Miguel|14 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = 'f49a6180-e030-4d6c-859a-70ac78273cb3'; -- Realengo|15 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'duplo', status = 'ativa' where id = '33fdcd9c-8c4c-4880-8680-334f21e3efbd'; -- Padre Miguel|15 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = 'ed73c724-e11c-4a28-9eb3-1ee3848cd02d'; -- Realengo|16 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'ADM', andar = '1', capacidade = 'duplo', status = 'ativa' where id = '68a63c21-0ff8-49bf-a9f7-4b2baf60fc2e'; -- Realengo|18 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '198be47d-a7e5-462e-a3ff-ea8b1db9997d'; -- Realengo|19 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'unico', status = 'ativa' where id = '706c3961-f924-4442-b13a-9e05e13e66e7'; -- Realengo|20 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'duplo', status = 'ativa' where id = 'e1747e01-327e-42e6-8a02-63129bf40ff5'; -- Realengo|21 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '3', capacidade = 'unico', status = 'ativa' where id = '624f7c8a-a456-483c-94cd-851ac00adf40'; -- Padre Miguel|21 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'ADM', andar = '1', capacidade = 'unico', status = 'adm' where id = '16f9089d-7020-4f1f-b5ca-c97f2d0c4947'; -- Realengo|22 (atendimento planilha: ADM)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'duplo', status = 'ativa' where id = '0b6fd802-ccfc-47a3-995c-f11fce4d95ef'; -- Realengo|24 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'duplo', status = 'ativa' where id = 'd300931a-fd92-4742-a2b9-ee0525082153'; -- Realengo|25 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'duplo', status = 'ativa' where id = 'cb039cd9-a4b9-4407-b32b-fd96ed64cedd'; -- Realengo|26 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '3', capacidade = 'unico', status = 'ativa' where id = 'f55a7717-dc91-47fb-9650-3dd4c3e49064'; -- Padre Miguel|26 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'duplo', status = 'ativa' where id = 'f3ba7b57-5a18-488f-8f0f-39cfb0fa82d4'; -- Realengo|27 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'unico', status = 'ativa' where id = '344dadf9-dc31-45c6-b7c0-4272ee65062a'; -- Realengo|29 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'unico', status = 'ativa' where id = '4622595a-33fd-4a7d-a124-dcef16440bfb'; -- Realengo|30 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'unico', status = 'ativa' where id = '07922a84-ee9a-4913-8580-f74b806b1102'; -- Realengo|31 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'duplo', status = 'ativa' where id = 'bd2b7608-ae4f-48f9-9b5b-f4aee36e19fc'; -- Realengo|33 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'ADM', andar = '2', capacidade = 'unico', status = 'adm' where id = '8575a7af-0633-4864-8d4e-9a0132555c0b'; -- Realengo|35 (atendimento planilha: ADM)
update public.cronograma_salas set nucleo = 'ADM', andar = '2', capacidade = 'unico', status = 'adm' where id = '40b40243-97fe-4ccf-8685-3f0529d16fed'; -- Realengo|36 (atendimento planilha: ADM)
update public.cronograma_salas set nucleo = 'ADM', andar = '2', capacidade = 'unico', status = 'adm' where id = 'a4884cc8-2624-4b0a-bd85-8571bd85ecbe'; -- Realengo|37 (atendimento planilha: ADM)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'unico', status = 'ativa' where id = 'de01cc7c-40df-495f-89df-9c83db8fa073'; -- Realengo|38 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'duplo', status = 'ativa' where id = 'c5d8ff48-21ad-4581-b9db-fcc21adf7a47'; -- Realengo|39 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA', andar = '2', capacidade = 'unico', status = 'ativa' where id = 'c6f44c8b-2f58-42bf-bbda-28be12ccdcf9'; -- Realengo|40 (atendimento planilha: ÚNICO)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '2', capacidade = 'duplo', status = 'ativa' where id = '1c3daaf8-264e-412b-a9dd-5abe5d00350a'; -- Realengo|41 (atendimento planilha: DUPLO)
update public.cronograma_salas set nucleo = 'Terapia ABA - NTI', andar = '2', capacidade = 'multiplo', status = 'ativa' where id = 'fd5e6d55-8b70-491d-9bc8-215d000e78a5'; -- Realengo|42 (atendimento planilha: MULTIPLO)
update public.cronograma_salas set nucleo = 'ADM', andar = '1', capacidade = 'unico', status = 'adm' where id = '9f9108df-7585-4f46-a32a-3774b2de4d64'; -- Fazendinha|11 (atendimento planilha: ADM)
update public.cronograma_salas set nucleo = 'Especialidades Terapêuticas', andar = '1', capacidade = 'multiplo', status = 'ativa' where id = '0dc5993d-886b-4bf1-bacf-6cd43c34312e'; -- Fazendinha|7 (atendimento planilha: MULTIPLO)

-- 2) Cadastra as salas que existem na planilha mas ainda não tinham agendamento sincronizado.
insert into public.cronograma_salas
  (unidade_nome, nucleo, andar, numero_sala, nome_exibicao, capacidade, status, sala_nome_referencia, observacoes)
values
  ('Realengo', 'ADM', '1', '1', 'Sala 1', 'unico', 'adm', null, null),
  ('Realengo', 'Especialidades Terapêuticas', '1', '2', 'Sala 2', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'Desenvolvimento E Autonomia', '1', '2', 'Sala 2', 'duplo', 'ativa', null, null),
  ('Realengo', 'Especialidades Terapêuticas', '1', '3', 'Sala 3', 'unico', 'bloqueada', null, null),
  ('Padre Miguel', 'Desenvolvimento E Autonomia', '1', '3', 'Sala 3', 'duplo', 'ativa', null, null),
  ('Padre Miguel', 'Desenvolvimento E Autonomia', '1', '4', 'Sala 4', 'multiplo', 'ativa', null, null),
  ('Padre Miguel', 'Diagnóstico', '2', '5', 'Sala 5', 'multiplo', 'ativa', null, null),
  ('Padre Miguel', 'Especialidades Terapêuticas', '2', '6', 'Sala 6', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'Especialidades Terapêuticas', '2', '7', 'Sala 7', 'unico', 'ativa', null, null),
  ('Realengo', 'Especialidades Terapêuticas', '1', '9', 'Sala 9', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'Especialidades Terapêuticas', '2', '16', 'Sala 16', 'unico', 'ativa', null, null),
  ('Realengo', 'Especialidades Terapêuticas', '1', '17', 'Sala 17', 'duplo', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '17', 'Sala 17', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '18', 'Sala 18', 'duplo', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '19', 'Sala 19', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '20', 'Sala 20', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '22', 'Sala 22', 'duplo', 'ativa', null, null),
  ('Realengo', 'Terapia ABA - NTI', '2', '23', 'Sala 23', 'multiplo', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '23', 'Sala 23', 'duplo', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '24', 'Sala 24', 'duplo', 'ativa', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '25', 'Sala 25', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'ADM', '3', '27', 'Sala 27', 'unico', 'adm', null, null),
  ('Realengo', 'Terapia ABA - NTI', '2', '28', 'Sala 28', 'multiplo', 'ativa', null, null),
  ('Padre Miguel', 'ADM', '3', '28', 'Sala 28', 'unico', 'adm', null, null),
  ('Padre Miguel', 'ADM', '3', '29', 'Sala 29', 'unico', 'adm', null, null),
  ('Padre Miguel', 'Terapia ABA', '3', '30', 'Sala 30', 'unico', 'ativa', null, null),
  ('Padre Miguel', 'ADM', '2', '31', 'Sala 31', 'unico', 'adm', null, null),
  ('Realengo', 'Terapia ABA - NTI', '2', '32', 'Sala 32', 'multiplo', 'ativa', null, null),
  ('Realengo', 'ADM', '2', '34', 'Sala 34', 'unico', 'adm', null, null),
  ('Realengo', 'ADM', '2', 'Ambiente comum', 'Sala Ambiente comum', 'unico', 'ativa', null, null),
  ('Fazendinha', 'ADM', '1', 'Ambiente comum', 'Sala Ambiente comum', 'unico', 'ativa', null, null);
