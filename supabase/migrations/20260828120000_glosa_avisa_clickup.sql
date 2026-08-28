-- =============================================================================
-- A glosa passa a se anunciar sozinha no ClickUp
-- =============================================================================
-- Hoje, quando a ASSIM recusa uma autorização, a atendente tira um print da tela
-- à mão, cola num canal do ClickUp, escreve o nome do paciente e marca três
-- pessoas. É retrabalho inteiro: o robô JÁ leu do recibo tudo o que ela
-- redigita — guia, data/hora e o motivo — e gravou em fila_autorizacoes com
-- status='glosa' (ver 20260813130000_robo_conclui_glosa.sql). Nenhum dado novo
-- precisa ser coletado; ele só precisa ser entregue.
--
-- E há duas razões para isso não ser só conveniência:
--
--   * A glosa DESAPARECE da /solicitar. Ela é desfecho, então o card sai da tela
--     como sai um concluído (20260813130100_solicitar_reconhece_glosa.sql, que
--     põe mostrar_na_tela = false). Quem não estava olhando na hora não fica
--     sabendo por aquela tela.
--   * A ABA DO RECIBO MORRE em ~30 min, ou antes se o teto de 3 abas estourar
--     (assim.js, `podar`). O print manual é, hoje, o único registro durável
--     daquela tela — e ele depende de alguém apertar Print Screen em tempo.
--
-- ESCALA: são 66 recusas no histórico INTEIRO (medido em 20260820150000). Algumas
-- por semana. Então o desenho aqui otimiza para "não perder o aviso e não avisar
-- errado", nunca para vazão.
--
-- O QUE ESTA MIGRATION NÃO FAZ, DE PROPÓSITO
--
-- Não manda a mensagem. Ela só deposita o FATO numa outbox; quem faz rede é o
-- cron, chamando a Edge Function `glosa-clickup`. O motivo é o caminho de escrita
-- do robô: um net.http_post dentro do trigger penduraria uma chamada de rede na
-- transação que conclui a tarefa da recepcionista. É exatamente o que
-- 20260813130200 recusou fazer em autorizacoes_assim, e vale igual aqui.
--
-- Não anexa print. A API de Chat do ClickUp não aceita imagem: não há campo no
-- request e não existe `attachments` nem no modelo de RESPOSTA dela — não há o
-- que escrever. Anexo na ClickUp existe só para task e custom field. Decisão do
-- usuário (2026-08-28), sabendo disso: mensagem de texto com os dados completos.
-- Como não há print, O ROBÔ NÃO MUDA — nada de publicar versão nova para as 11
-- máquinas, e nenhum dado de paciente sai do sistema como imagem.
--
-- Não notifica de verdade. Menção na API de chat v3 NÃO avisa ninguém:
-- `@[Nome](user:id)` vira um link azul, não popula tagged_users e não dispara
-- notificação (a própria ClickUp lista "true @mentions" como Planned). Quem
-- acompanha o canal vê. A notificação real que já existe é o alerta `assim_glosa`
-- no sino do Pulsar, com prioridade alta e tolerância 0 (20260813130200).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config: o destino, e quem é citado
-- ─────────────────────────────────────────────────────────────────────────────
-- Linha única, no estilo de robo_config (20260813100100) e assim_healthcheck
-- (20260825120000): o que se calibra sem deploy fica em COLUNA, não em constante
-- de código. Aqui isso não é preciosismo — é o que permite a estreia acontecer no
-- chat privado de quem vai conferir o formato e a virada para o canal da equipe
-- ser um UPDATE, sem redeploy da função.
CREATE TABLE IF NOT EXISTS public.glosa_avisos_config (
  id                   int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  ativo                boolean NOT NULL DEFAULT true,

  -- Não são segredo (o token é, e vive nos secrets da Edge Function). Ficam aqui
  -- porque sem eles reconfigurar exigiria redescobrir os ids com um token em mão.
  clickup_workspace_id text,
  clickup_channel_id   text,

  -- Quem é citado, como TEXTO já pronto para entrar na mensagem. Trocar quem
  -- aparece passa a ser um UPDATE. Nota: o @ aqui é decorativo — ver o cabeçalho.
  mencionar            text,

  -- A guarda de retroatividade, em horas. Uma glosa mais velha que isto não
  -- entra na outbox. Existe porque sync_assim_results (o relatório diário)
  -- também carimba status='glosa': sem este teto, a primeira execução dele sobre
  -- o histórico despejaria dezenas de avisos velhos no canal de uma vez.
  janela_horas         int  NOT NULL DEFAULT 24 CHECK (janela_horas BETWEEN 1 AND 720),

  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.glosa_avisos_config IS
  'Destino e texto de menção do aviso de glosa no ClickUp. Linha única. O token NÃO vive aqui: fica nos secrets da Edge Function.';
COMMENT ON COLUMN public.glosa_avisos_config.janela_horas IS
  'Idade máxima de uma glosa para ela virar aviso. Impede que o sync do relatório da ASSIM ressuscite glosas antigas como se fossem novas.';
COMMENT ON COLUMN public.glosa_avisos_config.mencionar IS
  'Texto de menção colado no fim da mensagem. Decorativo: a API de chat v3 do ClickUp não notifica por menção.';

INSERT INTO public.glosa_avisos_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.glosa_avisos_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.glosa_avisos_config FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A outbox
-- ─────────────────────────────────────────────────────────────────────────────
-- Guarda os CAMPOS, nunca a frase montada. A frase é composta no envio, senão uma
-- pendência que sobreviveu a uma falha do ClickUp chegaria escrita pela versão
-- antiga do código — a mesma disciplina de assim_healthcheck.notificacao_pendente.
--
-- Copiar os campos não contradiz isso: o que não pode ser congelado é o TEXTO. Os
-- dados, ao contrário, PRECISAM ser congelados no instante da recusa — a linha da
-- fila é reprocessável (a /autorizacoes devolve para 'pendente' e o robô roda de
-- novo), e aí paciente, guia e motivo daquela recusa mudariam debaixo do aviso.
CREATE TABLE IF NOT EXISTS public.glosa_avisos (
  id                  bigserial PRIMARY KEY,
  fila_id             uuid NOT NULL REFERENCES public.fila_autorizacoes(id) ON DELETE CASCADE,

  -- ── O retrato da recusa ───────────────────────────────────────────────────
  paciente_nome       text,
  motivo              text,          -- status_assim CRU ("1601-REINCIDENCIA NO ATEN")
  guia                text,
  -- ATENÇÃO AO FUSO: horario_autorizacao é hora de PAREDE de São Paulo (vem do
  -- recibo da ASSIM), enquanto created_at/completed_at da mesma tabela são UTC.
  -- Guardado aqui como veio, e a Edge Function o imprime CRU. Converter erraria
  -- em 3h — foi o bug de 20260804040000.
  --
  -- Existe UMA fonte que grava esta coluna em UTC: o fluxo de presença da
  -- /solicitar (page.tsx:1025, `new Date().toISOString()`), que fica 3h à frente
  -- do que o robô grava. Isso NÃO contamina esta outbox — aquele caminho carimba
  -- status='concluido', nunca 'glosa', então não chega ao trigger. Fica anotado
  -- porque quem ler esta coluna em OUTRO contexto precisa saber.
  horario_autorizacao timestamp,
  data_atendimento    date,
  -- O que o TiTa gravou na sessão, cru. Pode ser o nome da AÇÃO em vez do nome de
  -- exibição da terapia ("Aplicador ABA (PS)" em vez de "Psicologia ABA") — é dado
  -- torto no TiTa, não defeito daqui, e foi o que motivou 20260813120000.
  terapia             text,
  -- Guardado para a mensagem poder mostrar TAMBÉM o nome de exibição: o grupo 1
  -- ABA exibe "Psicologia ABA" por regra de negócio, e o id é a chave estável
  -- dessa regra ("toda lógica deve operar por ID, nunca hardcodar nomes").
  terapia_exibicao_id bigint,
  tuss                text,
  matricula           text,          -- já formatada: "000000.0781603.00"
  recepcionista       text,          -- fila.criado_por, que já é o NOME resolvido

  -- ── Estado do envio ───────────────────────────────────────────────────────
  criado_em           timestamptz NOT NULL DEFAULT now(),
  enviado_em          timestamptz,
  tentativas          int NOT NULL DEFAULT 0,
  ultimo_erro         text
);

-- Idempotência: UMA linha por linha de fila.
--
-- Este índice é o coração da migration, porque há DUAS rotas de escrita para
-- status='glosa' e elas atingem a MESMA sessão:
--
--   1. O robô, lendo o recibo — imediato, e com o motivo COMPLETO.
--   2. sync_assim_results, do relatório diário — horas depois, e com o motivo
--      TRUNCADO em 25 caracteres pela ASSIM (20260528120000:43-46).
--
-- Sem o unique, a mesma glosa seria anunciada duas vezes, a segunda com o texto
-- pior. Com ele, o primeiro a chegar (o robô, com o texto bom) ganha e o
-- relatório não duplica. Mesmo espírito de uq_alertas_fingerprint_aberto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_glosa_avisos_fila
  ON public.glosa_avisos (fila_id);

-- Único índice de consulta: a fila de envio da Edge Function. Parcial, porque
-- linha já enviada nunca é lida de novo — e o projeto tem histórico de aperto de
-- Disk IO Budget, então índice sem consulta é custo puro.
CREATE INDEX IF NOT EXISTS idx_glosa_avisos_pendentes
  ON public.glosa_avisos (criado_em)
  WHERE enviado_em IS NULL;

COMMENT ON TABLE public.glosa_avisos IS
  'Outbox dos avisos de glosa para o ClickUp. Uma linha por fila_id. Escrita pelo trigger trg_avisar_glosa_clickup; lida e marcada pela Edge Function glosa-clickup.';
COMMENT ON COLUMN public.glosa_avisos.enviado_em IS
  'Preenchido SÓ depois do 201 do ClickUp. Nulo = ainda pendente, e a execução seguinte do cron reenvia: o aviso atrasa, não se perde.';
COMMENT ON COLUMN public.glosa_avisos.horario_autorizacao IS
  'Hora de parede de São Paulo, como a ASSIM imprime no recibo. NÃO converter na leitura.';

ALTER TABLE public.glosa_avisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.glosa_avisos FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O trigger
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma forma de trg_aprender_codigo_glosa (20260820150000), que já roda sobre
-- esta tabela com esta mesma condição. Inclusive a blindagem, que é o ponto mais
-- importante deste bloco:
--
--   AVISAR NO CLICKUP JAMAIS PODE DERRUBAR A CONCLUSÃO DE UMA TAREFA DO ROBÔ.
--
-- Toda exceção é engolida e o UPDATE segue. A linha da fila é o dado que importa;
-- o aviso é conveniência. Um erro aqui — config ausente, coluna que mudou de
-- nome, o que for — não pode fazer robo_concluir_tarefa falhar e a recepcionista
-- ficar com a tarefa travada na tela.
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
    -- De propósito: ver o comentário do cabeçalho deste bloco.
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.avisar_glosa_clickup() IS
  'Deposita na outbox glosa_avisos o retrato de uma recusa da ASSIM. Engole qualquer erro: avisar não pode derrubar a conclusão da tarefa do robô.';

DROP TRIGGER IF EXISTS trg_avisar_glosa_clickup ON public.fila_autorizacoes;
CREATE TRIGGER trg_avisar_glosa_clickup
  AFTER INSERT OR UPDATE OF status ON public.fila_autorizacoes
  FOR EACH ROW
  WHEN (NEW.status = 'glosa')
  EXECUTE FUNCTION public.avisar_glosa_clickup();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O disparo
-- ─────────────────────────────────────────────────────────────────────────────
-- O guard de segredo ausente é o ponto principal, e é a lição de 20260814100000
-- repetida em 20260825120000: sem ele, 'Bearer ' || NULL vira NULL, o header sai
-- nulo, a Edge Function responde 401 e o pg_cron marca o job como SUCESSO. Um
-- aviso que falha em silêncio é pior que aviso nenhum.
CREATE OR REPLACE FUNCTION public.fn_glosa_avisos_disparar()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/glosa-clickup';
  _token text;
  _n     int;
BEGIN
  -- Sem nada pendente, não acorda a Edge Function. A */5 bate ~150 vezes por
  -- semana e as glosas são algumas — o normal é não haver o que enviar.
  SELECT count(*) INTO _n FROM public.glosa_avisos WHERE enviado_em IS NULL;
  IF _n = 0 THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_glosa_avisos_disparar: segredo cron_service_role_key ausente no Vault';
  END IF;

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type',  'application/json'
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;

COMMENT ON FUNCTION public.fn_glosa_avisos_disparar() IS
  'Invoca a Edge Function glosa-clickup quando há aviso pendente, com a chave do Vault. Agendada em glosa-avisa-clickup.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Agendamento
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('glosa-avisa-clickup');
EXCEPTION WHEN OTHERS THEN NULL;  -- não existia ainda
END;
$$;

-- Cron do Supabase roda em UTC. 10-22 UTC = 07:00-19:55 em São Paulo (o Brasil
-- não tem mais horário de verão, então o offset é fixo em -3 e a janela não
-- escorrega duas vezes por ano). Seg-sex, que é quando a clínica atende e quando
-- alguém está no canal para ler.
--
-- A cada 5 min é o compromisso entre "a recepção sabe rápido" e não bater no
-- ClickUp sem motivo — e o guard de pendência zero acima faz a maioria dessas
-- batidas custar uma contagem, sem chamada de rede.
SELECT cron.schedule(
  'glosa-avisa-clickup',
  '*/5 10-22 * * 1-5',
  $cron$SELECT public.fn_glosa_avisos_disparar()$cron$
);
