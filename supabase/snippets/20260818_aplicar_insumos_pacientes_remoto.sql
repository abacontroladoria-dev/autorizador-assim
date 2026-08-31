-- Aplicar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Junta as 5 migrations da branch feat/insumos-axium que ainda nao chegaram
-- ao remoto -- confirmado por sondagem via REST em 2026-08-18: reboot_pacientes
-- existe la (main esta em dia), pacientes/empresas/usuarios_empresas/
-- solicitacoes_compra/cotacoes_compra/log_auditoria_insumos nao existem.
--
-- Rodar tudo de uma vez, de cima para baixo. Sao todas idempotentes
-- (testadas 2x no Docker local, incluindo reaplicacao).
--
-- Depois de rodar, registrar no livro-caixa (supabase_migrations.schema_migrations)
-- com o bloco no final deste arquivo.

-- =============================================================================
-- 20260817190000_pacientes_canonica.sql
-- =============================================================================
-- Tabela canônica de paciente: `public.pacientes`.
--
-- Decisão do usuário em 2026-08-17: UMA identidade de paciente, não duas.
-- `reboot_pacientes` (criada em 20260812140000 como primeira tabela da frente
-- do sistema próprio de agendamentos) é PROMOVIDA a canônica por RENAME, em vez
-- de criarmos uma segunda tabela ao lado dela. O rename preserva de graça:
--   - a PK `id_paciente` bigint identity (formato pedido pelo usuário na 140000);
--   - a sequence da identity, com os valores já emitidos;
--   - a FK de `reboot_agendamentos.id_paciente` (a única FK de paciente do
--     sistema inteiro, ver 20260812140300);
--   - o trigger de `atualizado_em`.
-- As tabelas irmãs seguem com prefixo `reboot_` (profissionais,
-- disponibilidade, agendamentos): elas são do sistema novo de agenda. Paciente
-- não é — paciente é transversal, e é por isso que sai do prefixo.
--
-- POR QUE ISSO EXISTE (o problema de hoje):
-- o Pulsar nunca teve cadastro de paciente. A identidade é derivada de
-- `agenda_tita`, que tem UMA LINHA POR AGENDAMENTO e repete nome/cpf/nascimento/
-- responsável/carteirinha em cada uma. Consequências medidas no repo:
--   - 4 tipos diferentes para "paciente_id" (`bigint` em agenda_tita/csv_grades,
--     `text` em fila_autorizacoes/paciente_classificacao/paciente_medico_vigente)
--     e ZERO foreign key entre eles;
--   - nome de paciente virou chave de negócio em 6 lugares, sendo dois graves:
--     `resolverIdFavorecido` (services/tita/mappings.ts) resolve nome->id para
--     ESCREVER agendamento no TiTa, e `chavePresenca` (lib/remuneracao/
--     presencaReal.ts) casa nome+data+hora para decidir PAGAMENTO de sessão;
--   - o bug "Sant'Anna" vs "Santanna" já está documentado em
--     20260721160000_add_paciente_id_convenio_valores_paciente.sql;
--   - os backfills 20260729020000/030000 tiveram que materializar um cadastro
--     ad-hoc (`distinct on (paciente_id) order by data_atendimento desc`) dentro
--     de um UPDATE, porque o mesmo paciente aparecia com CPF e nascimento
--     divergentes conforme o dia aberto.
-- Esta tabela é o lugar onde essas quatro coisas passam a ter uma resposta só.
--
-- O backfill vem na migration seguinte (20260817190100), separado de propósito:
-- esta é estrutura e é idempotente; a outra move dado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename
-- ─────────────────────────────────────────────────────────────────────────────

-- Guarda: só renomeia se `pacientes` ainda não existir, para a migration poder
-- ser reexecutada sem estourar (o livro-caixa deste projeto já foi replayado).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reboot_pacientes')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pacientes')
  THEN
    ALTER TABLE public.reboot_pacientes RENAME TO pacientes;
  END IF;
END $$;

-- Trigger e PK herdaram o nome antigo do rename. Renomeados sob guarda, para a
-- migration inteira continuar reexecutável.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.pacientes'::regclass
      AND tgname  = 'trg_reboot_pacientes_atualizado_em'
  ) THEN
    ALTER TRIGGER trg_reboot_pacientes_atualizado_em ON public.pacientes
      RENAME TO trg_pacientes_atualizado_em;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass
      AND conname  = 'reboot_pacientes_pkey'
  ) THEN
    ALTER TABLE public.pacientes RENAME CONSTRAINT reboot_pacientes_pkey TO pacientes_pkey;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Identidade externa
-- ─────────────────────────────────────────────────────────────────────────────
-- `tita_paciente_id` é a chave ESTÁVEL vinda do TiTa (raw_json.favorecido.id,
-- gravado em agenda_tita.paciente_id). É nullable de propósito: hoje o paciente
-- nasce no TiTa e é espelhado aqui; quando o cadastro migrar para o Pulsar, ele
-- nasce aqui e este campo fica nulo. Um espaço de identidade só, as duas eras.
--
-- UNIQUE de constraint (não índice parcial) porque o Postgres permite N NULLs em
-- unique, e porque o backfill precisa de `ON CONFLICT (tita_paciente_id)`.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS tita_paciente_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass
      AND conname  = 'pacientes_tita_paciente_id_key'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_tita_paciente_id_key UNIQUE (tita_paciente_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Identidade e cadastro
-- ─────────────────────────────────────────────────────────────────────────────
-- `nome` e `data_nascimento` já existem do 140000. `telefone` também (era do
-- paciente; segue sendo, o do responsável tem coluna própria abaixo).
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cpf              text,
  -- Preenchido por trigger (ver §5). É a coluna que mata o match por nome cru:
  -- sem acento, sem pontuação, minúscula, espaço colapsado.
  ADD COLUMN IF NOT EXISTS nome_normalizado text,
  ADD COLUMN IF NOT EXISTS sexo             text,
  ADD COLUMN IF NOT EXISTS email            text,
  -- Centraliza a lista de paciente-fantasma que hoje está espalhada em 4 filtros
  -- SQL divergentes ('Horário Administrativo', 'Notificação Prévia', 'Ainda não
  -- selecionado', 'Horário Bloqueado') + 5 constantes TS em lib/remuneracao/
  -- constants (isFakePatient casa por includes/startsWith, o que é frágil).
  -- Passa a ser uma flag no cadastro em vez de heurística de string.
  ADD COLUMN IF NOT EXISTS ficticio         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacoes      text,
  -- 'tita' = espelhado do sync; 'pulsar' = digitado aqui. Serve para o sync
  -- saber o que ele pode refrescar sem pisar em cima de edição manual.
  ADD COLUMN IF NOT EXISTS origem_cadastro  text NOT NULL DEFAULT 'tita',
  ADD COLUMN IF NOT EXISTS sincronizado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_consentimento_em timestamptz;

-- Endereço. Não existe em NENHUM lugar do Pulsar hoje (verificado por grep em
-- frontend/ e supabase/functions/). Chega por duas vias, nesta ordem:
--   a) `raw_json.favorecido.familiares[0]` do endpoint /integracao/agendamento,
--      que JÁ traz endereco/numeroResidencia/complemento/bairro/cidade/uf/cep e
--      é descartado hoje no sync (sync_tita_agenda/index.ts:378 lê só nome,
--      celular e email). Recuperável do raw_json já armazenado, sem chamada nova.
--   b) o endpoint `POST /integracao/csv_situacao_favorecidos`, que devolve o
--      endereço do FAVORECIDO (changelog 2.11.0) e nunca foi chamado pelo
--      Pulsar. Fica para a migration do sync de cadastro.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cep         text,
  ADD COLUMN IF NOT EXISTS logradouro  text,
  ADD COLUMN IF NOT EXISTS numero      text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro      text,
  ADD COLUMN IF NOT EXISTS cidade      text,
  ADD COLUMN IF NOT EXISTS uf          text;

-- Responsável. Hoje `agenda_tita` guarda nome/email/telefone soltos, sem CPF e
-- sem endereço — que é exatamente o que bloqueia `Contrato` e `Mensalidade` do
-- AXIUM (emitir NF no responsável exige CPF e endereço). O payload do TiTa já
-- traz `familiares[0].cpf`, `.parentesco` e `.resp_financeiro` (boolean) e joga
-- tudo fora. Ver docs/AXIUM_MIGRACAO.md.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS responsavel_nome       text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf        text,
  ADD COLUMN IF NOT EXISTS responsavel_email      text,
  ADD COLUMN IF NOT EXISTS responsavel_telefone   text,
  ADD COLUMN IF NOT EXISTS responsavel_parentesco text,
  ADD COLUMN IF NOT EXISTS responsavel_financeiro boolean;

-- Auto-referência: o AXIUM modela responsável financeiro como paciente->paciente
-- (`Paciente.responsavelFinanceiroId`), para irmãos que dividem um mesmo
-- responsável. Nullable; o caso comum é o responsável estar nos campos acima.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS responsavel_financeiro_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass
      AND conname  = 'pacientes_responsavel_financeiro_id_fkey'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_responsavel_financeiro_id_fkey
      FOREIGN KEY (responsavel_financeiro_id)
      REFERENCES public.pacientes(id_paciente) ON DELETE SET NULL;
  END IF;
END $$;

-- Convênio VIGENTE, derivado — não digitado.
-- Regra que o projeto já pagou para aprender (ver memória/docs): convênio é dado
-- POR AGENDAMENTO do TiTa (`vinc_fav_clinica`), não do paciente. "Particular em
-- vez de ASSIM" é dado errado no TiTa, não bug do Pulsar. Estas colunas são um
-- CACHE da linha mais recente por `data_atendimento desc`, para a tela não ter
-- que varrer a agenda. A verdade por sessão continua em `agenda_tita`.
-- Atenção: o sync lê só `vinc_fav_clinica[0]` — paciente com dois convênios
-- perde o segundo em silêncio. Limitação conhecida, herdada.
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS convenio_id        bigint,
  ADD COLUMN IF NOT EXISTS convenio_nome      text,
  ADD COLUMN IF NOT EXISTS numero_carteirinha text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Checks
-- ─────────────────────────────────────────────────────────────────────────────
-- Permissivos de propósito: o dado vem de fora (TiTa) e um check apertado
-- transformaria "cadastro sujo na origem" em "sync quebrado em silêncio".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass AND conname = 'pacientes_sexo_check'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_sexo_check
      CHECK (sexo IS NULL OR sexo IN ('M', 'F', 'outro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pacientes'::regclass AND conname = 'pacientes_origem_cadastro_check'
  ) THEN
    ALTER TABLE public.pacientes
      ADD CONSTRAINT pacientes_origem_cadastro_check
      CHECK (origem_cadastro IN ('tita', 'pulsar'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Normalização de nome
-- ─────────────────────────────────────────────────────────────────────────────
-- A extensão `unaccent` já está instalada (20260518131652_remote_schema.sql:7),
-- mas hoje a normalização acentual em SQL só é aplicada a `nome_medico`
-- (nome_medico_normalizado). Nome de PACIENTE nunca teve equivalente — o que
-- existe é `lower(trim(...))` ad-hoc e `fixMojibake()` consertando encoding na
-- exibição (services/salas.service.ts:376) sem nunca corrigir a origem.
--
-- STABLE, não IMMUTABLE: `unaccent()` é STABLE, e mentir aqui para poder usar a
-- função em índice/coluna gerada é justamente o atalho que corrompe índice em
-- upgrade de extensão. Por isso a coluna é materializada por TRIGGER (chamada
-- em tempo de escrita, onde STABLE basta) e indexada como coluna comum.
CREATE OR REPLACE FUNCTION public.normalizar_nome_paciente(p_nome text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(unaccent(regexp_replace(coalesce(p_nome, ''), '[^[:alnum:][:space:]]', ' ', 'g'))),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.normalizar_nome_paciente(text) IS
  'Mapa único de normalização de nome de paciente: sem acento, sem pontuação, '
  'minúsculo, espaço colapsado. Não re-inlinar esta lógica em view ou serviço — '
  'a duplicação divergente é o que produziu o bug Sant''Anna vs Santanna.';

CREATE OR REPLACE FUNCTION public.set_paciente_nome_normalizado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.nome_normalizado := public.normalizar_nome_paciente(NEW.nome);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_nome_normalizado ON public.pacientes;
CREATE TRIGGER trg_pacientes_nome_normalizado
  BEFORE INSERT OR UPDATE OF nome ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_paciente_nome_normalizado();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Índices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pacientes_nome_normalizado
  ON public.pacientes (nome_normalizado);

-- CPF sem UNIQUE de propósito: o cadastro de origem é sujo (o histórico já teve
-- o mesmo paciente com CPF divergente entre linhas, ver 20260729030000) e um
-- unique aqui faria o backfill/sync falhar em bloco. Duplicidade é para ser
-- RELATADA na tela, não impedida no banco.
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf
  ON public.pacientes (cpf) WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_ativos
  ON public.pacientes (nome) WHERE ativo AND NOT ficticio;

CREATE INDEX IF NOT EXISTS idx_pacientes_responsavel_financeiro
  ON public.pacientes (responsavel_financeiro_id) WHERE responsavel_financeiro_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- As policies vieram do rename com o nome antigo. Recriadas com o nome novo.
--
-- SELECT abre para `authenticated` (era restrito a admin/diretoria/cronograma).
-- Isso NÃO amplia exposição: exatamente os mesmos campos de identidade já são
-- legíveis por qualquer autenticado via `agenda_tita`, cuja policy é
-- `for select to authenticated using (true)` (20260525000000_rls_agenda_tita.sql).
-- E precisa ser assim, senão a central, a auditoria e o /solicitar param de
-- resolver paciente ao passarem a ler daqui.
-- ESCRITA segue restrita aos três papéis, como estava.
--
-- Nota: o event trigger `rls_auto_enable` (ver project_advisors_info_2026_08_17)
-- deixa toda tabela nova fail-closed. Aqui a tabela não é nova — o RLS já veio
-- habilitado do 20260812140000 — mas as policies precisam existir com o nome
-- novo, senão a tabela fica legível por ninguém.
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reboot_pacientes_select" ON public.pacientes;
DROP POLICY IF EXISTS "reboot_pacientes_write"  ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_select"        ON public.pacientes;
DROP POLICY IF EXISTS "pacientes_write"         ON public.pacientes;

CREATE POLICY "pacientes_select" ON public.pacientes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "pacientes_write" ON public.pacientes
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin', 'diretoria', 'cronograma']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Documentação no catálogo
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.pacientes IS
  'Cadastro canônico de paciente. Identidade espelhada do TiTa por '
  'tita_paciente_id (regra: linha mais recente por data_atendimento DESC, NUNCA '
  'por updated_at — ver 20260729020000). Cadastro (endereço, sexo, responsável, '
  'LGPD) é editável aqui e o sync não sobrescreve. Convênio/carteirinha são '
  'CACHE derivado: a verdade por sessão está em agenda_tita.';

COMMENT ON COLUMN public.pacientes.tita_paciente_id IS
  'agenda_tita.paciente_id (= raw_json.favorecido.id). Nullable: paciente '
  'cadastrado no Pulsar após a migração não tem correspondente no TiTa.';

COMMENT ON COLUMN public.pacientes.ficticio IS
  'Horário Administrativo, Notificação Prévia, Ainda não selecionado, Horário '
  'Bloqueado e afins. Substitui isFakePatient() e os 4 filtros SQL divergentes.';

COMMENT ON COLUMN public.pacientes.origem_cadastro IS
  'tita = espelhado pelo sync (refrescável); pulsar = digitado na tela (o sync '
  'não deve sobrescrever identidade).';

-- =============================================================================
-- 20260817190100_backfill_pacientes_do_tita.sql
-- =============================================================================
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

-- =============================================================================
-- 20260817200000_insumos_schema.sql
-- =============================================================================
-- Módulo de insumos/compras, portado do AXIUM (github.com/GabrielSalotto/AXIUM,
-- `prisma/schema.prisma` + `prisma/migrations/20260812184416_compras_logistica`).
--
-- Contexto: o AXIUM é NestJS + Prisma + Postgres próprio; aqui vira Supabase.
-- Ver docs/AXIUM_MIGRACAO.md. Esta migration cobre a FASE 3 (dados); a lógica
-- pura já está portada em frontend/lib/insumos/ com os testes vitest junto.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Três decisões de porte, todas do usuário em 2026-08-17
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `empresaId` do AXIUM vira `empresa_id` com FK real para uma tabela
--    `empresas` NOVA. Não virou `unidade text` (a convenção do resto do Pulsar)
--    porque o usuário corrigiu a premissa: empresa aqui é PESSOA JURÍDICA, e
--    esta ferramenta vai operar com pelo menos três — só se usou Universo ABA
--    até agora. Recorte por texto não aguentaria isso.
--    Nota: `central.organizations` NÃO serve — é a org do produto Central/
--    Connect (uma linha, "Universo ABA"), com outra semântica.
-- 2. Enums do Prisma viram `text` + CHECK, e não enum nativo, seguindo a
--    convenção que o Pulsar já usa (`usuarios_role_check`). A lista espelhada
--    em TypeScript está em frontend/lib/insumos/tipos.ts — os dois andam juntos.
-- 3. Colunas em snake_case. O Prisma do AXIUM gerava camelCase ("empresaId",
--    "nomeItem"); é porte nativo, não lift-and-shift, então segue a convenção
--    daqui. Quem portar os 18 endpoints faz o de-para.
--
-- O que NÃO veio, de propósito:
--   - `Papel`/`Permissao`/`PapelPermissao`/`UsuarioPermissaoExcecao`: o Pulsar
--     já tem o mesmo motor (`usuarios.role` + `usuarios_permissoes` +
--     `roleDefaults` em lib/permissions/routes.ts). Ver fase 2 do doc.
--   - O enum `Escopo` (PROPRIO/UNIDADE/VINCULADAS/CONSOLIDADO): decisão ainda
--     pendente no doc.
--   - `Paciente`/`Convenio`/`Contrato`/`Mensalidade`: nada do bloco de compras
--     referencia paciente (conferido no schema.prisma) — o financeiro é outra
--     fase e depende de public.pacientes (20260817190000).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Empresas e vínculo do usuário
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.empresas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social        text NOT NULL,
  nome_fantasia       text NOT NULL,
  cnpj                text NOT NULL UNIQUE,
  inscricao_municipal text,
  regime_tributario   text,
  cep                 text,
  logradouro          text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  uf                  text,
  ativo               boolean NOT NULL DEFAULT true,

  -- Link público de solicitação de compra (sem login), um por empresa. O token
  -- é opaco e nulo enquanto ninguém gerou. `usuario_link_publico_id` existe só
  -- para satisfazer a FK obrigatória de solicitacoes_compra.solicitante_id
  -- quando o pedido vem de fora — quem pediu de verdade fica em
  -- solicitante_externo_nome/email na própria solicitação.
  -- Precedente de rota pública sem login no Pulsar: /tv (gate no proxy.ts).
  token_link_publico_compras text UNIQUE,
  usuario_link_publico_id    uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,

  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_empresas_atualizado_em ON public.empresas;
CREATE TRIGGER trg_empresas_atualizado_em
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- Quais empresas cada pessoa enxerga. É o que a RLS consulta.
-- Sem `papel_id`: o papel do usuário no Pulsar é `usuarios.role`, global, não
-- por empresa. Se um dia precisar de papel por empresa, entra aqui.
CREATE TABLE IF NOT EXISTS public.usuarios_empresas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  empresa_padrao boolean NOT NULL DEFAULT false,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_usuario ON public.usuarios_empresas (usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_empresa ON public.usuarios_empresas (empresa_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Catálogo global de itens
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem empresa_id: no AXIUM já era catálogo compartilhado. É o que o
-- `resolvedorDeterministico` (frontend/lib/insumos/item-padrao.ts) consulta.

CREATE TABLE IF NOT EXISTS public.itens_padrao_compra (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      text NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sinonimos_item_compra (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_padrao_id uuid NOT NULL REFERENCES public.itens_padrao_compra(id) ON DELETE CASCADE,
  termo          text NOT NULL UNIQUE,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sinonimos_item_padrao ON public.sinonimos_item_compra (item_padrao_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Solicitação de compra
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solicitacoes_compra (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  setor      text NOT NULL,

  categoria       text NOT NULL,
  categoria_outro text,

  solicitante_id uuid NOT NULL REFERENCES public.usuarios(id),
  -- Preenchidos só quando a solicitação vem do link público (sem login).
  solicitante_externo_nome  text,
  solicitante_externo_email text,

  data_solicitacao     timestamptz NOT NULL DEFAULT now(),
  prioridade           text NOT NULL,
  justificativa_compra text NOT NULL,

  nome_item                  text NOT NULL,
  descricao_detalhada        text NOT NULL,
  quantidade                 numeric(12, 2) NOT NULL,
  unidade_medida             text NOT NULL,
  marca_desejada             text,
  modelo_desejado            text,
  cor                        text,
  tamanho_medida_capacidade  text,
  material                   text,
  imagem_anexo_url           text,
  item_padrao_id             uuid REFERENCES public.itens_padrao_compra(id),
  link_referencia            text,

  -- aceita_similar/somente_novo vieram do protótipo do AXIUM sem efeito real no
  -- motor de busca ainda — não redesenhados no porte.
  aceita_similar            boolean NOT NULL DEFAULT true,
  aceita_outra_marca        boolean NOT NULL DEFAULT true,
  somente_novo              boolean NOT NULL DEFAULT true,
  aceita_usado              boolean NOT NULL DEFAULT false,
  somente_compra_nacional   boolean NOT NULL DEFAULT true,
  marketplace_permitido     text,
  valor_maximo_estimado     numeric(14, 2),
  prazo_maximo_entrega_dias integer,
  fornecedor_sugerido       text,

  status        text NOT NULL DEFAULT 'SOLICITACAO_CRIADA',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT solicitacoes_compra_categoria_check CHECK (categoria IN (
    'INSUMOS_TERAPEUTICOS','EQUIPAMENTOS','MOVEIS','TECNOLOGIA_E_ELETRONICOS',
    'HIGIENE_E_LIMPEZA','MANUTENCAO_E_INFRAESTRUTURA','PAPELARIA_E_ESCRITORIO',
    'EPIS_E_SEGURANCA','COPA_E_ALIMENTACAO','SERVICOS','OUTROS')),
  CONSTRAINT solicitacoes_compra_prioridade_check CHECK (prioridade IN (
    'BAIXA','NORMAL','ALTA','URGENTE')),
  CONSTRAINT solicitacoes_compra_status_check CHECK (status IN (
    'SOLICITACAO_CRIADA','COTACAO_EM_ANDAMENTO','COTACAO_FINALIZADA','REVISAO_MANUAL',
    'AGUARDANDO_APROVACAO','APROVADA','REPROVADA','COMPRA_REALIZADA',
    'AGUARDANDO_ENTREGA','ENTREGUE','PAUSADA','CANCELADA'))
);

DROP TRIGGER IF EXISTS trg_solicitacoes_compra_atualizado_em ON public.solicitacoes_compra;
CREATE TRIGGER trg_solicitacoes_compra_atualizado_em
  BEFORE UPDATE ON public.solicitacoes_compra
  FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

CREATE INDEX IF NOT EXISTS idx_solicitacoes_compra_empresa ON public.solicitacoes_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_compra_status  ON public.solicitacoes_compra (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_solicitacoes_compra_solicitante ON public.solicitacoes_compra (solicitante_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Histórico de status
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.historico_status_compra (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES public.empresas(id),
  solicitacao_id  uuid NOT NULL REFERENCES public.solicitacoes_compra(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo     text NOT NULL,
  origem          text NOT NULL DEFAULT 'SISTEMA',
  observacao      text,
  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT historico_status_compra_origem_check CHECK (origem IN ('SISTEMA','USUARIO'))
);

CREATE INDEX IF NOT EXISTS idx_historico_status_empresa     ON public.historico_status_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_historico_status_solicitacao ON public.historico_status_compra (solicitacao_id, criado_em);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fila de cotação (consumida pelo worker Playwright)
-- ─────────────────────────────────────────────────────────────────────────────
-- O worker roda FORA do Next, como processo próprio — molde do robo-autorizador.
-- Ver fase 6 do doc. O índice (status, criado_em) é o que ele varre.

CREATE TABLE IF NOT EXISTS public.cotacao_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_compra(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'PENDENTE',
  tentativas     integer NOT NULL DEFAULT 0,
  erro           text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  iniciado_em    timestamptz,
  concluido_em   timestamptz,

  CONSTRAINT cotacao_jobs_status_check CHECK (status IN ('PENDENTE','PROCESSANDO','CONCLUIDO','FALHOU'))
);

CREATE INDEX IF NOT EXISTS idx_cotacao_jobs_empresa ON public.cotacao_jobs (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cotacao_jobs_fila    ON public.cotacao_jobs (status, criado_em);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Cotações
-- ─────────────────────────────────────────────────────────────────────────────
-- Os campos de score/excedente são calculados por frontend/lib/insumos/
-- (precificacao.ts, score-ponderado.ts, compatibilidade.ts) e persistidos aqui.
-- `valor_decisao` é o que decide o ranking; `score_ponderado` é informativo.

CREATE TABLE IF NOT EXISTS public.cotacoes_compra (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id),
  solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_compra(id) ON DELETE CASCADE,
  cotacao_job_id uuid REFERENCES public.cotacao_jobs(id) ON DELETE SET NULL,

  fornecedor            text NOT NULL,
  produto_encontrado    text NOT NULL,
  valor_unitario        numeric(14, 2) NOT NULL,
  quantidade            numeric(12, 2) NOT NULL,
  valor_total_produtos  numeric(14, 2) NOT NULL,
  frete                 numeric(14, 2),
  valor_total_com_frete numeric(14, 2) NOT NULL,

  parcelamento_descricao          text,
  condicao_sem_juros              boolean NOT NULL DEFAULT false,
  valor_total_parcelas_sem_juros  numeric(14, 2),
  valor_total_parcelas_com_juros  numeric(14, 2),
  valor_decisao                   numeric(14, 2) NOT NULL,
  forma_pagamento_decisao         text NOT NULL DEFAULT 'AVISTA',
  parcelamento_com_juros          boolean NOT NULL DEFAULT false,

  prazo_entrega_descricao  text,
  prazo_entrega_ordem_dias integer,
  prazo_excedido           boolean NOT NULL DEFAULT false,

  link_produto text NOT NULL,
  origem       text NOT NULL DEFAULT 'NACIONAL',

  score_compatibilidade numeric(5, 2),
  status_cotacao        text NOT NULL,

  quantidade_excedente    numeric(12, 2),
  percentual_excedente    numeric(7, 4),
  valor_unitario_efetivo  numeric(14, 2),
  classificacao_excedente text,

  score_ponderado_aderencia         numeric(5, 2),
  score_ponderado_valor_real        numeric(5, 2),
  score_ponderado_unitario_efetivo  numeric(5, 2),
  score_ponderado_excedente         numeric(5, 2),
  score_ponderado_parcelamento      numeric(5, 2),
  score_ponderado_prazo             numeric(5, 2),
  score_ponderado_reputacao         numeric(5, 2),
  score_ponderado                   numeric(5, 2),

  criada_manualmente boolean NOT NULL DEFAULT false,
  criada_por_id      uuid REFERENCES public.usuarios(id),
  selecionada        boolean NOT NULL DEFAULT false,
  criado_em          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cotacoes_compra_forma_pagamento_check CHECK (forma_pagamento_decisao IN (
    'AVISTA','PARCELADO_SEM_JUROS','PARCELADO_COM_JUROS')),
  CONSTRAINT cotacoes_compra_origem_check CHECK (origem IN ('NACIONAL','INTERNACIONAL')),
  CONSTRAINT cotacoes_compra_status_check CHECK (status_cotacao IN (
    'VALIDADA','DESCARTADA','REVISAO_MANUAL')),
  CONSTRAINT cotacoes_compra_classificacao_check CHECK (
    classificacao_excedente IS NULL OR classificacao_excedente IN (
      'OTIMO','ACEITAVEL','ATENCAO','EVITAR'))
);

CREATE INDEX IF NOT EXISTS idx_cotacoes_compra_empresa     ON public.cotacoes_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_compra_solicitacao ON public.cotacoes_compra (solicitacao_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Aprovação
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aprovacoes_compra (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES public.empresas(id),
  solicitacao_id       uuid NOT NULL REFERENCES public.solicitacoes_compra(id) ON DELETE CASCADE,
  aprovador_id         uuid NOT NULL REFERENCES public.usuarios(id),
  decisao              text NOT NULL,
  cotacao_escolhida_id uuid REFERENCES public.cotacoes_compra(id),
  justificativa        text,
  decidido_em          timestamptz NOT NULL DEFAULT now(),
  criado_em            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aprovacoes_compra_decisao_check CHECK (decisao IN (
    'APROVAR','SOLICITAR_NOVA_COTACAO','REPROVAR')),
  -- Espelha validarDecisaoAprovacao() em frontend/lib/insumos/status-solicitacao.ts.
  -- A checagem existe nos dois lugares de propósito: a função roda antes do
  -- insert e dá mensagem boa; o CHECK impede que uma chamada direta à API fure.
  CONSTRAINT aprovacoes_compra_aprovar_exige_cotacao CHECK (
    decisao <> 'APROVAR' OR cotacao_escolhida_id IS NOT NULL),
  CONSTRAINT aprovacoes_compra_reprovar_exige_justificativa CHECK (
    decisao <> 'REPROVAR' OR nullif(btrim(justificativa), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_aprovacoes_compra_empresa     ON public.aprovacoes_compra (empresa_id);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_compra_solicitacao ON public.aprovacoes_compra (solicitacao_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Compra realizada
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.compras_realizadas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL REFERENCES public.empresas(id),
  -- UNIQUE: uma solicitação gera no máximo uma compra.
  solicitacao_id           uuid NOT NULL UNIQUE REFERENCES public.solicitacoes_compra(id) ON DELETE CASCADE,
  comprador_responsavel_id uuid NOT NULL REFERENCES public.usuarios(id),
  data_compra              timestamptz NOT NULL DEFAULT now(),
  fornecedor_escolhido     text NOT NULL,
  produto_comprado         text NOT NULL,
  valor_unitario_final     numeric(14, 2) NOT NULL,
  frete_final              numeric(14, 2),
  valor_total_final        numeric(14, 2) NOT NULL,
  forma_pagamento          text NOT NULL,
  parcelamento_descricao   text,
  cartao_ultimos_digitos   text,
  numero_pedido            text NOT NULL,
  previsao_entrega         date NOT NULL,
  nf_comprovante_url       text,
  observacoes              text,
  criado_em                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_realizadas_empresa ON public.compras_realizadas (empresa_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- O isolamento do AXIUM era `set_config('app.current_empresa')` DENTRO de uma
-- transação (prisma/rls.sql + PrismaService.forTenant). Isso não sobrevive ao
-- PostgREST: não há transação por request onde rodar o set_config. Reescrito no
-- padrão Supabase — a fronteira sai do vínculo do usuário, lido por auth.uid().
--
-- Nota: o event trigger `rls_auto_enable` deixa toda tabela nova fail-closed
-- (ver project_advisors_info_2026_08_17). Sem as policies abaixo, nada aqui é
-- legível por ninguém.

CREATE OR REPLACE FUNCTION public.insumos_empresas_do_usuario()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ue.empresa_id
  FROM public.usuarios_empresas ue
  JOIN public.usuarios u ON u.id = ue.usuario_id
  WHERE ue.usuario_id = auth.uid()
    AND ue.ativo
    AND u.ativo;
$$;

-- GRANT EXECUTE a PUBLIC é implícito em toda função criada e foi a causa-raiz
-- de 47 dos 55 warnings do Advisor (ver project_advisors_warnings_2026_08_17).
-- O padrão certo já usado no projeto é revogar e conceder explicitamente.
--
-- REVOGAR TAMBÉM DE `anon`, e não só de PUBLIC: o Supabase aplica
-- `ALTER DEFAULT PRIVILEGES` no schema `public` concedendo EXECUTE a
-- anon/authenticated/service_role já na criação da função — um grant
-- explícito para o role `anon`, distinto do pseudo-role PUBLIC. `REVOKE ...
-- FROM PUBLIC` não o atinge; sem o REVOKE explícito de `anon`, toda função
-- nova aqui nasce chamável sem login (confirmado via `\df+` neste módulo:
-- `anon=X/postgres` presente em todas as 9 funções antes desta correção).
-- Não é vazamento de dado — a RLS ainda barra a escrita, pois `auth.uid()` é
-- NULL para `anon` — mas expõe superfície e mensagem de erro a quem não
-- devia nem discar a função. Mesma regra vale para toda função nova do
-- módulo: revogar de PUBLIC **e** de anon, conceder só ao role pretendido.
REVOKE EXECUTE ON FUNCTION public.insumos_empresas_do_usuario() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.insumos_empresas_do_usuario() TO authenticated;

COMMENT ON FUNCTION public.insumos_empresas_do_usuario() IS
  'Empresas que o usuário autenticado enxerga no módulo de insumos. É a '
  'fronteira de tenancy — toda policy do módulo passa por aqui.';

ALTER TABLE public.empresas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_empresas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_padrao_compra     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sinonimos_item_compra   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_compra     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_status_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_compra         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprovacoes_compra       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_realizadas      ENABLE ROW LEVEL SECURITY;

-- Empresas: quem tem vínculo lê a sua; só admin/diretoria administram o cadastro.
DROP POLICY IF EXISTS "empresas_select" ON public.empresas;
CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.insumos_empresas_do_usuario())
         OR public.remuneracao_has_role(ARRAY['admin','diretoria']));

DROP POLICY IF EXISTS "empresas_write" ON public.empresas;
CREATE POLICY "empresas_write" ON public.empresas
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- Vínculo: cada um vê o próprio; admin/diretoria veem e administram todos.
DROP POLICY IF EXISTS "usuarios_empresas_select" ON public.usuarios_empresas;
CREATE POLICY "usuarios_empresas_select" ON public.usuarios_empresas
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid()
         OR public.remuneracao_has_role(ARRAY['admin','diretoria']));

DROP POLICY IF EXISTS "usuarios_empresas_write" ON public.usuarios_empresas;
CREATE POLICY "usuarios_empresas_write" ON public.usuarios_empresas
  FOR ALL TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin','diretoria']))
  WITH CHECK (public.remuneracao_has_role(ARRAY['admin','diretoria']));

-- Catálogo global: todo autenticado lê, admin/diretoria curam.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['itens_padrao_compra', 'sinonimos_item_compra'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.remuneracao_has_role(ARRAY[''admin'',''diretoria''])) '
      'WITH CHECK (public.remuneracao_has_role(ARRAY[''admin'',''diretoria'']))',
      t || '_write', t);
  END LOOP;
END $$;

-- Tabelas com empresa_id: leitura e escrita restritas às empresas vinculadas.
-- A separação fina de quem pode aprovar/comprar fica na camada de permissão do
-- Pulsar (fase 2 do doc) — a RLS garante a fronteira de EMPRESA, que é a que
-- não pode depender do frontend.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'solicitacoes_compra', 'historico_status_compra', 'cotacao_jobs',
    'cotacoes_compra', 'aprovacoes_compra', 'compras_realizadas'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (empresa_id IN (SELECT public.insumos_empresas_do_usuario()))',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (empresa_id IN (SELECT public.insumos_empresas_do_usuario())) '
      'WITH CHECK (empresa_id IN (SELECT public.insumos_empresas_do_usuario()))',
      t || '_write', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Documentação no catálogo
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.empresas IS
  'Pessoas jurídicas atendidas pelo módulo de insumos. Fronteira de tenancy do '
  'módulo — não confundir com central.organizations (org do produto Central).';

COMMENT ON TABLE public.usuarios_empresas IS
  'Quais empresas cada usuário enxerga. Consultada por '
  'insumos_empresas_do_usuario(), que toda policy do módulo usa.';

COMMENT ON COLUMN public.solicitacoes_compra.solicitante_id IS
  'Sempre preenchido. Quando o pedido vem do link público, aponta para o '
  'usuário-sistema da empresa e quem pediu de fato fica em solicitante_externo_*.';

COMMENT ON COLUMN public.cotacoes_compra.valor_decisao IS
  'O que decide o ranking, calculado por calcularValorDecisao() em '
  'frontend/lib/insumos/precificacao.ts. score_ponderado é informativo.';

-- =============================================================================
-- 20260818090000_insumos_rpcs.sql
-- =============================================================================
-- Operações atômicas do módulo de insumos + trilha de auditoria.
--
-- POR QUE ISSO EXISTE
-- O AXIUM fazia as escritas compostas dentro de `prisma.forTenant(async tx => …)`
-- — uma transação de verdade. O PostgREST NÃO expõe transação por request: cada
-- chamada do supabase-js é um statement isolado. Sem isto, uma falha no meio
-- deixa estado inconsistente e CALADO. Os quatro casos que doem:
--   1. solicitação criada sem `cotacao_jobs`  -> nunca é cotada, e ninguém vê;
--   2. aprovação gravada sem troca de status  -> decisão fantasma;
--   3. compra registrada sem troca de status  -> solicitação presa em APROVADA;
--   4. status trocado sem `historico_status_compra` -> buraco na trilha, e o
--      `retomar` depende do histórico para saber para onde voltar.
-- Uma função no Postgres roda inteira dentro de uma transação. É o equivalente
-- nativo do `forTenant`, e o projeto já usa RPC assim (padrão `robo_*`).
--
-- SECURITY INVOKER (o padrão), de propósito — NÃO definer:
-- tudo que estas funções fazem, o próprio usuário já pode fazer pelas policies
-- de 20260817200000. Rodando como invoker, a RLS continua valendo dentro da
-- função e a fronteira de empresa é garantida pelo banco, sem precisar repetir
-- checagem de vínculo em cada uma (que é justamente onde se erra).
-- Consequência que o colega precisa saber: se a RLS barrar, o SELECT não acha a
-- linha — por isso toda função abaixo confere `NOT FOUND` e levanta exceção em
-- vez de retornar sucesso vazio.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trilha de auditoria
-- ─────────────────────────────────────────────────────────────────────────────
-- Portada de `LogAuditoria` do AXIUM. Sufixo `_insumos` para não colidir com
-- `acomp_auditoria` (auditoria de acompanhamento, outro domínio).

CREATE TABLE IF NOT EXISTS public.log_auditoria_insumos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  usuario_id   uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  entidade     text NOT NULL,
  entidade_id  text,
  acao         text NOT NULL,
  dados_antes  jsonb,
  dados_depois jsonb,
  ip           text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT log_auditoria_insumos_acao_check
    CHECK (acao IN ('criar', 'editar', 'excluir', 'visualizar'))
);

CREATE INDEX IF NOT EXISTS idx_log_auditoria_insumos_empresa
  ON public.log_auditoria_insumos (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_insumos_entidade
  ON public.log_auditoria_insumos (entidade, entidade_id);

ALTER TABLE public.log_auditoria_insumos ENABLE ROW LEVEL SECURITY;

-- Leitura restrita: trilha de auditoria não é dado operacional.
DROP POLICY IF EXISTS "log_auditoria_insumos_select" ON public.log_auditoria_insumos;
CREATE POLICY "log_auditoria_insumos_select" ON public.log_auditoria_insumos
  FOR SELECT TO authenticated
  USING (public.remuneracao_has_role(ARRAY['admin', 'diretoria']));

-- Escrita: qualquer autenticado registra, mas só na empresa a que pertence e só
-- em nome de si mesmo — impede forjar autoria de outra pessoa.
DROP POLICY IF EXISTS "log_auditoria_insumos_insert" ON public.log_auditoria_insumos;
CREATE POLICY "log_auditoria_insumos_insert" ON public.log_auditoria_insumos
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND (empresa_id IS NULL OR empresa_id IN (SELECT public.insumos_empresas_do_usuario()))
  );

-- Sem policy de UPDATE/DELETE: trilha de auditoria é append-only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Transição de status (o núcleo — todas as outras chamam esta)
-- ─────────────────────────────────────────────────────────────────────────────
-- Equivale a SolicitacaoStatusService.atualizar() do AXIUM: troca o status e
-- grava o histórico, sempre juntos.

CREATE OR REPLACE FUNCTION public.insumos_atualizar_status(
  p_solicitacao_id uuid,
  p_novo_status    text,
  p_origem         text DEFAULT 'SISTEMA',
  p_observacao     text DEFAULT NULL
)
RETURNS public.solicitacoes_compra
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_anterior text;
  v_empresa  uuid;
  v_linha    public.solicitacoes_compra;
BEGIN
  -- FOR UPDATE serializa duas trocas concorrentes na mesma solicitação; sem
  -- isso, duas decisões simultâneas gravariam dois históricos com o mesmo
  -- status_anterior.
  SELECT status, empresa_id INTO v_anterior, v_empresa
  FROM public.solicitacoes_compra
  WHERE id = p_solicitacao_id
  FOR UPDATE;

  -- Não achou: ou não existe, ou a RLS escondeu (não é de uma empresa do
  -- usuário). Os dois casos são "não encontrada" para quem chama.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.solicitacoes_compra
  SET status = p_novo_status
  WHERE id = p_solicitacao_id
  RETURNING * INTO v_linha;

  -- Hoje as policies de SELECT e de escrita usam o mesmo predicado, então quem
  -- passou do SELECT acima passa daqui. A guarda existe para o dia em que
  -- alguém apertar só a de escrita: sem ela, o UPDATE não afetaria linha
  -- nenhuma, o histórico seria gravado assim mesmo e a função retornaria NULL
  -- como se tivesse dado certo.
  IF v_linha.id IS NULL THEN
    RAISE EXCEPTION 'Sem permissao para alterar esta solicitacao.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.historico_status_compra
    (empresa_id, solicitacao_id, status_anterior, status_novo, origem, observacao)
  VALUES
    (v_empresa, p_solicitacao_id, v_anterior, p_novo_status, p_origem, p_observacao);

  RETURN v_linha;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Criar solicitação (+ enfileirar cotação)
-- ─────────────────────────────────────────────────────────────────────────────
-- Nasce em SOLICITACAO_CRIADA e só vira COTACAO_EM_ANDAMENTO quando o worker
-- reivindicar o job — igual ao AXIUM.
--
-- Colunas listadas uma a uma em vez de jsonb_populate_record: com
-- `jsonb_populate_record(null::solicitacoes_compra, …)` toda chave ausente vira
-- NULL em vez de assumir o DEFAULT da coluna, o que estouraria os NOT NULL e
-- zeraria os booleanos de preferência (aceita_similar e companhia).

CREATE OR REPLACE FUNCTION public.insumos_criar_solicitacao(p_dados jsonb)
RETURNS public.solicitacoes_compra
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_linha public.solicitacoes_compra;
BEGIN
  INSERT INTO public.solicitacoes_compra (
    empresa_id, setor, categoria, categoria_outro,
    solicitante_id, solicitante_externo_nome, solicitante_externo_email,
    prioridade, justificativa_compra,
    nome_item, descricao_detalhada, quantidade, unidade_medida,
    marca_desejada, modelo_desejado, cor, tamanho_medida_capacidade, material,
    imagem_anexo_url, item_padrao_id, link_referencia,
    aceita_similar, aceita_outra_marca, somente_novo, aceita_usado,
    somente_compra_nacional, marketplace_permitido,
    valor_maximo_estimado, prazo_maximo_entrega_dias, fornecedor_sugerido
  ) VALUES (
    (p_dados->>'empresa_id')::uuid,
    p_dados->>'setor',
    p_dados->>'categoria',
    -- categoria_outro só faz sentido em OUTROS; fora disso é sujeira.
    CASE WHEN p_dados->>'categoria' = 'OUTROS'
         THEN nullif(btrim(coalesce(p_dados->>'categoria_outro', '')), '') END,
    (p_dados->>'solicitante_id')::uuid,
    nullif(btrim(coalesce(p_dados->>'solicitante_externo_nome', '')), ''),
    nullif(btrim(coalesce(p_dados->>'solicitante_externo_email', '')), ''),
    p_dados->>'prioridade',
    p_dados->>'justificativa_compra',
    p_dados->>'nome_item',
    p_dados->>'descricao_detalhada',
    (p_dados->>'quantidade')::numeric,
    p_dados->>'unidade_medida',
    p_dados->>'marca_desejada',
    p_dados->>'modelo_desejado',
    p_dados->>'cor',
    p_dados->>'tamanho_medida_capacidade',
    p_dados->>'material',
    p_dados->>'imagem_anexo_url',
    (p_dados->>'item_padrao_id')::uuid,
    p_dados->>'link_referencia',
    coalesce((p_dados->>'aceita_similar')::boolean, true),
    coalesce((p_dados->>'aceita_outra_marca')::boolean, true),
    coalesce((p_dados->>'somente_novo')::boolean, true),
    coalesce((p_dados->>'aceita_usado')::boolean, false),
    coalesce((p_dados->>'somente_compra_nacional')::boolean, true),
    p_dados->>'marketplace_permitido',
    (p_dados->>'valor_maximo_estimado')::numeric,
    (p_dados->>'prazo_maximo_entrega_dias')::integer,
    p_dados->>'fornecedor_sugerido'
  )
  RETURNING * INTO v_linha;

  INSERT INTO public.cotacao_jobs (empresa_id, solicitacao_id)
  VALUES (v_linha.empresa_id, v_linha.id);

  RETURN v_linha;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reenviar para cotação
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.insumos_reenviar_cotacao(
  p_solicitacao_id uuid,
  p_observacao     text DEFAULT 'Cotacao reenviada para processamento'
)
RETURNS public.solicitacoes_compra
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT empresa_id INTO v_empresa
  FROM public.solicitacoes_compra WHERE id = p_solicitacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.cotacao_jobs (empresa_id, solicitacao_id)
  VALUES (v_empresa, p_solicitacao_id);

  RETURN public.insumos_atualizar_status(
    p_solicitacao_id, 'SOLICITACAO_CRIADA', 'USUARIO', p_observacao);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Decidir aprovação
-- ─────────────────────────────────────────────────────────────────────────────
-- Grava a decisão, marca a cotação escolhida e move o status — os três juntos.
-- As regras "APROVAR exige cotação" e "REPROVAR exige justificativa" já são
-- CHECK na tabela (20260817200000); aqui garantimos o que o CHECK não alcança:
-- que a cotação escolhida pertence a ESTA solicitação.

CREATE OR REPLACE FUNCTION public.insumos_decidir_aprovacao(
  p_solicitacao_id       uuid,
  p_decisao              text,
  p_cotacao_escolhida_id uuid DEFAULT NULL,
  p_justificativa        text DEFAULT NULL
)
RETURNS public.solicitacoes_compra
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_empresa uuid;
  v_status  text;
BEGIN
  SELECT empresa_id, status INTO v_empresa, v_status
  FROM public.solicitacoes_compra WHERE id = p_solicitacao_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'AGUARDANDO_APROVACAO' THEN
    RAISE EXCEPTION 'Nao e possivel decidir aprovacao de uma solicitacao com status "%".', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_decisao = 'APROVAR' AND NOT EXISTS (
    SELECT 1 FROM public.cotacoes_compra
    WHERE id = p_cotacao_escolhida_id AND solicitacao_id = p_solicitacao_id
  ) THEN
    RAISE EXCEPTION 'Cotacao invalida para esta solicitacao.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.aprovacoes_compra
    (empresa_id, solicitacao_id, aprovador_id, decisao, cotacao_escolhida_id, justificativa)
  VALUES
    (v_empresa, p_solicitacao_id, auth.uid(), p_decisao, p_cotacao_escolhida_id, p_justificativa);

  IF p_decisao = 'APROVAR' THEN
    -- Exclusividade da escolhida: zera todas e marca uma. Duas cotações
    -- `selecionada` na mesma solicitação seriam ambíguas na hora da compra.
    UPDATE public.cotacoes_compra SET selecionada = false WHERE solicitacao_id = p_solicitacao_id;
    UPDATE public.cotacoes_compra SET selecionada = true  WHERE id = p_cotacao_escolhida_id;
    RETURN public.insumos_atualizar_status(p_solicitacao_id, 'APROVADA', 'USUARIO');

  ELSIF p_decisao = 'SOLICITAR_NOVA_COTACAO' THEN
    RETURN public.insumos_reenviar_cotacao(p_solicitacao_id, 'Nova cotacao solicitada na aprovacao');

  ELSE
    RETURN public.insumos_atualizar_status(p_solicitacao_id, 'REPROVADA', 'USUARIO', p_justificativa);
  END IF;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Criar cotação manual
-- ─────────────────────────────────────────────────────────────────────────────
-- Os valores derivados (valor_decisao, forma_pagamento, score) são calculados
-- em TypeScript por frontend/lib/insumos/ e chegam prontos — a lógica de
-- precificação tem testes e não deve ser reimplementada em SQL.
-- `p_promover` diz se a cotação destrava a aprovação: quem decide é o TS, que
-- conhece SCORE_MINIMO_COMPATIBILIDADE e os status anteriores à aprovação.

CREATE OR REPLACE FUNCTION public.insumos_criar_cotacao_manual(
  p_solicitacao_id uuid,
  p_dados          jsonb,
  p_promover       boolean DEFAULT false
)
RETURNS public.cotacoes_compra
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_empresa uuid;
  v_cotacao public.cotacoes_compra;
BEGIN
  SELECT empresa_id INTO v_empresa
  FROM public.solicitacoes_compra WHERE id = p_solicitacao_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.cotacoes_compra (
    empresa_id, solicitacao_id, fornecedor, produto_encontrado,
    valor_unitario, quantidade, valor_total_produtos, frete, valor_total_com_frete,
    parcelamento_descricao, condicao_sem_juros,
    valor_total_parcelas_sem_juros, valor_total_parcelas_com_juros,
    valor_decisao, forma_pagamento_decisao, parcelamento_com_juros,
    prazo_entrega_descricao, prazo_entrega_ordem_dias,
    link_produto, origem, score_compatibilidade, status_cotacao,
    criada_manualmente, criada_por_id
  ) VALUES (
    v_empresa, p_solicitacao_id,
    p_dados->>'fornecedor',
    p_dados->>'produto_encontrado',
    (p_dados->>'valor_unitario')::numeric,
    (p_dados->>'quantidade')::numeric,
    (p_dados->>'valor_total_produtos')::numeric,
    (p_dados->>'frete')::numeric,
    (p_dados->>'valor_total_com_frete')::numeric,
    p_dados->>'parcelamento_descricao',
    coalesce((p_dados->>'condicao_sem_juros')::boolean, false),
    (p_dados->>'valor_total_parcelas_sem_juros')::numeric,
    (p_dados->>'valor_total_parcelas_com_juros')::numeric,
    (p_dados->>'valor_decisao')::numeric,
    p_dados->>'forma_pagamento_decisao',
    coalesce((p_dados->>'parcelamento_com_juros')::boolean, false),
    p_dados->>'prazo_entrega_descricao',
    (p_dados->>'prazo_entrega_ordem_dias')::integer,
    p_dados->>'link_produto',
    coalesce(p_dados->>'origem', 'NACIONAL'),
    (p_dados->>'score_compatibilidade')::numeric,
    -- Cotação manual já nasce validada: um humano vetou o produto.
    'VALIDADA',
    true,
    auth.uid()
  )
  RETURNING * INTO v_cotacao;

  IF p_promover THEN
    PERFORM public.insumos_atualizar_status(
      p_solicitacao_id, 'AGUARDANDO_APROVACAO', 'SISTEMA',
      'Cotacao manual atingiu o score minimo');
  END IF;

  RETURN v_cotacao;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Registrar compra
-- ─────────────────────────────────────────────────────────────────────────────
-- Duas trocas de status em sequência (COMPRA_REALIZADA -> AGUARDANDO_ENTREGA),
-- como no AXIUM: a primeira é o ato do usuário, a segunda é o sistema seguindo
-- o fluxo. As duas ficam no histórico.

CREATE OR REPLACE FUNCTION public.insumos_registrar_compra(
  p_solicitacao_id uuid,
  p_dados          jsonb
)
RETURNS public.compras_realizadas
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_empresa uuid;
  v_status  text;
  v_compra  public.compras_realizadas;
BEGIN
  SELECT empresa_id, status INTO v_empresa, v_status
  FROM public.solicitacoes_compra WHERE id = p_solicitacao_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'APROVADA' THEN
    RAISE EXCEPTION 'Nao e possivel registrar compra de uma solicitacao com status "%".', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.compras_realizadas (
    empresa_id, solicitacao_id, comprador_responsavel_id, data_compra,
    fornecedor_escolhido, produto_comprado, valor_unitario_final, frete_final,
    valor_total_final, forma_pagamento, parcelamento_descricao,
    cartao_ultimos_digitos, numero_pedido, previsao_entrega,
    nf_comprovante_url, observacoes
  ) VALUES (
    v_empresa, p_solicitacao_id, auth.uid(),
    coalesce((p_dados->>'data_compra')::timestamptz, now()),
    p_dados->>'fornecedor_escolhido',
    p_dados->>'produto_comprado',
    (p_dados->>'valor_unitario_final')::numeric,
    (p_dados->>'frete_final')::numeric,
    (p_dados->>'valor_total_final')::numeric,
    p_dados->>'forma_pagamento',
    p_dados->>'parcelamento_descricao',
    p_dados->>'cartao_ultimos_digitos',
    p_dados->>'numero_pedido',
    (p_dados->>'previsao_entrega')::date,
    p_dados->>'nf_comprovante_url',
    p_dados->>'observacoes'
  )
  RETURNING * INTO v_compra;

  PERFORM public.insumos_atualizar_status(p_solicitacao_id, 'COMPRA_REALIZADA', 'USUARIO');
  PERFORM public.insumos_atualizar_status(p_solicitacao_id, 'AGUARDANDO_ENTREGA', 'SISTEMA');

  RETURN v_compra;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Excluir solicitação
-- ─────────────────────────────────────────────────────────────────────────────
-- As aprovações apontam para cotações; removê-las antes deixa o resto cair por
-- cascata (mesma ordem do AXIUM).

CREATE OR REPLACE FUNCTION public.insumos_excluir_solicitacao(p_solicitacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.solicitacoes_compra WHERE id = p_solicitacao_id) THEN
    RAISE EXCEPTION 'Solicitacao nao encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.compras_realizadas WHERE solicitacao_id = p_solicitacao_id) THEN
    RAISE EXCEPTION 'Nao e possivel excluir uma solicitacao que ja gerou uma compra.'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.aprovacoes_compra   WHERE solicitacao_id = p_solicitacao_id;
  DELETE FROM public.solicitacoes_compra WHERE id = p_solicitacao_id;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants
-- ─────────────────────────────────────────────────────────────────────────────
-- GRANT EXECUTE a PUBLIC é implícito em toda função criada e foi a causa-raiz de
-- 47 dos 55 warnings do Advisor. Revogar e conceder explicitamente é o padrão já
-- adotado no projeto.
--
-- REVOGAR TAMBÉM DE `anon`, não só de PUBLIC — mesma pegadinha corrigida em
-- 20260817200000 para insumos_empresas_do_usuario(): o Supabase aplica
-- `ALTER DEFAULT PRIVILEGES` no schema `public` concedendo EXECUTE a
-- anon/authenticated/service_role já na criação da função, um grant explícito
-- para o role `anon` que `REVOKE ... FROM PUBLIC` sozinho não alcança. Sem
-- isto, as 7 RPCs nasciam chamáveis sem login (a RLS ainda barrava a escrita,
-- já que `auth.uid()` é NULL para `anon` — não houve vazamento de dado, mas a
-- superfície e a mensagem de erro ficavam expostas a quem não devia nem
-- discar a função).
DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'insumos_atualizar_status(uuid,text,text,text)',
    'insumos_criar_solicitacao(jsonb)',
    'insumos_reenviar_cotacao(uuid,text)',
    'insumos_decidir_aprovacao(uuid,text,uuid,text)',
    'insumos_criar_cotacao_manual(uuid,jsonb,boolean)',
    'insumos_registrar_compra(uuid,jsonb)',
    'insumos_excluir_solicitacao(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END
$grants$;

COMMENT ON FUNCTION public.insumos_atualizar_status(uuid, text, text, text) IS
  'Troca o status e grava o historico atomicamente. Toda transicao passa por '
  'aqui - o retomar depende do historico para saber para onde voltar.';

-- =============================================================================
-- 20260818100000_permissao_insumos.sql
-- =============================================================================
-- Permissão de acesso ao controle de insumos (porte do AXIUM).
--
-- Definição do usuário em 2026-08-18: quem acessa é o setor **`faturamento`**,
-- mais `admin` e `diretoria`.
--
-- ATENÇÃO AO NOME DO PAPEL: o pedido falou "financeiro", mas esse valor NÃO
-- existe — o CHECK de `usuarios.role` aceita apenas admin, diretoria, recepcao,
-- autorizacao, terapeutico, faturamento, rp, cronograma e
-- disponibilidade_terapeuta. O setor financeiro do dia a dia é o papel
-- `faturamento`, e foi nele que a permissão entrou. Se a intenção era criar um
-- papel NOVO, separado de `faturamento`, é outra migration: mexe no CHECK, na
-- tela de administração e nos roleDefaults.
--
-- Um código só (`insumos`), não os 8 granulares do AXIUM
-- (compras.ver/aprovar/comprar/confirmar-entrega/cotar-manual/alterar-status/
-- solicitar/editar): o acesso pedido é por setor. Granularizar quando aparecer o
-- caso de quem cota mas não aprova.
--
-- O default por papel vive em `frontend/lib/permissions/routes.ts` (roleDefaults),
-- não aqui. Esta tabela é o catálogo que alimenta a tela /admin/permissoes e os
-- overrides por usuário em `usuarios_permissoes`.

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('insumos', 'Controle de Insumos', '/insumos', 'Insumos',
   'Solicitacoes de compra, cotacoes, aprovacao e registro de compra de insumos')
ON CONFLICT (codigo) DO NOTHING;

-- =============================================================================
-- Registro no livro-caixa (depois que tudo acima rodou sem erro)
-- =============================================================================
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
  ('20260817190000', 'pacientes_canonica'),
  ('20260817190100', 'backfill_pacientes_do_tita'),
  ('20260817200000', 'insumos_schema'),
  ('20260818090000', 'insumos_rpcs'),
  ('20260818100000', 'permissao_insumos')
ON CONFLICT (version) DO NOTHING;

NOTIFY pgrst, 'reload schema';
