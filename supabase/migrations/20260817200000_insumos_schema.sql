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
REVOKE EXECUTE ON FUNCTION public.insumos_empresas_do_usuario() FROM PUBLIC;
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
