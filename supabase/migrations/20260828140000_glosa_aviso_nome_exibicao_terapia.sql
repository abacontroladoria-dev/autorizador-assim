-- =============================================================================
-- O aviso de glosa passa a carregar o id de exibição da terapia
-- =============================================================================
-- POR QUE ESTA MIGRATION EXISTE E NÃO É UMA EDIÇÃO DA 20260828120000
-- Aquela JÁ ESTÁ APLICADA em produção (cron `glosa-avisa-clickup` ativo desde
-- 2026-08-28). Reaplicar o arquivo editado não resolveria: o
-- `CREATE TABLE IF NOT EXISTS` não acrescenta coluna a tabela existente, e a
-- coluna nova entraria em silêncio como ausente. Daí o ALTER avulso.
--
-- O CASO QUE EXPÔS (primeiro aviso real, 2026-08-28, canal tecnologia-dev)
-- A mensagem chegou com "🧩 Terapia: Aplicador ABA (PS)" — o nome da AÇÃO no
-- TiTa, não o nome de exibição da terapia, que para o Grupo 1 ABA é sempre
-- "Psicologia ABA". Não é defeito do aviso: é o dado que o TiTa gravou na sessão,
-- o mesmo tipo de exibição torta que motivou a 20260813120000 (caso Isabella,
-- 13/08/2026 09:20). O TUSS 22070384 que veio na mesma mensagem confirma — ele
-- só pode ter saído pelo fallback por ID/regex daquela função.
--
-- A DECISÃO DO USUÁRIO (2026-08-28): mostrar OS DOIS —
-- "Psicologia ABA (Aplicador ABA (PS))". O nome de exibição serve a quem vai
-- contestar a glosa; o nome cru do TiTa serve a quem for investigar por que a
-- sessão está cadastrada assim. Trocar um pelo outro esconderia o problema de
-- cadastro; mostrar só o cru deixa jargão interno numa mensagem operacional.
--
-- POR QUE O ID, E NÃO O NOME
-- A regra de exibição é por ID ("toda lógica deve operar por ID, nunca hardcodar
-- nomes"), e o ID é o que sobrevive a alguém renomear a terapia no TiTa. A
-- tradução id -> "Psicologia ABA" mora na Edge Function, junto do resto da
-- composição da frase; aqui só se garante que o id VIAJE até lá, congelado no
-- instante da recusa como todo o resto do retrato.
-- =============================================================================

ALTER TABLE public.glosa_avisos
  ADD COLUMN IF NOT EXISTS terapia_exibicao_id bigint;

COMMENT ON COLUMN public.glosa_avisos.terapia_exibicao_id IS
  'Id da terapia de exibição, copiado da fila. Permite à mensagem mostrar também o nome de exibição ("Psicologia ABA") quando o TiTa gravou o nome da ação ("Aplicador ABA (PS)"). A regra por id vive na Edge Function glosa-clickup.';

-- O trigger, recriado só para incluir a coluna nova no INSERT. Corpo idêntico ao
-- de 20260828120000 no resto — inclusive a blindagem, que é o que importa aqui:
-- toda exceção é engolida, porque avisar no ClickUp JAMAIS pode derrubar a
-- conclusão de uma tarefa do robô e deixar a recepcionista travada na tela.
CREATE OR REPLACE FUNCTION public.avisar_glosa_clickup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Declarado DENTRO da função: posto por ALTER FUNCTION ele morreria calado no
-- próximo CREATE OR REPLACE (reference_create_or_replace_perde_proconfig).
SET search_path = public, pg_temp
AS $$
DECLARE
  v_janela int;
  v_ativo  boolean;
BEGIN
  BEGIN
    SELECT ativo, janela_horas INTO v_ativo, v_janela
      FROM public.glosa_avisos_config WHERE id = 1;

    IF NOT coalesce(v_ativo, false) THEN
      RETURN NEW;
    END IF;

    -- Guarda de retroatividade. completed_at é UTC (grupo de colunas UTC de
    -- fila_autorizacoes), e now() em timestamptz — a comparação precisa do
    -- AT TIME ZONE para não errar 3h e descartar tudo, ou aceitar tudo.
    IF NEW.completed_at IS NOT NULL
       AND (NEW.completed_at AT TIME ZONE 'UTC') < now() - make_interval(hours => coalesce(v_janela, 24))
    THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.glosa_avisos (
      fila_id, paciente_nome, motivo, guia, horario_autorizacao, data_atendimento,
      terapia, terapia_exibicao_id, tuss, matricula, recepcionista
    ) VALUES (
      NEW.id,
      NEW.paciente_nome,
      NEW.status_assim,
      NEW.numero_autorizacao,
      NEW.horario_autorizacao,
      NEW.data_atendimento,
      -- A terapia já está na PRÓPRIA linha: os dois caminhos de entrada a
      -- gravam — /solicitar (como "A + B" quando a sessão tem mais de uma) e
      -- /autorizacoes-avulsas. Não há join a fazer, e a avulsa também tem.
      NEW.terapia_nome,
      NEW.terapia_exibicao_id,
      NEW.tuss,
      -- A carteirinha da ASSIM é empresa(6) + matricula(7) + dep(2), e a fila
      -- guarda as três partes já fatiadas. Remontada no formato do recibo, que é
      -- o mesmo de formatarCarteirinha() no frontend.
      nullif(concat_ws('.', NEW.empresa, NEW.matricula, NEW.dep), ''),
      -- criado_por já é o NOME (texto), resolvido pelo trigger de 20260730000000
      -- via machine_id -> maquinas.user_id -> usuarios.nome. Pode ser nulo:
      -- machine_id='WEB' e as máquinas do robô não têm user_id.
      NEW.criado_por
    )
    ON CONFLICT (fila_id) DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- De propósito: avisar não pode derrubar a tarefa do robô.
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

-- O trigger em si não muda (mesma condição, mesma função), mas recriar é
-- inofensivo e deixa a migration auto-suficiente para quem a aplicar isolada.
DROP TRIGGER IF EXISTS trg_avisar_glosa_clickup ON public.fila_autorizacoes;
CREATE TRIGGER trg_avisar_glosa_clickup
  AFTER INSERT OR UPDATE OF status ON public.fila_autorizacoes
  FOR EACH ROW
  WHEN (NEW.status = 'glosa')
  EXECUTE FUNCTION public.avisar_glosa_clickup();

-- Backfill dos avisos que já existem: o id vem da fila, então dá para preencher
-- retroativamente sem inventar nada. Serve ao reteste — reenviar um aviso antigo
-- passa a mostrar o nome de exibição.
UPDATE public.glosa_avisos a
   SET terapia_exibicao_id = f.terapia_exibicao_id
  FROM public.fila_autorizacoes f
 WHERE f.id = a.fila_id
   AND a.terapia_exibicao_id IS NULL
   AND f.terapia_exibicao_id IS NOT NULL;
