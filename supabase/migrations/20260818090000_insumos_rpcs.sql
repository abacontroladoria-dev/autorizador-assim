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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END
$grants$;

COMMENT ON FUNCTION public.insumos_atualizar_status(uuid, text, text, text) IS
  'Troca o status e grava o historico atomicamente. Toda transicao passa por '
  'aqui - o retomar depende do historico para saber para onde voltar.';
