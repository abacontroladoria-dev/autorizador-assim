-- Backfill de `public.pacientes` a partir do que JÁ está no banco.
--
-- Decisão do usuário em 2026-08-17: "raw_json agora, sync novo depois".
-- Nenhuma chamada externa aqui. Duas fontes, ambas locais:
--   a) as colunas mapeadas de `agenda_tita` (nome, cpf, data_nascimento,
--      convenio_*, numero_carteirinha, responsavel_nome/email/telefone);
--   b) `agenda_tita.raw_json -> favorecido -> familiares -> 0`, que traz
--      cpf, parentesco, resp_financeiro e o ENDEREÇO completo (endereco,
--      numeroResidencia, complemento, bairro, cidade, uf, cep) — campos que o
--      sync recebe e descarta hoje (sync_tita_agenda/index.ts:378 lê apenas
--      nome, celular e email do familiar).
--
-- (b) é o que destrava `Contrato`/`Mensalidade` do AXIUM: emitir NF no
-- responsável exige CPF e endereço dele, e o Pulsar não tinha nenhum dos dois.
--
-- O que este backfill NÃO cobre, e por quê:
--   - paciente sem nenhuma sessão em `agenda_tita` não existe aqui. A auto-cura
--     do sync só alcança a janela do cron (hoje-10 -> fim do mês seguinte, dias
--     úteis), então paciente inativo/antigo fica de fora. Cobrir isso exige o
--     endpoint `POST /integracao/csv_situacao_favorecidos` (nunca chamado pelo
--     Pulsar; devolve id, nome, cpf, endereço, plano, familiar+email e situação
--     Ativo/Inativo em CSV). Fica para o sync de cadastro.
--   - sexo e e-mail do PACIENTE não existem em nenhum endpoint documentado do
--     TiTa. Nascem no Pulsar, digitados na tela.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Regras herdadas do histórico, deliberadamente repetidas aqui
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Recência por `data_atendimento DESC`, NUNCA por `updated_at`. Um backfill
--    anterior que ordenava por `updated_at` foi corrompido quando outro backfill
--    setou `updated_at = now()` em massa (ver 20260729020000/030000).
-- 2. Por CAMPO, não por linha. As linhas com `origem = 'tita_csv'` são inseridas
--    com cpf/data_nascimento/convenio/responsavel NULOS e com `raw_json` que é
--    só um stub `{source, status_csv}` — sem `favorecido`. Um `DISTINCT ON`
--    simples pegaria a linha mais recente e, se ela fosse uma dessas, importaria
--    nulo em cima de dado bom. Por isso cada campo pega o valor mais recente
--    NÃO NULO, via `array_agg(...) FILTER (WHERE ... IS NOT NULL)`.
-- 3. O CPF do histórico não é confiável; a fonte melhor é `raw_json.favorecido`.
--    Aqui o raw_json vence e a coluna é o fallback.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. As linhas que já existiam não vieram do TiTa
-- ─────────────────────────────────────────────────────────────────────────────
-- O que estava em `reboot_pacientes` foi digitado à mão na frente do sistema
-- próprio. Marcar como 'pulsar' impede que o sync passe a sobrescrever.
UPDATE public.pacientes
SET origem_cadastro = 'pulsar'
WHERE tita_paciente_id IS NULL
  AND origem_cadastro = 'tita';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill
-- ─────────────────────────────────────────────────────────────────────────────
WITH agregado AS (
  SELECT
    at.paciente_id,
    (array_agg(at.paciente_nome        ORDER BY at.data_atendimento DESC) FILTER (WHERE at.paciente_nome        IS NOT NULL))[1] AS nome,
    (array_agg(at.cpf                  ORDER BY at.data_atendimento DESC) FILTER (WHERE at.cpf                  IS NOT NULL))[1] AS cpf_coluna,
    (array_agg(at.data_nascimento      ORDER BY at.data_atendimento DESC) FILTER (WHERE at.data_nascimento      IS NOT NULL))[1] AS nascimento_coluna,
    (array_agg(at.convenio_id          ORDER BY at.data_atendimento DESC) FILTER (WHERE at.convenio_id          IS NOT NULL))[1] AS convenio_id,
    (array_agg(at.convenio_nome        ORDER BY at.data_atendimento DESC) FILTER (WHERE at.convenio_nome        IS NOT NULL))[1] AS convenio_nome,
    (array_agg(at.numero_carteirinha   ORDER BY at.data_atendimento DESC) FILTER (WHERE at.numero_carteirinha   IS NOT NULL))[1] AS numero_carteirinha,
    (array_agg(at.responsavel_nome     ORDER BY at.data_atendimento DESC) FILTER (WHERE at.responsavel_nome     IS NOT NULL))[1] AS responsavel_nome,
    (array_agg(at.responsavel_email    ORDER BY at.data_atendimento DESC) FILTER (WHERE at.responsavel_email    IS NOT NULL))[1] AS responsavel_email,
    (array_agg(at.responsavel_telefone ORDER BY at.data_atendimento DESC) FILTER (WHERE at.responsavel_telefone IS NOT NULL))[1] AS responsavel_telefone,
    -- O favorecido cru, da linha mais recente que de fato tenha um.
    (array_agg(at.raw_json -> 'favorecido' ORDER BY at.data_atendimento DESC)
       FILTER (WHERE at.raw_json -> 'favorecido' IS NOT NULL))[1] AS favorecido,
    -- O primeiro familiar cru, idem. Separado do favorecido de propósito: uma
    -- linha pode ter favorecido sem familiares.
    (array_agg(at.raw_json -> 'favorecido' -> 'familiares' -> 0 ORDER BY at.data_atendimento DESC)
       FILTER (WHERE at.raw_json -> 'favorecido' -> 'familiares' -> 0 IS NOT NULL))[1] AS familiar
  FROM public.agenda_tita at
  WHERE at.ativo
    AND at.paciente_id IS NOT NULL
  GROUP BY at.paciente_id
),
normalizado AS (
  SELECT
    a.paciente_id,
    a.nome,
    -- raw_json vence a coluna (regra 3). Só aceita CPF com 11 dígitos: o
    -- cadastro de origem tem lixo, e meio CPF é pior que nenhum.
    COALESCE(
      NULLIF(regexp_replace(COALESCE(a.favorecido ->> 'cpf', ''), '\D', '', 'g'), ''),
      NULLIF(regexp_replace(COALESCE(a.cpf_coluna,  ''), '\D', '', 'g'), '')
    ) AS cpf_bruto,
    -- O TiTa manda DD/MM/YYYY. Converte só o que casa com o formato, senão
    -- to_date() estoura a migration inteira por causa de uma linha suja.
    COALESCE(
      CASE
        WHEN a.favorecido ->> 'data_nascimento' ~ '^\d{2}/\d{2}/\d{4}$'
        THEN to_date(a.favorecido ->> 'data_nascimento', 'DD/MM/YYYY')
      END,
      a.nascimento_coluna
    ) AS data_nascimento,
    a.convenio_id,
    a.convenio_nome,
    a.numero_carteirinha,
    COALESCE(a.responsavel_nome,     a.familiar ->> 'nome')    AS responsavel_nome,
    COALESCE(a.responsavel_email,    a.familiar ->> 'email')   AS responsavel_email,
    COALESCE(a.responsavel_telefone, a.familiar ->> 'celular') AS responsavel_telefone,
    NULLIF(regexp_replace(COALESCE(a.familiar ->> 'cpf', ''), '\D', '', 'g'), '') AS responsavel_cpf_bruto,
    NULLIF(btrim(COALESCE(a.familiar ->> 'parentesco', '')), '') AS responsavel_parentesco,
    CASE
      WHEN a.familiar ? 'resp_financeiro'
      THEN (a.familiar ->> 'resp_financeiro')::boolean
    END AS responsavel_financeiro,
    -- Endereço: vem do familiar (é o que o payload de /agendamento entrega).
    NULLIF(regexp_replace(COALESCE(a.familiar ->> 'cep', ''), '\D', '', 'g'), '') AS cep,
    NULLIF(btrim(COALESCE(a.familiar ->> 'endereco',        '')), '') AS logradouro,
    NULLIF(btrim(COALESCE(a.familiar ->> 'numeroResidencia', '')), '') AS numero,
    NULLIF(btrim(COALESCE(a.familiar ->> 'complemento',     '')), '') AS complemento,
    NULLIF(btrim(COALESCE(a.familiar ->> 'bairro',          '')), '') AS bairro,
    NULLIF(btrim(COALESCE(a.familiar ->> 'cidade',          '')), '') AS cidade,
    NULLIF(upper(btrim(COALESCE(a.familiar ->> 'uf',        ''))), '') AS uf
  FROM agregado a
  WHERE a.nome IS NOT NULL
)
INSERT INTO public.pacientes AS p (
  tita_paciente_id, nome, cpf, data_nascimento,
  convenio_id, convenio_nome, numero_carteirinha,
  responsavel_nome, responsavel_cpf, responsavel_email, responsavel_telefone,
  responsavel_parentesco, responsavel_financeiro,
  cep, logradouro, numero, complemento, bairro, cidade, uf,
  ficticio, ativo, origem_cadastro, sincronizado_em
)
SELECT
  n.paciente_id,
  btrim(n.nome),
  CASE WHEN length(n.cpf_bruto) = 11 THEN n.cpf_bruto END,
  n.data_nascimento,
  n.convenio_id,
  n.convenio_nome,
  n.numero_carteirinha,
  n.responsavel_nome,
  CASE WHEN length(n.responsavel_cpf_bruto) = 11 THEN n.responsavel_cpf_bruto END,
  n.responsavel_email,
  n.responsavel_telefone,
  n.responsavel_parentesco,
  n.responsavel_financeiro,
  n.cep, n.logradouro, n.numero, n.complemento, n.bairro, n.cidade, n.uf,
  -- Centraliza aqui a lista de fantasma que hoje está espalhada em 4 filtros SQL
  -- divergentes. Deliberadamente conservador: só os nomes já documentados em
  -- migration. `isFakePatient()` (lib/remuneracao/pacientes.ts) casa também por
  -- prefixo e por lista de ids, e segue sendo a autoridade até a reconciliação
  -- ser feita com o usuário — não quero marcar paciente real como fictício.
  (
    public.normalizar_nome_paciente(n.nome) IN (
      'horario administrativo',
      'horario bloqueado',
      'notificacao previa',
      'ainda nao selecionado'
    )
  ),
  true,
  'tita',
  now()
FROM normalizado n
ON CONFLICT (tita_paciente_id) DO UPDATE SET
  -- IDENTIDADE: o TiTa manda. É o ponto do exercício — parar de ter o mesmo
  -- paciente com nome/cpf/nascimento divergentes conforme a linha.
  nome            = EXCLUDED.nome,
  cpf             = COALESCE(EXCLUDED.cpf,             p.cpf),
  data_nascimento = COALESCE(EXCLUDED.data_nascimento, p.data_nascimento),
  -- CACHE derivado: idem, o TiTa manda.
  convenio_id        = COALESCE(EXCLUDED.convenio_id,        p.convenio_id),
  convenio_nome      = COALESCE(EXCLUDED.convenio_nome,      p.convenio_nome),
  numero_carteirinha = COALESCE(EXCLUDED.numero_carteirinha, p.numero_carteirinha),
  -- CADASTRO: o que já está preenchido aqui vence o que vem do TiTa. Edição
  -- manual na tela não pode ser desfeita por um resync.
  responsavel_nome       = COALESCE(p.responsavel_nome,       EXCLUDED.responsavel_nome),
  responsavel_cpf        = COALESCE(p.responsavel_cpf,        EXCLUDED.responsavel_cpf),
  responsavel_email      = COALESCE(p.responsavel_email,      EXCLUDED.responsavel_email),
  responsavel_telefone   = COALESCE(p.responsavel_telefone,   EXCLUDED.responsavel_telefone),
  responsavel_parentesco = COALESCE(p.responsavel_parentesco, EXCLUDED.responsavel_parentesco),
  responsavel_financeiro = COALESCE(p.responsavel_financeiro, EXCLUDED.responsavel_financeiro),
  cep         = COALESCE(p.cep,         EXCLUDED.cep),
  logradouro  = COALESCE(p.logradouro,  EXCLUDED.logradouro),
  numero      = COALESCE(p.numero,      EXCLUDED.numero),
  complemento = COALESCE(p.complemento, EXCLUDED.complemento),
  bairro      = COALESCE(p.bairro,      EXCLUDED.bairro),
  cidade      = COALESCE(p.cidade,      EXCLUDED.cidade),
  uf          = COALESCE(p.uf,          EXCLUDED.uf),
  sincronizado_em = now()
WHERE p.origem_cadastro = 'tita';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Conferência
-- ─────────────────────────────────────────────────────────────────────────────
-- Emite no log da migration, para dar o que comparar sem precisar de query
-- manual depois. `agenda_tita` tem ~1 linha por sessão; o esperado é algo na
-- ordem de centenas de pacientes (o comentário de services/tita/mappings.ts:192
-- media 298 pacientes distintos em produção).
DO $$
DECLARE
  v_pacientes        bigint;
  v_do_tita          bigint;
  v_distintos_agenda bigint;
  v_com_cpf          bigint;
  v_com_endereco     bigint;
  v_com_resp_cpf     bigint;
  v_ficticios        bigint;
  v_cpf_duplicado    bigint;
BEGIN
  SELECT count(*) INTO v_pacientes    FROM public.pacientes;
  SELECT count(*) INTO v_do_tita      FROM public.pacientes WHERE tita_paciente_id IS NOT NULL;
  SELECT count(DISTINCT paciente_id) INTO v_distintos_agenda
    FROM public.agenda_tita WHERE ativo AND paciente_id IS NOT NULL;
  SELECT count(*) INTO v_com_cpf      FROM public.pacientes WHERE cpf IS NOT NULL;
  SELECT count(*) INTO v_com_endereco FROM public.pacientes WHERE logradouro IS NOT NULL;
  SELECT count(*) INTO v_com_resp_cpf FROM public.pacientes WHERE responsavel_cpf IS NOT NULL;
  SELECT count(*) INTO v_ficticios    FROM public.pacientes WHERE ficticio;

  SELECT count(*) INTO v_cpf_duplicado FROM (
    SELECT cpf FROM public.pacientes
    WHERE cpf IS NOT NULL GROUP BY cpf HAVING count(*) > 1
  ) d;

  RAISE NOTICE 'pacientes: % linhas (% espelhadas do TiTa)', v_pacientes, v_do_tita;
  RAISE NOTICE 'paciente_id distintos em agenda_tita ativa: % (deve casar com o espelhado, descontando nome nulo)', v_distintos_agenda;
  RAISE NOTICE 'com cpf: % | com endereco: % | com cpf do responsavel: %', v_com_cpf, v_com_endereco, v_com_resp_cpf;
  RAISE NOTICE 'marcados como ficticio: %', v_ficticios;
  RAISE NOTICE 'CPFs repetidos entre pacientes: % (investigar na tela; nao ha unique de proposito)', v_cpf_duplicado;
END $$;
