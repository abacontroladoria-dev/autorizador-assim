-- robo_concluir_tarefa passa a aceitar 'glosa' e a gravar o motivo em status_assim.
--
-- POR QUE
-- Quando a ASSIM recusa, ela devolve um recibo igual ao de sucesso, só que com
-- "BENEFICIO REJEITADO" no lugar de "BENEFICIO PROCESSADO" — e com guia, data/hora e
-- o motivo ("TUSS 1 22070384 - (1013) CADASTRO DO BENEFICIARIO COM PROBLEMAS") todos
-- na tela. O robô não conhecia essa tela: esperava os 120s inteiros, o timeout virava
-- "a recepção não clicou em enviar" e a linha ia para 'erro', jogando fora a guia e o
-- horário. A glosa só era reconhecida no dia seguinte, quando o robô do relatório
-- trazia situacao='GLOSA' para autorizacoes_assim.
--
-- 'glosa' já era aceito por chk_status desde 20260528120000 — o que faltava era o robô
-- poder gravá-lo. O comentário do bloco 5 de 20260813100200 dizia que glosa era
-- "decisão humana"; com o recibo lido na tela, ela passa a ser leitura de fato.
--
-- POR QUE O DROP DA ASSINATURA ANTIGA
-- O parâmetro novo tem DEFAULT. Sem o DROP ficariam duas funções (7 e 8 argumentos) e
-- a chamada do PostgREST com 7 nomes casaria com as duas — erro de função ambígua.
-- O CREATE é OR REPLACE para a migration poder ser aplicada duas vezes sem estourar
-- "function already exists with same argument types" na segunda.
--
-- ORDEM DE IMPLANTAÇÃO
-- Aplicar ANTES de publicar a versão 1.1.5 do robô. A frota 1.1.4 chama por nome, com
-- 7 argumentos; contra esta função de 8 com default, essa chamada continua resolvendo.
-- Na ordem inversa, toda máquina do campo pararia de concluir tarefa até o auto-update
-- passar.

DROP FUNCTION IF EXISTS public.robo_concluir_tarefa(
  text, uuid, text, text, text, timestamp, text
);

CREATE OR REPLACE FUNCTION public.robo_concluir_tarefa(
  p_token               text,
  p_fila_id             uuid,
  p_status              text,
  p_numero_autorizacao  text      DEFAULT NULL,
  p_forma_autorizacao   text      DEFAULT NULL,
  p_horario_autorizacao timestamp DEFAULT NULL,
  p_error_message       text      DEFAULT NULL,
  p_status_assim        text      DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_afetadas   int;
BEGIN
  -- 'cancelado' e 'falta' seguem fora do alcance do robô: são decisões humanas,
  -- tomadas na tela. 'glosa' entrou porque é leitura do recibo, não decisão.
  IF p_status NOT IN ('concluido', 'concluido_sem_guia', 'erro', 'glosa') THEN
    RAISE EXCEPTION 'status nao permitido ao robo: %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.fila_autorizacoes
     SET status              = p_status,
         numero_autorizacao  = coalesce(p_numero_autorizacao, numero_autorizacao),
         horario_autorizacao = coalesce(p_horario_autorizacao, horario_autorizacao),
         forma_autorizacao   = coalesce(p_forma_autorizacao, forma_autorizacao),
         -- Sem forma escolhida, validacao_finalizada_em fica nula de propósito:
         -- é o que deixa a pendência visível e preenchível depois pela rota
         -- /api/fila-autorizacoes/validacao, em vez de fingir que foi resolvida.
         validacao_finalizada_em = CASE
                                     WHEN p_forma_autorizacao IS NOT NULL THEN now()
                                     ELSE validacao_finalizada_em
                                   END,
         -- Mesma coluna e mesmo formato que sync_assim_results usa quando o
         -- relatório chega ("1601-REINCIDENCIA NO ATEN"). Aqui chega horas antes.
         status_assim        = coalesce(p_status_assim, status_assim),
         assim_updated_at    = CASE
                                 WHEN p_status_assim IS NOT NULL THEN now()
                                 ELSE assim_updated_at
                               END,
         -- Glosa não é erro: sem problema relatado, error_message é limpo, do
         -- mesmo jeito que num aceite. O motivo da recusa mora em status_assim.
         error_message       = CASE
                                 WHEN p_status IN ('concluido', 'glosa')
                                  AND p_error_message IS NULL
                                 THEN NULL ELSE coalesce(p_error_message, error_message)
                               END,
         completed_at        = now(),
         updated_at          = now()
   WHERE id = p_fila_id
     AND machine_id = v_machine_id;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas > 0;
END;
$$;

-- Grants refeitos: o DROP levou os da assinatura antiga junto.
REVOKE EXECUTE ON FUNCTION public.robo_concluir_tarefa(text, uuid, text, text, text, timestamp, text, text) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.robo_concluir_tarefa(text, uuid, text, text, text, timestamp, text, text) TO anon;
