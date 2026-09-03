-- =============================================================================
-- O de-para do card de inclusão de terapia, conferido contra os dados reais
-- =============================================================================
-- Este arquivo é o RESULTADO do "passo zero" que
-- 20260902_inclusao_terapia_clickup_config.sql descreve como pendente. Os ids
-- foram descobertos em 2026-09-02 com os dois scripts daquela pasta, e cada
-- de-para foi cruzado com os valores que a grade REALMENTE tem (não com os que
-- se supunha ter). Os achados desse cruzamento estão registrados abaixo porque
-- são a razão de o de-para ter a forma que tem.
--
-- PRÉ-REQUISITO: a migration 20260902120000_inclusao_terapia_avisa_cronograma.sql
-- precisa estar aplicada (em 02/09 NÃO estava — `inclusoes_terapia` e
-- `inclusoes_terapia_config` não existiam no banco). Sem ela este UPDATE falha
-- com 42P01, o que é o comportamento certo: melhor errar aqui que ligar meia
-- automação.
--
-- ESTE ARQUIVO NÃO LIGA A AUTOMAÇÃO. `ativo` continua false ao fim dele. A
-- estreia é um UPDATE separado, no fim, deliberado — ver o último bloco.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O DESTINO, confirmado
-- ─────────────────────────────────────────────────────────────────────────────
-- Lista PACIENTES = 901112985991, em Processos Operacionais / Cronograma.
-- Candidata ÚNICA entre as 17 listas do workspace, e a form view dela é
--   https://forms.clickup.com/9011600909/f/8cj47gd-10171/NS6NIG90F6VS01DDQQ
-- isto é, o mesmo formulário que o time preenche à mão hoje. Sem ambiguidade.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE O DE-PARA NÃO É IGUALDADE DE STRING
-- ─────────────────────────────────────────────────────────────────────────────
-- Medido em 53.692 linhas ativas da grade (data >= 2026-08-01). Três achados,
-- e cada um teria criado card com campo vazio — calado, porque o ClickUp
-- DESCARTA custom field inválido devolvendo 201 (não 400).
--
-- 1. UNIDADE não vem de unidade_nome. Aquela coluna tem UM único valor,
--    "CLÍNICA UNIVERSO ABA", em 100% das linhas — nenhuma das 6 opções do
--    dropdown casa. Quem distingue unidade na grade é `sala_nome`, no padrão
--    "Unid. <Unidade> - <resto>". Extraído o prefixo, as três unidades saem com
--    a grafia EXATA do ClickUp: Realengo, Padre Miguel, Fazendinha.
--    Por isso o de-para de unidade é por PREFIXO de sala, e a chave abaixo é
--    "unidade_por_sala", não "unidade".
--
-- 2. CONVÊNIO precisa de normalização. 7 dos 15 valores da grade não casavam
--    por igualdade, e 5 eram só acento/caixa:
--      LEVE SAUDE (3651) -> LEVE SAÚDE      Amil Saude (520) -> Amil Saúde
--      POSTAL SAUDE (455) -> POSTAL SAÚDE   FuSEx (31) -> FUSEx
--      Unimed Nacional (106) -> UNIMED Nacional
--    Estão mapeados explicitamente, com a grafia da GRADE como chave, em vez de
--    depender de um unaccent/lower no consumidor: o de-para explícito é
--    auditável, e um valor novo aparece como card sem convênio (visível) em vez
--    de casar por acidente.
--
-- 3. ESPECIALIDADE é MULTIVALORADA. `terapia_nome` traz listas separadas por
--    vírgula ("Aplicador ABA (AE), Aplicador ABA (HS), Psicopedagogia" — 202
--    linhas). O campo do ClickUp é `labels`, que aceita vários, então o
--    consumidor precisa QUEBRAR POR VÍRGULA e mapear cada parte. Casar a string
--    inteira deixaria 18 valores órfãos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISÕES DO USUÁRIO (2026-09-02) — não inferir, foram escolhidas
-- ─────────────────────────────────────────────────────────────────────────────
--   • Unidade: DERIVAR de sala_nome (não deixar vazio, não fixar Sede).
--   • AT Externo Escola/Casa (8.468 linhas): "Ambiente Natural".
--   • Sala Teste (273 linhas): NÃO CRIAR CARD. É a chave "salas_sem_card".
--   • Convênio "Ainda não selecionado" (10.056) e "Administrativo" (8.016):
--     deixar o campo VAZIO. São 18 mil linhas e não existem no dropdown;
--     inventar "Particular" mentiria — indefinido não é particular.
--   • Origem da Solicitação: sempre "Terapêutico".
--   • Motivo: sempre "Alteração de Cronograma".
--     RESSALVA REGISTRADA: a rota já envia `modalidade`, então na modalidade
--     "novo" (paciente sem nenhuma sessão) o card dirá "Alteração" sobre um
--     cronograma que não existia. Foi decisão consciente do usuário; para
--     distinguir depois, basta trocar por motivo_por_modalidade.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CAMPOS QUE O ESBOÇO DO SCRIPT ERROU (nome, não existência)
-- ─────────────────────────────────────────────────────────────────────────────
--   "paciente"                -> o campo é "Nome do Paciente" (short_text)
--   "descreva a solicitação:" -> o campo é "Observações" (text)
-- Nenhum dos dois falta na lista; o esboço procurava por nomes do formulário.
-- =============================================================================

begin;

UPDATE public.inclusoes_terapia_config
SET
  clickup_workspace_id = '9011600909',
  clickup_list_id      = '901112985991',
  campos = jsonb_build_object(

    -- ── Texto livre: só field_id, o valor vem da outbox ────────────────────
    'nome_paciente', jsonb_build_object(
      'field_id', '15f3bc6b-a63d-497d-af86-40c2ca2b232f', 'type', 'short_text'),
    'solicitante', jsonb_build_object(
      'field_id', 'e7620b64-7615-454a-8c7b-c8ad548fa705', 'type', 'short_text'),
    'observacoes', jsonb_build_object(
      'field_id', '89f55b0e-939c-4985-abb2-df460c4d3252', 'type', 'text'),
    'data_inicio_vigencia', jsonb_build_object(
      'field_id', 'f8f66b04-ef5f-4bb1-b635-c98be65abf7b', 'type', 'date'),

    -- ── Dropdown de valor FIXO: uuid único, sem de-para ────────────────────
    'origem_solicitacao', jsonb_build_object(
      'field_id', '43aba883-8a2c-4575-a35c-590b13b4f686', 'type', 'drop_down',
      'valor',    'edb20841-6e83-4469-88a3-a03cc788f1a8'),  -- Terapêutico
    'motivo', jsonb_build_object(
      'field_id', '5ff3772d-5f36-43c5-b20f-ee250b8c6494', 'type', 'drop_down',
      'valor',    '03c30ad8-b020-4f61-9f63-a7b9ded75a79'),  -- Alteração de Cronograma

    -- ── Convênio: chave = grafia da GRADE, valor = uuid do ClickUp ─────────
    -- Ausente do mapa = campo não preenchido. É o caso de "Ainda não
    -- selecionado" e "Administrativo", de propósito.
    'convenio', jsonb_build_object(
      'field_id', '01cf002e-409b-4feb-baa5-bba58f925dfd', 'type', 'drop_down',
      'opcoes', jsonb_build_object(
        'ASSIM Saúde',            'fac42cff-e588-4924-a251-9b50e791cb1c',
        'SULAMERICA',             '9b3b31d4-56bf-4e03-b11a-17559e3d96b5',
        'Particular',             '9d3f4733-7808-4ca2-b164-b5764c3dc490',
        'BRADESCO SAÚDE S.A',     '94a0b363-76de-4457-9633-13700888deb7',
        'PORTO SEGURO',           '529c1823-8e20-481c-9c61-418b49bf79da',
        'SEGUROS UNIMED',         'c7615276-6e65-4f05-8729-83008e8b609e',
        'UNIMED - VOLTA REDONDA', '1d6d8634-c08e-4e2d-b47d-4333319de5a3',
        'Gratuidade',             '1c29863a-1625-496b-9050-bb187e852d42',
        -- as 5 divergências de acento/caixa, chave na grafia da grade:
        'LEVE SAUDE',             'e6e0e7eb-fd10-4a9d-b7b3-36fe42535f7b',
        'Amil Saude',             '7f25da85-2b7e-4c8a-9220-c37b3297bba9',
        'POSTAL SAUDE',           'fb4a8ada-5586-4bf1-b00a-e1571fd3da3d',
        'Unimed Nacional',        '0ca3b8f9-899a-4217-8adf-9f2d4449a6a1',
        'FuSEx',                  '8e322838-d562-4e35-be01-4d621ca3acad',
        -- presentes no ClickUp, ainda não vistos na grade (inofensivo tê-los):
        'UNIMED Brasil',          'c036a01b-a0cb-4bc6-b60c-aa2df47498a5',
        'UNIMED FERJ',            '3af5fd58-1f67-4ed6-9e91-0c2595d51959',
        'UNIMED RIO',             'ad83b64c-3e4e-4768-a40d-166e72598c97')),

    -- ── Unidade: casada por PREFIXO de sala_nome (ver achado 1) ────────────
    -- O consumidor testa se sala_nome COMEÇA com a chave. "Unid. " incluído na
    -- chave para não casar por acidente com uma sala que só contenha a palavra.
    'unidade_por_sala', jsonb_build_object(
      'field_id', '5cd3e600-0f85-4a15-8665-f70ce8d5c6fe', 'type', 'drop_down',
      'prefixos', jsonb_build_object(
        'Unid. Realengo',     '4c017e3b-76ec-4063-b3f9-b4de295e3a8f',
        'Unid. Padre Miguel', '00aac8a7-71b5-4ff7-a3a6-e616c41b101d',
        'Unid. Fazendinha',   '9eb236e1-d37e-4a2f-b716-84967df40676',
        'AT Externo',         '5532ad6c-5050-40b6-812b-e3e245b3d843')),  -- Ambiente Natural

    -- ── Especialidade: labels, valor MULTIVALORADO (ver achado 3) ──────────
    -- O consumidor quebra terapia_nome por "," e mapeia cada parte. Parte não
    -- encontrada é omitida, não inventada.
    'especialidade', jsonb_build_object(
      'field_id', 'fd9c30be-c073-4108-85fd-ab6de3102842', 'type', 'labels',
      'opcoes', jsonb_build_object(
        'Aplicador ABA (AE)',             'ca4abe20-a6ef-4a68-b274-79f3d9e6fd18',
        'Aplicador ABA (AV)',             '0d552adc-4fed-4c36-a3b1-8b52d49a8f93',
        'Aplicador ABA (EF)',             '32cd0495-e4bd-485f-9905-70430f83a3f7',
        'Aplicador ABA (HS)',             '2e1361cb-d058-4512-851f-e057ea9f8ef9',
        'Aplicador ABA (PS)',             'b3440703-dd78-4931-adbe-669945cdf948',
        'Aplicador ABA (SF)',             'fdf64337-295d-4aeb-8f67-32aa4998132c',
        'Aplicador ABA Casa',             '7b21ea98-f94e-4a76-9aee-c0c8bf5f7562',
        'Aplicador ABA Escola',           'b9f520dc-a09a-46e3-b4ab-d0115895e176',
        'Aplicador Suporte',              'addf2dc6-0545-417b-b282-a73960908a76',
        'Aplicador Suporte (MT)',         'fc396e6c-b821-4226-a9c1-df9ac79063f4',
        'Apoio Operacional',              '30bf2add-f8e1-4a82-9597-31b33fd08e30',
        'Coordenador de Caso',            'b02d38f3-4791-4740-9efb-db9bf6aed186',
        'Equoterapia',                    'c5ebf062-2c74-47df-a19d-cb8779bee0ff',
        'Especialista Técnico de Área',   '794f7be3-74aa-42a2-b6e8-d82ff0cd8dd4',
        'Estágio',                        '5077420b-e8f0-4e4d-ab35-8e82633fab58',
        'Facilitador Técnico',            '595bd21f-b1be-424b-bb54-9c96a24ef866',
        'Fisioterapia',                   'bbbf90d8-3b74-4c4e-bd31-8bb71c2ab882',
        'Fisioterapia Aquática',          '205b8a96-e724-4dfd-8b09-8c5094569958',
        'Fonoaudiologia',                 '470d7466-1c47-40ba-9414-c90fe248a12f',
        'Musicoterapia',                  'a3d99732-9af8-450e-a462-073560ddcda0',
        'Operações Clínicas',             'dc3e753a-b1fe-4cf9-9fd6-32fe43d701c3',
        'Psicoeducação',                  'e6ae5ea2-f02a-4f91-9673-3d1fcced9ccd',
        'Psicologia',                     '288ed260-4a29-4094-aa66-cfdc828f3d63',
        'Psicologia ABA',                 'cd75d2c5-3f8f-4365-842e-a283090b697d',
        'Psicomotricidade',               '5e07ae15-771b-44da-b404-9aa9ead06745',
        'Psicopedagogia',                 'e093f78e-7b67-48f9-86fe-5ef2ef7378e0',
        'Supervisão ABA',                 'b1db660b-896e-4e95-a939-024466865c58',
        'Técnico Terapêutico Particular', '8b3c7cd3-dd11-4696-9a63-1780c5181972',
        'Terapia Alimentar',              '0df48728-610d-4913-8d80-e6e4fb34ad39',
        'Terapia Ocupacional',            '7400cc2d-1d79-4604-b05a-84ea8c042a24',
        'Visita Guiada',                  '942cfca6-0bc9-4c5e-a106-662b3201f615',
        -- de-para de grafia divergente, chave na grafia da GRADE:
        'Psiquiatra/Neurologista',        'a034718a-3ba1-4a4e-a252-cfc4c0833fc9')),  -- ClickUp: Psiquiatria

    -- ── Tipo de Autorização ────────────────────────────────────────────────
    -- A Edge Function deriva o VALOR (tipoAutorizacao): origem_judicial do
    -- cadastro quando preenchida — Liminar/Penhora/Acordo têm a grafia exata da
    -- coluna —, senão "Particular" para convênio particular/vazio e
    -- "Convencional Convênio" para o resto. Aqui só o de-para dos 6 uuids.
    -- "Parceria" fica no mapa embora nada no banco a produza: se alguém ajustar
    -- o card à mão, o valor existe.
    'tipo_autorizacao', jsonb_build_object(
      'field_id', 'f3e82442-c355-49a7-b1f8-19244c587042', 'type', 'drop_down',
      'opcoes', jsonb_build_object(
        'Acordo',                'e3947cb5-4eb5-4020-8ed2-3863d74a8c7e',
        'Convencional Convênio', 'e1aee9a0-691f-438d-86e0-8b29920212f2',
        'Liminar',               'f7c599bf-8bdc-494f-ba62-aa4022b6801a',
        'Parceria',              '42c69c00-436d-48c1-b206-83d2de0d9b7e',
        'Particular',            'f3fa254d-c32e-416b-a2f3-742d3192ed81',
        'Penhora',               '678b2f10-c733-421f-b3cb-112a698466f0')),

    -- ── Convênios que deixam o campo VAZIO, sem travar a linha ─────────────
    -- Sem esta lista, `opcaoObrigatoria` não distingue "não sei traduzir isto"
    -- (erro real, que DEVE travar) de "deixe vazio de propósito" (decisão do
    -- usuário). Foi o que travou a primeira inclusão real, do Samuel, em 02/09:
    --   "Ainda não selecionado" não tem opção correspondente em "Convênio"
    -- Convênio genuinamente novo continua travando, que é o desejado.
    'convenios_sem_campo', jsonb_build_array('Ainda não selecionado', 'Administrativo'),

    -- ── Salas que NÃO geram card (decisão do usuário) ──────────────────────
    -- Casado por prefixo, igual a unidade_por_sala. "Sala Teste" é teste; gerar
    -- card faria o cronograma abrir trâmite junto ao convênio para algo irreal.
    'salas_sem_card', jsonb_build_array('Sala Teste', 'sala 21')
  ),
  updated_at = now()
WHERE id = 1;

-- `ativo` NÃO é tocado aqui de propósito — ver o bloco final.

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260902130000', 'inclusao_terapia_depara_conferido')
ON CONFLICT (version) DO NOTHING;

commit;

-- =============================================================================
-- CONFERIR ANTES DE LIGAR
-- =============================================================================
-- 1. A config gravou e a lista é a certa:
--      SELECT ativo, clickup_list_id, jsonb_pretty(campos)
--      FROM inclusoes_terapia_config WHERE id = 1;
--    Esperado: ativo = false, clickup_list_id = '901112985991'.
--
-- 2. Nenhum convênio da grade ficou órfão sem ser um dos dois esperados:
--      SELECT g.convenio_nome, count(*)
--      FROM csv_grades_profissionais g
--      WHERE g.ativo AND g.data >= current_date - 30
--        AND g.convenio_nome IS NOT NULL
--        AND NOT ((SELECT campos->'convenio'->'opcoes' FROM inclusoes_terapia_config WHERE id=1) ? g.convenio_nome)
--      GROUP BY 1 ORDER BY 2 DESC;
--    Esperado: SÓ "Ainda não selecionado" e "Administrativo". Qualquer outro
--    valor é convênio novo e precisa entrar no de-para (ou o card sai sem
--    convênio, calado).
--
-- 3. Toda sala cai numa unidade ou na lista de exceção:
--      SELECT g.sala_nome, count(*)
--      FROM csv_grades_profissionais g
--      WHERE g.ativo AND g.data >= current_date - 30 AND g.sala_nome IS NOT NULL
--        AND g.sala_nome NOT LIKE 'Unid. Realengo%'
--        AND g.sala_nome NOT LIKE 'Unid. Padre Miguel%'
--        AND g.sala_nome NOT LIKE 'Unid. Fazendinha%'
--        AND g.sala_nome NOT LIKE 'AT Externo%'
--      GROUP BY 1 ORDER BY 2 DESC;
--    Esperado em 02/09: Apoio Operacional (1300), Especialista Técnico de Área
--    (399), Sala Teste (273), sala 21 (4). As duas primeiras são FUNÇÃO, não
--    sala — sairão com Unidade vazia, e isso é o certo: não há unidade a dizer.
--
-- =============================================================================
-- A ESTREIA — só depois de 1, 2 e 3 conferidos
-- =============================================================================
-- Não está no begin/commit acima de propósito: ligar é um ato separado.
--
--   UPDATE public.inclusoes_terapia_config SET ativo = true, updated_at = now()
--   WHERE id = 1;
--
-- Antes de ligar, pense na guarda de retroatividade (janela_horas, default 72):
-- linha mais velha que isso não vira card. Se houver implantação registrada na
-- outbox de antes da conferência que você NÃO queira anunciar, confira:
--   SELECT bundle_id, paciente_nome, created_at, enviado_em
--   FROM inclusoes_terapia WHERE enviado_em IS NULL ORDER BY created_at;
--
-- Para desligar na hora, se um card sair errado:
--   UPDATE public.inclusoes_terapia_config SET ativo = false WHERE id = 1;
-- =============================================================================
