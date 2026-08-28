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
