-- ============================================================================
-- APLICAR NO SQL EDITOR DO DASHBOARD SUPABASE (produção)
--
-- Migração de dado ÚNICA (não recorrente): carga inicial de
-- public.pdi_controle_prazos a partir da planilha Excel "Controle_Prazos_PDI
-- pronto 2.0" (209 linhas), casando pacientes por NOME NORMALIZADO contra a
-- IDENTIDADE DA TITA (public.orbita_laudos_relatorio, colunas "Paciente" e
-- "ID Favorecido" da importação mais recente, arquivo
-- relatorio_laudos_em_uso_20260904_031513.xls, concluída em 2026-09-04T06:15:16.468153+00:00) —
-- NÃO contra public.pacientes. Mesma normalização de
-- frontend/lib/cronograma/constants.ts::normTxt (acento, caixa e espaço
-- duplicado ignorados).
--
-- ⚠️ paciente_id AQUI é o "ID Favorecido" do relatório Órbita = o
-- tita_paciente_id = o mesmo espaço de identidade de
-- csv_grades_profissionais.paciente_id. NÃO é public.pacientes.id_paciente —
-- a tabela public.pdi_controle_prazos não tem mais FK para public.pacientes
-- (ver 20260904120000_pdi_controle_prazos.sql): public.pacientes não é 100%
-- adotado, e um paciente real sem linha lá não pode ficar de fora do
-- Controle de Prazos do PDI.
--
-- Pré-requisito: a migration 20260904120000_pdi_controle_prazos.sql já
-- aplicada (tabela public.pdi_controle_prazos existente, paciente_id SEM FK).
--
-- Gerado em 2026-09-04. Casados (entram no INSERT abaixo): 206 linhas
-- de 209 linhas da planilha, 204 paciente_id
-- distintos gravados (ver "linha_duplicada_na_planilha" nas exceções abaixo).
-- Ficaram de fora por não achar o paciente na TiTa (não encontrado /
-- ambíguo): 3. As demais notas abaixo (data de validade fora do
-- formato, especialista não reconhecida, casado por prefixo) são avisos e
-- NÃO tiram o paciente do INSERT.
--
-- especialista_tita_id: 8648 = Amanda Ribeiro Campos, 8649 = Gracielle Rayane
-- Faria Miranda (confirmados 04/09/2026, ver comentário da coluna na
-- migration de schema). Quando o texto da coluna "Especialista" da planilha
-- não continha nem "amanda" nem "gracielle" (normalizado), o insert grava
-- NULL e o paciente é listado como exceção "especialista_nao_reconhecida" —
-- não bloqueia o paciente_id/datas/observações.
--
-- Idempotente: ON CONFLICT (paciente_id) DO UPDATE, seguro rodar mais de uma
-- vez (reaplica os mesmos valores da planilha, não duplica linha).
--
-- ─── EXCEÇÕES (pacientes da planilha que NÃO entram neste INSERT, ou entram
--     com aviso) ──────────────────────────────────────────────────────────
--
--   - "Bernardo Andrade de Sousa Peçanha" — data_validade_nao_iso: valor="Dezembro" (ID Favorecido=11544, gravado como NULL)
--   - "Davi Yuri" — casado_por_prefixo: TiTa="Davi Yuri Lapa Rigaud" (ID Favorecido=12696) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Esther Martins Palhares" — casado_por_prefixo: TiTa="Esther Martins Palhares Azevedo" (ID Favorecido=12469) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Gabriel de Santana do Nascimento" — casado_por_prefixo: TiTa="Gabriel De Santana Do Nascimento Silva" (ID Favorecido=11323) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Guilherme Leopoldo da Paixão" — casado_por_prefixo: TiTa="Guilherme Leopoldo Da Paixão De Souza" (ID Favorecido=12525) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Henry Pietro" — nao_encontrado
--   - "João Lucas  de Oliveira" — casado_por_prefixo: TiTa="João Lucas De Oliveira Lima" (ID Favorecido=19364) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Josué Felipe Amaral" — casado_por_prefixo: TiTa="Josué Felipe Amaral De Souza" (ID Favorecido=11645) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Kylian dos Santos Moura" — data_validade_nao_iso: valor="Agosto" (ID Favorecido=11650, gravado como NULL)
--   - "Laylla De Carvalho Da Silva Chaves" — data_validade_nao_iso: valor="Maio" (ID Favorecido=11654, gravado como NULL)
--   - "Luiz Felipe Mariano" — ambiguo: ID Favorecido=12517 (Luiz Felipe Mariano Vasconcelos), ID Favorecido=20945 (Luiz Felipe Mariano Vasconcelos)
--   - "Mateus Muniz dos Santos" — casado_por_prefixo: TiTa="Mateus Muniz Dos Santos Jardim" (ID Favorecido=14137) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Matheus da Silva Chaves" — data_validade_nao_iso: valor="Otubro/2026" (ID Favorecido=12417, gravado como NULL)
--   - "Raphael Hernandes" — casado_por_prefixo: TiTa="Raphael Hernandes Tavares Bazoni" (ID Favorecido=11716) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Sara Heloise" — casado_por_prefixo: TiTa="Sara Heloise Alves Carvalho" (ID Favorecido=11727) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Teste 1" — nao_encontrado
--   - "Valentina Falção" — casado_por_prefixo: TiTa="Valentina Falcão Queiroz Santos" (ID Favorecido=11738) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Samuel Alimandro" — casado_por_prefixo: TiTa="Samuel Alimandro Martins" (ID Favorecido=11718) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Raphael Hernandes" — casado_por_prefixo: TiTa="Raphael Hernandes Tavares Bazoni" (ID Favorecido=11716) — nome da planilha é prefixo do nome completo na TiTa; ENTROU normalmente no insert, listado aqui só para conferência humana
--   - "Raphael Hernandes Tavares Bazoni" — linha_duplicada_na_planilha: paciente_id=11716 aparece 2x na planilha; o UPSERT roda na ordem do arquivo, então a ÚLTIMA linha (observações="Avaliação pausada, paciente encontra-se em processo de luto") é a que fica gravada
--   - "Samuel Alimandro Martins" — linha_duplicada_na_planilha: paciente_id=11718 aparece 2x na planilha; o UPSERT roda na ordem do arquivo, então a ÚLTIMA linha (observações="Passagem de caso em 03/2026.") é a que fica gravada
--
-- Relatório legível (mesmo conteúdo, formatado por motivo):
--   scratchpad/pdi_migracao_excecoes.md
--
-- DEPOIS de rodar isto com sucesso, confira:
--   SELECT count(*) FROM public.pdi_controle_prazos;  -- esperado 204
-- ============================================================================

BEGIN;

-- Adrian Araújo Nery (ID Favorecido / paciente_id=11511)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11511, 8648, '2026-04-30'::date, '2027-01-01'::date, 'Tem PIC ativo, rodando os treinos', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Agatha Cristine Pereira Rangel Dos Santos (ID Favorecido / paciente_id=14133)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14133, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Alice Lopes De Sousa Do Nascimento (ID Favorecido / paciente_id=11513)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11513, 8648, '2026-05-01'::date, '2027-01-01'::date, '03/26: Sondagem 04/26 fechar o gráfico: Já esta em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Alice Reis Pereira (ID Favorecido / paciente_id=11515)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11515, 8649, '2025-12-20'::date, '2026-10-01'::date, 'O PIC trimestral vai fechar em Abril', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Alice Vitória Lima Belini (ID Favorecido / paciente_id=11516)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11516, 8649, '2025-12-01'::date, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Ângelo Rangel Rocha (ID Favorecido / paciente_id=14141)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14141, 8649, NULL, NULL, 'Rodando programa fechamento trimestral setembro 2026.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Anna Júlia Ferreira Torres (ID Favorecido / paciente_id=11521)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11521, 8649, '2026-06-01'::date, '2027-02-01'::date, 'Paciente esta em processo de realização', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Anny Karoline Soares Pedretti (ID Favorecido / paciente_id=11522)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11522, 8649, '2026-05-30'::date, '2027-02-01'::date, 'Iniciou a reavaliação, esta sendo elaborado o PIC tempórario. Paciente Faltosa.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Antonella Da Silva Cardoso (ID Favorecido / paciente_id=12429)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12429, 8648, '2025-04-30'::date, NULL, 'Finalizar reavaliação, construir relatório e PIC.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Antonella Machado Neves Da Silva (ID Favorecido / paciente_id=11524)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11524, 8648, '2025-08-30'::date, '2026-06-30'::date, 'Paciente encontra-se em reavaliação, PIC esta na validade.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur De Jesus Marciano (ID Favorecido / paciente_id=11528)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11528, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur De Paiva Ribeiro (ID Favorecido / paciente_id=11529)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11529, 8649, '2025-11-01'::date, '2026-07-01'::date, 'Iniciar a avaliação VB-MAPP nível 2 e 3', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Dias Senna Machado (ID Favorecido / paciente_id=14545)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14545, 8649, NULL, NULL, 'Rodando avaliação VB- MAPP', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Dos Santos Lopes (ID Favorecido / paciente_id=11530)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11530, 8648, '2026-07-01'::date, NULL, 'Vai fechar o PDI em junho e entrará em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Harry Kliguer Maximo Dantas (ID Favorecido / paciente_id=11533)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11533, 8648, '2026-04-01'::date, NULL, '03/26: finalização da reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Henrique Pinheiro Da Silva (ID Favorecido / paciente_id=11436)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11436, 8648, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Luiz Maciel Fortes (ID Favorecido / paciente_id=11509)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11509, 8648, '2026-05-01'::date, '2027-02-01'::date, 'Rodando programa e PIC OK', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Santos Coutinho (ID Favorecido / paciente_id=11536)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11536, 8648, '2026-07-01'::date, NULL, '03/2026: Fechamento PDI trimestral 06/26: Fechamento PDI semestral e inicio da reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Silvestre (ID Favorecido / paciente_id=11537)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11537, 8648, '2026-04-01'::date, NULL, 'Finalizando avaliação do VBMAPP, Nível 2', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Vieira De Almeida Lima (ID Favorecido / paciente_id=11538)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11538, 8648, '2026-05-01'::date, NULL, 'Relatório de desligamento', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Arthur Vitorino Santana (ID Favorecido / paciente_id=11539)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11539, 8648, '2026-03-01'::date, NULL, 'Rodando treino (PIC ok)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Beatriz Ceres De Castro Neves (ID Favorecido / paciente_id=11540)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11540, 8649, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Benicio Adriano De Pontes Rodrigues (ID Favorecido / paciente_id=11541)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11541, 8648, '2026-01-01'::date, '2026-10-01'::date, 'PIC ativo, tem folha de programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Benício Calheiros De Oliveira Brito (ID Favorecido / paciente_id=11542)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11542, 8648, '2026-05-30'::date, '2027-02-01'::date, 'Está em reavaliação no nível 2 do vb mapp.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Benício Santiago De Souza (ID Favorecido / paciente_id=14215)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14215, 8649, '2026-04-30'::date, '2027-02-01'::date, 'Esta rodando o programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Benjamim Vilazio Kmiciak (ID Favorecido / paciente_id=11543)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11543, 8649, '2026-04-01'::date, NULL, 'Finalizou a avaliação.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bernardo Andrade De Sousa Peçanha (ID Favorecido / paciente_id=11544)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11544, 8649, '2026-02-25'::date, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bernardo Antônio Trindade Ferreira Castro De Souza Bezerra (ID Favorecido / paciente_id=11545)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11545, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bernardo De Brito De Lima (ID Favorecido / paciente_id=11546)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11546, 8648, '2026-04-01'::date, NULL, 'Rodando treino (PIC ok)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bernardo Freires Pessoa Oterio (ID Favorecido / paciente_id=11548)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11548, 8649, '2026-05-01'::date, NULL, 'Está em reavaliação, Paciente esta realizando terapia no horario escolar, a mãe precisa assinar um documento junto a advogada para liberação. Paciente encontra-se sem atendimento ABA.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bernardo Wallace Alves Marques (ID Favorecido / paciente_id=11549)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11549, 8648, '2026-03-01'::date, NULL, 'PDI ativo e rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bianca Alves Candido (ID Favorecido / paciente_id=11550)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11550, 8648, '2026-04-30'::date, '2027-01-01'::date, 'Por orientação da supervisão o paciente só iniciará o novo PIC em maio. Esta rodando o PIC temporário. Avaliação Finalizada abril/2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bianca Coimbra Figueira (ID Favorecido / paciente_id=11551)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11551, 8649, '2026-08-01'::date, NULL, '03/26: Sondagem 04/26: Fechamento trimestral 07/2026: fechamento semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Brayn Henrique Marques De Oliveira (ID Favorecido / paciente_id=11745)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11745, 8648, '2026-01-01'::date, '2026-09-01'::date, 'Rodando treino (PIC ok)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Bryan Queiroz Travaglia (ID Favorecido / paciente_id=11554)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11554, 8648, '2026-07-01'::date, NULL, 'PDI em atraso, rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Caio Henrique Machado Dos Anjos (ID Favorecido / paciente_id=11556)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11556, 8648, '2026-04-01'::date, NULL, 'PDI ativo e rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Carlos Haniel Correa Da Silva (ID Favorecido / paciente_id=11560)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11560, 8649, '2026-04-01'::date, '2026-12-01'::date, 'Esta em avaliação, paciente ja possui PIC temporário', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Cauã Da Fonseca Marques Silva (ID Favorecido / paciente_id=11561)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11561, 8648, '2026-07-01'::date, NULL, 'Entrará em reavalição', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Cesar Augusto Bianchini Miranda (ID Favorecido / paciente_id=11563)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11563, 8648, '2026-04-01'::date, NULL, 'Está no nível 3 do Vbmapp (PACIENTE PRIORIDADE)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Clara Amorim David (ID Favorecido / paciente_id=11565)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11565, 8648, '2026-05-01'::date, NULL, 'Está no nível 3 do Vbmapp', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Clarisse Dos Santos Marques (ID Favorecido / paciente_id=11568)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11568, 8649, '2026-03-01'::date, '2026-11-01'::date, 'O relatório/ PIC esta sendo elaborado.  Paciente finalizou a avaliação, tem um PIC temporário.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Daniel Gualandi Paulino (ID Favorecido / paciente_id=11570)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11570, 8648, '2025-11-01'::date, '2026-08-01'::date, 'Montar um novo PDI, apresentar para a mãe e começar os treinos novos.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Daniel Oliveira Cardoso (ID Favorecido / paciente_id=11571)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11571, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Danilo Figueiredo Rego (ID Favorecido / paciente_id=11305)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11305, 8648, '2026-05-01'::date, NULL, 'Em avaliação do VBMAPP', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Azevedo Coutinho (ID Favorecido / paciente_id=11443)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11443, 8648, '2026-07-01'::date, NULL, 'Fechar o PDI trimestral com os dados que já tem.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Caetano Medeiros (ID Favorecido / paciente_id=11572)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11572, 8648, '2026-04-01'::date, NULL, 'PDI ativo e rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Dantas Dos Reis De Vasconcelos (ID Favorecido / paciente_id=11575)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11575, 8649, NULL, '2027-01-01'::date, 'Paciente ainda não iniciou a avaliação, porque no dia da avaliação o paciente esta realizando avaliação neuropsicologica em outro lugar, paciente tem PIC temporário. A avaliação  será ABLLS.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi De Araújo Roque Gomes Dos Santos (ID Favorecido / paciente_id=11576)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11576, 8649, '2026-03-23'::date, '2027-01-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Gomes Guariento De Souza (ID Favorecido / paciente_id=11577)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11577, 8648, '2026-06-01'::date, NULL, '04/2026: fechamento PDI trimestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Lucas Araújo Alves Moreira (ID Favorecido / paciente_id=11578)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11578, 8648, '2026-03-01'::date, '2026-11-01'::date, 'Iniciar reavaliação (Skill)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Lucas De Oliveira Capela (ID Favorecido / paciente_id=11579)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11579, 8649, '2026-06-01'::date, NULL, '03/26: Fechamento PDI semestral  04/26: Entrará em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Lucas Do Couto Noronha (ID Favorecido / paciente_id=11580)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11580, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Lucas Mello Dias (ID Favorecido / paciente_id=11581)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11581, 8648, '2026-08-01'::date, NULL, 'Iniciará reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Lucca Alves Da Silva (ID Favorecido / paciente_id=11582)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11582, 8648, '2026-07-01'::date, NULL, 'em atraso por faltas, vai tentar fechar o PDI esse mês', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Davi Yuri Lapa Rigaud (ID Favorecido / paciente_id=12696)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12696, 8648, '2026-06-01'::date, NULL, 'Iniciar reavaliação, Skill Solution', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Diana Costa Damasceno (ID Favorecido / paciente_id=11584)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11584, 8649, '2026-07-01'::date, NULL, '03/2026: Sondagem 03/2026 realizado : fechamento semestral, e inicia a reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Eduardo Gomes Aguiar (ID Favorecido / paciente_id=11447)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11447, 8648, '2026-01-01'::date, '2026-11-01'::date, 'Rodando programa e PIC OK', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Eloa De Souza Muniz (ID Favorecido / paciente_id=11587)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11587, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Emanuel Abreu De Andrade (ID Favorecido / paciente_id=14447)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14447, 8649, NULL, NULL, 'Rodando avaliação VB-MAPP', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Enzo De Abreu Chaves (ID Favorecido / paciente_id=14219)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14219, 8648, '2026-06-01'::date, '2027-02-01'::date, 'vai sair da clínica', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Enzo Gabriel Marques De Oliveira (ID Favorecido / paciente_id=11589)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11589, 8648, '2026-05-01'::date, NULL, 'Entrar em reavaliação.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Eric Gabriel Vitório Nunes (ID Favorecido / paciente_id=11590)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11590, 8648, '2026-04-01'::date, NULL, 'Processo de encaminhamento para outra clínica', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Esther Martins Palhares Azevedo (ID Favorecido / paciente_id=12469)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12469, 8649, '2026-07-01'::date, NULL, 'Folha de registro gráfico de treino 
Ajustar o RELATÓRIO e o PIC, acrescentando 2 objetivos novos e retirando 1', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Felipe De Oliveira Alves Fernandes (ID Favorecido / paciente_id=11594)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11594, 8649, '2025-09-01'::date, '2026-05-01'::date, 'gráfico de treino', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Fernando Gael Farias Soares (ID Favorecido / paciente_id=11596)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11596, 8649, '2026-04-01'::date, '2026-12-01'::date, 'Ajustar o RELATÓRIO e o PIC, acrescentando 2 objetivos novos e retirando 1', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Fernando Gonçalves Dos Passos (ID Favorecido / paciente_id=11597)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11597, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriel De Andrade Souza (ID Favorecido / paciente_id=11598)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11598, 8648, '2026-03-01'::date, NULL, 'Finalizando avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriel De Santana Do Nascimento Silva (ID Favorecido / paciente_id=11323)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11323, 8648, '2026-03-01'::date, NULL, 'Entregue PDI novo em 03/2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriel De Sousa Do Nascimento (ID Favorecido / paciente_id=11599)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11599, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriel Lira Da Silva (ID Favorecido / paciente_id=11601)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11601, 8648, '2026-06-01'::date, NULL, 'Fechamento de PDI', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriel Pereira De Oliveira (ID Favorecido / paciente_id=14121)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14121, 8648, NULL, NULL, 'William não está localizando o PDI', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriel Silva Ferreira (ID Favorecido / paciente_id=11602)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11602, 8648, '2026-06-01'::date, NULL, '04/2026: Fechamento PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabriela De Ornellas Pinheiro (ID Favorecido / paciente_id=11327)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11327, 8649, '2026-05-01'::date, NULL, 'Está em Avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gabrielle Gregório Manço (ID Favorecido / paciente_id=11603)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11603, 8648, '2026-03-30'::date, NULL, 'Tem PIC ativo, fazer folha de registro, planilha e rodar os treinos.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gael Silva Manhães (ID Favorecido / paciente_id=11606)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11606, 8648, '2026-03-01'::date, NULL, 'Tem PIC, rodar programa.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Geovanna Carvalho Souza (ID Favorecido / paciente_id=11607)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11607, 8649, '2026-01-01'::date, '2026-09-01'::date, 'Trimestral fecha final de Março/ DESLIGADA', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Guilherme Cardozo Da Silva (ID Favorecido / paciente_id=11608)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11608, 8649, '2026-04-01'::date, NULL, 'Finalizou a avaliação, esta em processo de elaboração do novo relatório e PIC', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Guilherme Da Silva Hespanhol Barbosa (ID Favorecido / paciente_id=14244)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14244, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Guilherme De Carvalho Tiburcio (ID Favorecido / paciente_id=11610)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11610, 8648, '2026-05-01'::date, NULL, 'Finalizando reavaliação nível 2', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Guilherme Dias Senna Machado (ID Favorecido / paciente_id=14546)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14546, 8648, NULL, NULL, 'PDI ativo, rodando programa.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Guilherme Leopoldo Da Paixão De Souza (ID Favorecido / paciente_id=12525)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12525, 8649, '2026-04-30'::date, '2027-01-01'::date, 'Por orientação da supervisão o paciente só iniciará o novo PIC em maio. Esta rodando o PIC temporário. Avaliação Finalizada 04/26', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Gustavo De Melo Do Nascimento (ID Favorecido / paciente_id=11613)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11613, 8648, '2025-10-01'::date, '2026-07-01'::date, 'Reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Heitor Batista De Araújo Pacheco (ID Favorecido / paciente_id=17940)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (17940, 8649, NULL, NULL, 'paciente faltoso, esta para iniciar a avaliação mas devido as faltas está sendo mais dificultoso. Realizar um PIC temporário para ele. DESLIGADO', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Heitor Emanuel Da Silva Soares (ID Favorecido / paciente_id=11615)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11615, 8648, '2026-09-01'::date, NULL, '04/26: Fechamento PDI trimestral 07/26: Fechamento PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Heitor Lemos Coutinho (ID Favorecido / paciente_id=12404)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12404, 8649, '2026-01-01'::date, '2026-10-01'::date, 'Paciente tem trimestral no PIC que será fechado em abril.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Heitor Leone Rezende Dos Santos (ID Favorecido / paciente_id=14128)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14128, 8648, NULL, NULL, 'PDI ativo, rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Heitor Portela Benigno (ID Favorecido / paciente_id=11616)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11616, 8649, '2026-05-01'::date, NULL, 'Está em reavaliação (realizou a passagem de caso 03/2026)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Heitor Prado Cuquejo Pereira Bonfim (ID Favorecido / paciente_id=11617)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11617, 8648, '2026-04-01'::date, NULL, 'Rodando treino (PIC ok)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Helena Carvalho Alcantara Martins Barcellos (ID Favorecido / paciente_id=14162)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14162, 8648, NULL, NULL, 'Rodando VBMAPP 3', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Helena Esteves Brasil (ID Favorecido / paciente_id=14251)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14251, 8649, '2026-03-27'::date, '2026-12-01'::date, 'Folha de registro 
gráfico de treino 
confirmar com a Pauline se ja entregou o relatório.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Helena Valentina Gomes De Melo (ID Favorecido / paciente_id=11620)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11620, 8648, '2026-05-01'::date, NULL, 'Finalizando reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Ícaro Melo Da Costa (ID Favorecido / paciente_id=11625)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11625, 8648, '2026-07-01'::date, NULL, '05/2026: Revisão PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Isaac Pacheco Oliveira (ID Favorecido / paciente_id=11627)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11627, 8649, '2026-08-01'::date, NULL, '03/06: Fechamento Trimestral 06/2026: Fechamento semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Isabela Domingos Chaves (ID Favorecido / paciente_id=12407)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12407, 8648, '2026-03-01'::date, '2026-11-30'::date, 'Trimestral fecha em 06/2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Isabella De Mesquita Machado (ID Favorecido / paciente_id=14298)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14298, 8649, '2026-04-01'::date, NULL, 'Está em Avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Isabella Maria Soares De Carvalho (ID Favorecido / paciente_id=11628)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11628, 8648, '2025-12-15'::date, '2026-10-01'::date, 'ok', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Isaque Vitor Martins De Jesus (ID Favorecido / paciente_id=11630)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11630, 8648, '2026-06-01'::date, '2027-02-01'::date, 'Finalizar avaliação Skill', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Isis Barbosa Santanna (ID Favorecido / paciente_id=14131)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14131, 8648, '2026-05-01'::date, '2027-02-01'::date, 'Rodando VBMAPP 3', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Ismael De Souza Tardin (ID Favorecido / paciente_id=12490)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12490, 8649, NULL, NULL, 'Voltou para clinica no inicio de Março, vai iniciar avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Jhony Lucca Nazareno Da Silva Couto (ID Favorecido / paciente_id=11632)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11632, 8648, '2026-04-01'::date, '2026-12-01'::date, 'Entrará em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- João Guilherme Da Silva Guarani (ID Favorecido / paciente_id=11634)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11634, 8648, '2026-04-01'::date, NULL, 'Finalizar avaliação Skill', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- João Lucas De Oliveira Lima (ID Favorecido / paciente_id=19364)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (19364, 8649, NULL, NULL, 'Paciente retornou para clinica em Março', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- João Lucas Pereira Da Silva (ID Favorecido / paciente_id=11635)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11635, 8648, '2026-06-01'::date, NULL, '04/2026: Fechamento PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- João Miguel Fernandes De Melo (ID Favorecido / paciente_id=11637)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11637, 8649, '2026-03-30'::date, '2026-12-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- João Philipe Neves De Carvalho (ID Favorecido / paciente_id=11639)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11639, 8648, '2026-08-01'::date, NULL, 'fechamento para março, porem será fechado em abril. será necessário iniciar reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- John Lucas Borges De Araujo (ID Favorecido / paciente_id=11641)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11641, 8649, NULL, NULL, 'Paciente em processo de estabilidade, muitos comportamentos interferentes. ( por orientação da supervisão foi necessario pausar a aplicação do programa).', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- José Pedro Borges Dos Santos (ID Favorecido / paciente_id=11642)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11642, 8648, '2026-08-01'::date, NULL, 'Iniciar processo de alta', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- José Valter Soares Do Nascimento (ID Favorecido / paciente_id=11643)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11643, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Josué Felipe Amaral De Souza (ID Favorecido / paciente_id=11645)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11645, 8649, '2026-04-01'::date, '2026-12-01'::date, 'Rodando o programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Juan Rocha Araujo (ID Favorecido / paciente_id=11646)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11646, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Kaiky Oliveira De Paiva (ID Favorecido / paciente_id=12675)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12675, 8648, '2026-05-01'::date, NULL, 'Avaliação Essencial para viver - iniciar o relatório', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Kaique Samuel Soares De Carvalho (ID Favorecido / paciente_id=12408)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12408, 8648, NULL, NULL, 'paciente com frequencia de faltas. No dia 22/06 foi enviado uma mensagem no grupo do Tita pela Camila.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Kaleb Agamémnon Soares Pinto Da Silva (ID Favorecido / paciente_id=11647)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11647, 8648, '2026-04-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Kourtney Savino Lopes (ID Favorecido / paciente_id=11649)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11649, 8649, '2026-07-01'::date, NULL, '05/26: Revisão PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Kylian Dos Santos Moura (ID Favorecido / paciente_id=11650)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11650, 8649, '2025-12-01'::date, NULL, 'Entregou o trimestral em Março para a responsável', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Laura Alves Simões (ID Favorecido / paciente_id=11651)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11651, 8648, '2026-05-01'::date, NULL, 'Está no nível 3 do Vbmapp', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Laura Lis Santos Menezes (ID Favorecido / paciente_id=11652)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11652, 8649, '2026-08-01'::date, NULL, '03/26: Fechamento PDI trimestral  06/26: Fechamento PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Laura Victória Schelbaner Macedo (ID Favorecido / paciente_id=11653)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11653, 8649, '2026-01-01'::date, '2026-09-01'::date, 'Paciente tem trimestral para fechar em abril 2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Laylla De Carvalho Da Silva Chaves (ID Favorecido / paciente_id=11654)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11654, 8649, '2025-09-01'::date, NULL, 'Fechado o trimestral, iniciou uma nova reavaliação.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Leonardo Do Nascimento Freitas Filho (ID Favorecido / paciente_id=11655)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11655, 8649, '2026-03-30'::date, '2026-12-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Levi Braga Rodrigues Oliveira Da Silva (ID Favorecido / paciente_id=11656)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11656, 8648, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Levi Lúcio Castro De Souza (ID Favorecido / paciente_id=14116)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14116, 8648, NULL, NULL, 'Rodando Avaliação Social Skill', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Lorena Soares Moreira (ID Favorecido / paciente_id=11659)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11659, 8649, '2026-04-30'::date, '2027-01-01'::date, 'Por orientação da supervisão o paciente só iniciará o novo PIC em maio. Esta rodando o PIC temporário. Avaliação Finalizada 03/26', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Luan Miguel Soares Bulle De Oliveira (ID Favorecido / paciente_id=14241)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14241, 8649, '2025-12-01'::date, '2026-09-01'::date, 'semestral fecha em 06/2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Lucas Domingos Marques (ID Favorecido / paciente_id=11660)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11660, 8648, '2026-04-01'::date, NULL, 'Rodando treino (PIC ok)', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Lucas Teixeira Vieira (ID Favorecido / paciente_id=11661)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11661, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Lucca Lionel Dos Santos Fortes (ID Favorecido / paciente_id=11662)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11662, 8649, '2026-03-30'::date, '2026-12-01'::date, 'Realizar o relatório/PIC gráfico e folha de programa.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Luis Pietro Ferreira Trindade (ID Favorecido / paciente_id=11664)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11664, 8648, '2026-05-01'::date, NULL, 'Realizar o relatório/PIC gráfico e folha de programa.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Luiz Miguel Da Silva Narcizo (ID Favorecido / paciente_id=11665)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11665, 8648, '2026-08-01'::date, NULL, 'Inicar reavaliação - Skill', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Luiza Carvalho De Oliveira (ID Favorecido / paciente_id=11666)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11666, 8648, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Maite Peterson Bonifacio (ID Favorecido / paciente_id=11667)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11667, 8649, '2026-03-30'::date, '2026-12-01'::date, 'realizar o relatório e o PIC, foi rodado VB-MAPP e Barreira', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Manuella Azevedo Coutinho (ID Favorecido / paciente_id=11669)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11669, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Marcelly Oliveira Gomes (ID Favorecido / paciente_id=11671)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11671, 8649, '2026-07-01'::date, '2027-03-01'::date, 'Paciente iniciou avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Maria Antônia Werner De Carvalho E Silva (ID Favorecido / paciente_id=11673)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11673, 8648, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Maria Clara Bertelli Da Conceição (ID Favorecido / paciente_id=11674)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11674, 8648, '2026-03-01'::date, NULL, '03/26: entregue novo PIC', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Maria Eduarda Bezerra Goes (ID Favorecido / paciente_id=11675)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11675, 8649, '2026-04-01'::date, NULL, '03/26: Finalização da reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Maria Luiza Celles Ferreira (ID Favorecido / paciente_id=11677)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11677, 8648, '2026-05-01'::date, '2026-07-01'::date, 'Paciente esta em reavaliação, porem tem faltado bastante, paciente tem PIC temporário', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Maria Yohanna De Freitas Cristo De Oliveira (ID Favorecido / paciente_id=11678)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11678, 8648, '2026-08-01'::date, NULL, 'Reavaliação em junho', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Mariana Mallet Soares Gomes Gimenes (ID Favorecido / paciente_id=14277)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14277, 8649, '2025-11-01'::date, '2026-07-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Mateus Muniz Dos Santos Jardim (ID Favorecido / paciente_id=14137)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14137, 8648, NULL, NULL, 'PDI ativo, rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Matheus Caetano Pires (ID Favorecido / paciente_id=11679)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11679, 8648, '2026-04-01'::date, NULL, '03/26: Finalização da reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Matheus Correia Da Silva Lopes (ID Favorecido / paciente_id=11680)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11680, 8648, '2026-03-01'::date, NULL, '03/2026: Entregar novo PIC', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Matheus Da Silva Chaves (ID Favorecido / paciente_id=12417)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12417, 8649, '2026-02-01'::date, NULL, 'Trimestral 05/2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Matheus Da Silva Soares Maciel (ID Favorecido / paciente_id=11681)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11681, 8648, '2026-06-01'::date, NULL, 'Inicar reavaliação - Skill', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Matheus Guilherme Dos Santos De Azevedo (ID Favorecido / paciente_id=11683)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11683, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Mattheus Prata Moura (ID Favorecido / paciente_id=11686)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11686, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Aguiar Ambrosio Gonçalves (ID Favorecido / paciente_id=11687)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11687, 8649, NULL, NULL, 'Paciente iniciou a reavaliação, tem PIC temporário.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Ângelo Dos Santos Almeida (ID Favorecido / paciente_id=14114)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14114, 8649, '2025-12-01'::date, '2026-08-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Da Silva Monsores (ID Favorecido / paciente_id=11688)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11688, 8649, '2026-04-30'::date, '2027-01-01'::date, 'Por orientação da supervisão o paciente só iniciará o novo PIC em maio. Esta rodando o PIC temporário. Avaliação Finalizada 03/26', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Ferreira Nunes Pinto (ID Favorecido / paciente_id=11689)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11689, 8649, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel França De Castro (ID Favorecido / paciente_id=11691)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11691, 8648, NULL, NULL, 'Iniciar reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Medeiros Jardim Leone (ID Favorecido / paciente_id=14278)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14278, 8649, '2025-11-01'::date, '2026-07-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Pereira De Oliveira (ID Favorecido / paciente_id=14127)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14127, 8649, NULL, NULL, 'realizado o fechamento do semestral 09/04/2026, vai iniciar a reavaliação.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Pinheiro Da Silva (ID Favorecido / paciente_id=14279)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14279, 8649, '2026-04-01'::date, '2026-12-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Miguel Rodrigues De Queiroz (ID Favorecido / paciente_id=11692)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11692, 8648, '2026-06-01'::date, NULL, 'Tem PIC ativo, rodar os treinos', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Mirella Azevedo Coutinho (ID Favorecido / paciente_id=11694)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11694, 8648, '2026-08-01'::date, NULL, '05/2026: Revisão PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Moanna Freitas Dos Santos (ID Favorecido / paciente_id=11695)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11695, 8648, '2026-03-01'::date, '2026-12-01'::date, 'PDI ativo e rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Murillo Araujo Oliveira (ID Favorecido / paciente_id=11696)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11696, 8648, '2026-04-01'::date, NULL, 'em reavaliação do VBAPP - nível 3', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Murillo Britto Albuquerque (ID Favorecido / paciente_id=11697)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11697, 8648, '2026-05-01'::date, NULL, 'em processo de encaminhamento', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Nathan Machado Grossi (ID Favorecido / paciente_id=11699)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11699, 8649, '2026-03-23'::date, '2027-01-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Nicollas Adriel Da Silva Ribeiro (ID Favorecido / paciente_id=11701)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11701, 8649, '2026-04-06'::date, '2026-12-01'::date, 'Paciente vem apresentando faltas, tem PIC temporario.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Nycolas Eduardo Martins Marques (ID Favorecido / paciente_id=11702)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11702, 8648, '2026-04-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Oliver Dos Santos Gesteira (ID Favorecido / paciente_id=14284)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14284, 8648, '2026-02-01'::date, '2026-10-01'::date, 'ok', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Otávio Vale Paz (ID Favorecido / paciente_id=11703)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11703, 8649, '2026-07-10'::date, NULL, 'iniciar a reavaliação, aguardando a supervisão.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Otto Lougom Felicidade (ID Favorecido / paciente_id=11704)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11704, 8648, '2026-09-01'::date, NULL, 'Fechamento semestral, em processo de alta', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pablo Leonardo Cremonez Conceição (ID Favorecido / paciente_id=11705)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11705, 8648, '2026-06-10'::date, NULL, 'iniciar reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pedro Davi Siqueira Guarita (ID Favorecido / paciente_id=11707)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11707, 8648, NULL, NULL, 'Paciente com muitas faltas, processo parado', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pedro Henrique Mendes Imenes (ID Favorecido / paciente_id=11708)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11708, 8649, NULL, NULL, 'Fechar o PIC semestral e iniciar a reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pedro Lucas Pereira Barboza (ID Favorecido / paciente_id=11709)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11709, 8648, NULL, NULL, 'Reavaliação, verificar na pasta física se já tem alguma em andamento.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pedro Pacheco Otalora (ID Favorecido / paciente_id=11711)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11711, 8648, '2026-05-01'::date, NULL, 'PDI ativo e rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pedro Targino Abrahão (ID Favorecido / paciente_id=11713)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11713, 8648, NULL, NULL, 'PDI ativo, rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Phettrus De Jesus Lameira Da Silva (ID Favorecido / paciente_id=14253)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14253, 8648, NULL, NULL, 'Está em reavaliação, pegar na pasta física', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Pietro Ferreira D'Ávila (ID Favorecido / paciente_id=12669)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12669, 8649, '2026-05-30'::date, '2027-02-01'::date, 'Paciente encontra-se em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Raphael Hernandes Tavares Bazoni (ID Favorecido / paciente_id=11716)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11716, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Rodolfo Dantas Marques (ID Favorecido / paciente_id=14357)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14357, 8649, '2026-04-01'::date, '2026-12-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Samuel Alimandro Martins (ID Favorecido / paciente_id=11718)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11718, 8648, '2026-03-01'::date, NULL, 'Tem PIC, rodando programa.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Samuel Barzano Lagos Castello Branco (ID Favorecido / paciente_id=12401)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12401, 8649, NULL, NULL, 'Esta rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Samuel Elias Cesar Ferreira Da Silva (ID Favorecido / paciente_id=11720)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11720, 8648, '2026-08-01'::date, NULL, 'Em fechamento de PDI', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Samuel Rodrigues Rocha (ID Favorecido / paciente_id=11722)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11722, 8649, '2026-01-01'::date, '2026-09-01'::date, 'Trimestral fecha em abril 2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Samuel Soares Do Nascimento (ID Favorecido / paciente_id=11723)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11723, 8648, '2026-04-01'::date, NULL, 'Iniciar avaliação VBMAPP', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Sandro Samuel Das Neves Zeferino (ID Favorecido / paciente_id=11725)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11725, 8648, '2026-04-01'::date, NULL, 'Está em reavaliação, porém com muitas faltas.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Saory Araujo Oliveira (ID Favorecido / paciente_id=11726)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11726, 8648, '2026-05-01'::date, NULL, 'Iniciar reavaliação do VBMAPP', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Sara Ferreira Dias (ID Favorecido / paciente_id=14300)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14300, 8649, '2026-02-01'::date, '2026-11-01'::date, 'o PIC trimestral será fechado em Maio', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Sara Heloise Alves Carvalho (ID Favorecido / paciente_id=11727)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11727, 8649, NULL, NULL, 'Iniciará em abril', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Sophia Monteiro Gomes (ID Favorecido / paciente_id=11729)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11729, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Sophia Valentina Lopes Alvarado (ID Favorecido / paciente_id=11730)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11730, 8649, NULL, NULL, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Thais Silva De Souza (ID Favorecido / paciente_id=12488)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (12488, 8648, NULL, NULL, 'PDI ativo, rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Thales Alexandre Lessa Lopes (ID Favorecido / paciente_id=11732)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11732, 8649, NULL, NULL, 'Paciente encontra-se no processo de avaliação. PIC temporario', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Théo Alves Ventura (ID Favorecido / paciente_id=11733)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11733, 8648, '2026-05-01'::date, NULL, 'Está em reavaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Théo Andrade De Sousa Peçanha (ID Favorecido / paciente_id=16520)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (16520, 8649, '2026-04-01'::date, NULL, 'Está em avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Theo Meneses Da Silva (ID Favorecido / paciente_id=11734)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11734, 8648, '2026-04-01'::date, NULL, 'Tem PIC, rodando programa', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Theo Moraes De Oliveira (ID Favorecido / paciente_id=14130)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14130, 8648, NULL, NULL, 'PDI ativo, rodando programa. Em pausa por questões comportamentais', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Théo Nascimento Da Cruz (ID Favorecido / paciente_id=17416)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (17416, 8649, '2026-03-01'::date, '2026-12-01'::date, 'ok', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Théo Pellegrino Ferreira Do Bonfim (ID Favorecido / paciente_id=11746)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11746, 8649, '2025-09-20'::date, '2026-07-01'::date, 'Semestral será fechado em abril, e vai iniciar a proxima avaliação', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Tiago De Sousa Nunes (ID Favorecido / paciente_id=11735)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11735, 8649, '2026-04-01'::date, '2026-12-01'::date, 'terminou a avaliação, iniciar o relatório.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Tomaz De Barros Quirino (ID Favorecido / paciente_id=11736)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11736, 8649, '2026-03-01'::date, '2026-11-01'::date, 'Trimestral fecha em Junho 2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Valentim Sousa Freire (ID Favorecido / paciente_id=11737)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11737, 8649, '2026-03-30'::date, NULL, 'Finalizou a avaliação.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Valentina Falcão Queiroz Santos (ID Favorecido / paciente_id=11738)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11738, 8649, '2026-04-01'::date, '2026-12-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Vicente Pimenta De Aguiar (ID Favorecido / paciente_id=14146)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (14146, 8648, '2026-07-01'::date, NULL, 'Inicio reavaliação Social Skill', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Victor Gabriel Nascimento Da Silva (ID Favorecido / paciente_id=11740)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11740, 8648, '2026-08-01'::date, NULL, '04/26: Fechamento PDI trimestral 06/26: Fechamento PDI semestral', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Vitória Alves Correia (ID Favorecido / paciente_id=11510)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11510, 8648, '2025-09-01'::date, '2026-06-01'::date, 'Iniciou a reavaliação, fechou o PIC anterior dia 17/03/2026', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Yago Felipe Cardoso Rezende (ID Favorecido / paciente_id=11741)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11741, 8649, '2026-03-01'::date, '2026-12-01'::date, 'Passagem de caso da Vanessa para Lorena Abril 2026.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Ysadora Corcino Aranda Da Costa (ID Favorecido / paciente_id=11742)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11742, 8649, '2026-02-01'::date, '2026-11-01'::date, NULL, 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Yure Bernardo De Lima Santanna (ID Favorecido / paciente_id=11743)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11743, 8648, '2026-04-01'::date, NULL, 'atualizar o PDI na pasta', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Samuel Alimandro Martins (ID Favorecido / paciente_id=11718)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11718, 8649, '2026-04-22'::date, NULL, 'Passagem de caso em 03/2026.', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

-- Raphael Hernandes Tavares Bazoni (ID Favorecido / paciente_id=11716)
INSERT INTO public.pdi_controle_prazos
  (paciente_id, especialista_tita_id, data_avaliacao, data_validade, observacoes, criado_por_nome, atualizado_por_nome)
VALUES
  (11716, 8649, '2026-05-01'::date, '2027-01-01'::date, 'Avaliação pausada, paciente encontra-se em processo de luto', 'Migração planilha PDI', 'Migração planilha PDI')
ON CONFLICT (paciente_id) DO UPDATE SET
  especialista_tita_id = EXCLUDED.especialista_tita_id,
  data_avaliacao        = EXCLUDED.data_avaliacao,
  data_validade          = EXCLUDED.data_validade,
  observacoes            = EXCLUDED.observacoes,
  atualizado_por_nome    = EXCLUDED.atualizado_por_nome;

COMMIT;

-- ---------------------------------------------------------------------------
-- Conferência (rode depois do COMMIT):
--
-- SELECT count(*) FROM public.pdi_controle_prazos;  -- esperado 204
-- SELECT count(*) FROM public.pdi_controle_prazos WHERE especialista_tita_id IS NULL;
-- ---------------------------------------------------------------------------
