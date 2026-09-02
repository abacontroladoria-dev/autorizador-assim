-- =============================================================================
-- A inclusão de terapia se anuncia sozinha ao cronograma
-- =============================================================================
-- Quando o terapêutico implanta uma terapia nova em /cronograma/ocupacao-paciente,
-- ele precisa HOJE lembrar de preencher um formulário no ClickUp
-- (forms.clickup.com/9011600909/f/8cj47gd-10171/...) que gera um card na lista
-- PACIENTES. É esse card que avisa o setor de CRONOGRAMA de que existe terapia
-- nova, para ele fazer os trâmites administrativos junto ao convênio — cadastro,
-- contrato, guia, ficha —, tudo fora do Pulsar.
--
-- Em 09/2026 alguém esqueceu de preencher e uma sessão foi glosada.
--
-- O DIAGNÓSTICO, QUE DESCARTA A SOLUÇÃO ÓBVIA
--
-- Vale registrar o que NÃO falhou, porque o instinto leva ao lugar errado:
--
--   * A sessão APARECEU na /solicitar.
--   * A recepção PEDIU a autorização.
--   * O plano glosou assim mesmo, porque o cronograma não tinha feito os
--     trâmites — não sabia da inclusão.
--
-- Ou seja: não é falha de detecção nem de solicitação, é falha de NOTIFICAÇÃO
-- ENTRE SETORES. O sistema já tem um aparato inteiro para "sessão sem
-- autorização" (a regra assim_sem_desfecho de 20260730100200, as guias órfãs de
-- get_guias_orfas, a auditoria ASSIM) e NADA DISSO teria disparado, porque a
-- definição de concluído daquela regra é `guia válida ∪ falta ∪ cancelamento` e
-- houve pedido com guia. O elo que falta é estreito: o ato de implantar não
-- avisa ninguém.
--
-- POR QUE NÃO EXISTE TRIGGER AQUI, AO CONTRÁRIO DA GLOSA
--
-- Esta migration é irmã de 20260828120000_glosa_avisa_clickup.sql e reaproveita
-- o desenho dela inteiro — menos o gatilho. Lá o fato nasce em fila_autorizacoes
-- e um trigger o captura. Aqui NÃO HÁ o que capturar: a implantação não passa
-- pelo Postgres. A rota /api/tita/confirmar-agendamento escreve direto na API
-- externa da TiTa; csv_grades_profissionais e agenda_tita são somente leitura
-- nesse caminho e só refletem a sessão nova depois do job sync_tita_grade, horas
-- depois. Quem deposita na outbox é a PRÓPRIA ROTA, com o service client.
--
-- O QUE ESTA MIGRATION NÃO FAZ, DE PROPÓSITO
--
-- Não manda nada. Ela só cria o depósito. Quem faz rede é o cron, chamando a
-- Edge Function `inclusao-terapia-clickup` — mesma razão de 20260828120000: uma
-- chamada de rede pendurada no caminho de escrita faria o usuário esperar o
-- ClickUp para ver o resultado da implantação.
--
-- Não rastreia conclusão. Os trâmites acontecem fora do Pulsar e o cronograma
-- fecha o card no ClickUp (decisão do usuário, 2026-09-02). Espelhar "já foi
-- tratado" de volta exigiria webhook e um segundo estado a manter sincronizado,
-- sem ninguém para consumi-lo.
--
-- Não desativa o formulário. Ele é o "Formulário de Pacientes", genérico para
-- alteração de cronograma: cobre também alta, desligamento, troca de
-- profissional e retirada de atendimento. A automação cobre UM ramo — o da
-- inclusão, o único que nasce de um ato rastreável. O form deixa de ser
-- necessário PARA INCLUSÃO, e segue existindo para o resto.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config: o destino e o de-para dos dropdowns
-- ─────────────────────────────────────────────────────────────────────────────
-- Linha única, no estilo de glosa_avisos_config e assim_healthcheck: o que se
-- calibra sem deploy fica em COLUNA, não em constante de código. Aqui isso não é
-- preciosismo — é o que permite a estreia acontecer numa lista de teste e a
-- virada para a PACIENTES ser um UPDATE.
CREATE TABLE IF NOT EXISTS public.inclusoes_terapia_config (
  id                   int PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  ativo                boolean NOT NULL DEFAULT false,

  -- Não são segredo (o token é, e vive nos secrets da Edge Function). Ficam aqui
  -- porque sem eles reconfigurar exigiria redescobrir os ids com um token em mão.
  clickup_workspace_id text,
  clickup_list_id      text,

  -- O de-para campo -> uuid, e para dropdown também valor -> uuid da opção.
  -- Precisa ser DADO, não código: a API do ClickUp exige o UUID da opção (o
  -- texto não é aceito), e esses uuids mudam se alguém recriar um campo. Com
  -- isso em coluna, ganhar uma unidade nova é um UPDATE.
  -- Forma esperada (ver supabase/snippets/20260902_inclusao_terapia_clickup_config.sql):
  --   { "unidade": { "field_id": "...", "opcoes": { "Realengo": "uuid", ... } },
  --     "motivo":  { "field_id": "...", "valor": "uuid" }, ... }
  campos               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Guarda de retroatividade, em horas, gêmea da de glosa_avisos_config: uma
  -- linha mais velha que isto não vira card. Existe para o caso de a outbox
  -- ficar parada (ClickUp fora do ar, config desligada) e alguém religar dias
  -- depois — sem o teto, o setor receberia de uma vez um monte de card sobre
  -- inclusões que já foram resolvidas na mão.
  janela_horas         int NOT NULL DEFAULT 72 CHECK (janela_horas BETWEEN 1 AND 720),

  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inclusoes_terapia_config IS
  'Destino e de-para dos campos do card de inclusão de terapia no ClickUp. Linha única. O token NÃO vive aqui: fica nos secrets da Edge Function.';
COMMENT ON COLUMN public.inclusoes_terapia_config.ativo IS
  'Nasce FALSE de propósito: a migration pode ser aplicada sem que nenhum card seja criado, e a estreia é um UPDATE deliberado depois de conferir o de-para.';
COMMENT ON COLUMN public.inclusoes_terapia_config.campos IS
  'De-para campo->uuid e, em dropdown, valor->uuid da opção. A API do ClickUp exige o UUID da opção; o texto não é aceito.';
COMMENT ON COLUMN public.inclusoes_terapia_config.janela_horas IS
  'Idade máxima de uma linha para ela virar card. Impede que religar a automação depois de uma parada despeje inclusões já tratadas na mão.';

INSERT INTO public.inclusoes_terapia_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.inclusoes_terapia_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inclusoes_terapia_config FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A outbox
-- ─────────────────────────────────────────────────────────────────────────────
-- Guarda os CAMPOS, nunca a frase — mesma disciplina de glosa_avisos e de
-- assim_healthcheck.notificacao_pendente. Uma linha que sobreviveu a uma falha
-- do ClickUp é reenviada pela execução seguinte; se o texto estivesse gravado,
-- ele chegaria escrito pela versão antiga do código.
--
-- UMA LINHA POR IMPLANTAÇÃO, NÃO POR SESSÃO (decisão do usuário, 2026-09-02).
-- Um paciente que ganha Fono e T.O. no mesmo ato gera UM card listando as duas:
-- o cronograma trata o paciente de uma vez, e a lista PACIENTES não vira mural.
-- É por isso que as sessões vivem num jsonb em vez de virarem linhas.
CREATE TABLE IF NOT EXISTS public.inclusoes_terapia (
  id                   bigserial PRIMARY KEY,

  -- ── A chave de dedup ──────────────────────────────────────────────────────
  -- Hash determinístico do conjunto ORDENADO de csv_grade_id do bundle, montado
  -- no servidor. Ver o índice único abaixo, que explica por que não pode ser
  -- timestamp nem o id do bundle do cliente.
  bundle_id            text NOT NULL,

  -- ── Quem ──────────────────────────────────────────────────────────────────
  paciente_nome        text NOT NULL,
  -- id_favorecido do paciente na TiTa. Guardado como text porque é assim que
  -- fila_autorizacoes.paciente_id o guarda, e ter os dois no mesmo tipo evita o
  -- cast que hoje inutiliza índice em 25 lugares (reference_cast_paciente_id_fila).
  paciente_id          text,
  convenio_nome        text,
  unidade_nome         text,

  -- ── O que foi incluído ────────────────────────────────────────────────────
  -- Array de objetos, um por sessão implantada:
  --   { csv_grade_id, terapia_nome, terapia_exibicao_id, profissional_nome,
  --     dia_semana, hora_inicial, data_inicial, sala_nome,
  --     id_agenda_fav, status_criacao, criadas, conflitos }
  --
  -- Só entram as sessões que a TiTa ACEITOU. Quando a criação é parcial
  -- (partial_success), as que caíram em conflito ficam de fora e a contagem
  -- abaixo registra quantas foram — senão o cronograma faria trâmite para
  -- sessão que não existe.
  sessoes              jsonb NOT NULL,
  sessoes_nao_criadas  int NOT NULL DEFAULT 0,

  -- A menor data_inicial do bundle: é a "Data de Início da Vigência" do
  -- formulário. Date, não timestamp — o campo do form é de data.
  -- ATENÇÃO na Edge Function: o ClickUp quer Unix em MILISSEGUNDOS; em segundos
  -- ele põe a task em 1970 sem erro nenhum.
  data_inicial         date,

  -- ── Quem implantou ────────────────────────────────────────────────────────
  -- Do usuário autenticado NO SERVIDOR (fonte confiável), não do cliente — é a
  -- mesma escolha que a rota já faz para carimbar autoria no bundle.
  implantado_por       uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  implantado_por_nome  text,
  implantado_por_email text,
  -- 'aumentar' (Aumentar Cronograma) | 'novo' (Criar Novo Cronograma). Enviada
  -- EXPLÍCITA pelo cliente: seria inferível por idFavorecidoFallback, mas isso é
  -- efeito colateral de outra decisão e mentiria calado se aquele campo mudasse.
  modalidade           text CHECK (modalidade IS NULL OR modalidade IN ('aumentar', 'novo')),

  -- ── Estado do envio ───────────────────────────────────────────────────────
  criado_em            timestamptz NOT NULL DEFAULT now(),
  enviado_em           timestamptz,
  tentativas           int NOT NULL DEFAULT 0,
  ultimo_erro          text,
  clickup_task_id      text,
  clickup_task_url     text
);

-- Idempotência: UMA linha por implantação.
--
-- A chave é o hash do conjunto ordenado de csv_grade_id, e a escolha importa:
--
--   * NÃO pode ser timestamp nem o id do bundle do cliente (OcupPacMode monta
--     `${Date.now()}_${pac}`) — timestamp derrota a própria dedup, porque um
--     retry gera um valor novo e o card duplica.
--   * PODE ser o conjunto de slots porque ele é o que a implantação de fato é:
--     um duplo-clique ou um retry de rede reenvia exatamente o mesmo conjunto e
--     colide; duas implantações genuinamente diferentes têm conjuntos
--     diferentes e não colidem.
--
-- Unique TOTAL, não parcial (ao contrário de uq_alertas_fingerprint_aberto):
-- aqui não existe "reabertura". Uma inclusão acontece uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inclusoes_terapia_bundle
  ON public.inclusoes_terapia (bundle_id);

-- Único índice de consulta: a fila de envio da Edge Function. Parcial, porque
-- linha já enviada nunca é lida de novo — e este projeto tem histórico de aperto
-- de Disk IO Budget, então índice sem consulta é custo puro.
CREATE INDEX IF NOT EXISTS idx_inclusoes_terapia_pendentes
  ON public.inclusoes_terapia (criado_em)
  WHERE enviado_em IS NULL;

COMMENT ON TABLE public.inclusoes_terapia IS
  'Outbox dos cards de inclusão de terapia no ClickUp. Uma linha por implantação (não por sessão). Escrita pela rota /api/tita/confirmar-agendamento; lida e marcada pela Edge Function inclusao-terapia-clickup.';
COMMENT ON COLUMN public.inclusoes_terapia.bundle_id IS
  'Hash do conjunto ordenado de csv_grade_id da implantação. Determinístico de propósito: é o que faz um retry colidir em vez de duplicar o card.';
COMMENT ON COLUMN public.inclusoes_terapia.sessoes IS
  'Só as sessões que a TiTa aceitou. As que caíram em conflito ficam fora e são contadas em sessoes_nao_criadas.';
COMMENT ON COLUMN public.inclusoes_terapia.enviado_em IS
  'Preenchido SÓ depois do 2xx do ClickUp. Nulo = ainda pendente, e a execução seguinte reenvia: o card atrasa, não se perde.';
COMMENT ON COLUMN public.inclusoes_terapia.data_inicial IS
  'Menor data_inicial do bundle — a "Data de Início da Vigência" do formulário. O ClickUp exige Unix em MILISSEGUNDOS; converter na Edge Function.';

ALTER TABLE public.inclusoes_terapia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inclusoes_terapia FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O disparo
-- ─────────────────────────────────────────────────────────────────────────────
-- O guard de segredo ausente é o ponto principal, e é a lição de 20260814100000
-- repetida em 20260825120000 e 20260828120000: sem ele, 'Bearer ' || NULL vira
-- NULL, o header sai nulo, a Edge Function responde 401 e o pg_cron marca o job
-- como SUCESSO. Um aviso que falha em silêncio é pior que aviso nenhum.
CREATE OR REPLACE FUNCTION public.fn_inclusoes_terapia_disparar()
RETURNS void
LANGUAGE plpgsql
-- Declarado DENTRO da função: posto por ALTER FUNCTION ele morreria calado no
-- próximo CREATE OR REPLACE (reference_create_or_replace_perde_proconfig).
SET search_path = public, pg_temp
AS $$
DECLARE
  _url   text := 'https://wmugemamnqxjfpxrlwes.supabase.co/functions/v1/inclusao-terapia-clickup';
  _token text;
  _n     int;
BEGIN
  -- Sem nada pendente, não acorda a Edge Function. A maioria das batidas do cron
  -- custa uma contagem, sem chamada de rede.
  SELECT count(*) INTO _n FROM public.inclusoes_terapia WHERE enviado_em IS NULL;
  IF _n = 0 THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key';
  IF _token IS NULL THEN
    RAISE EXCEPTION 'fn_inclusoes_terapia_disparar: segredo cron_service_role_key ausente no Vault';
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

COMMENT ON FUNCTION public.fn_inclusoes_terapia_disparar() IS
  'Invoca a Edge Function inclusao-terapia-clickup quando há card pendente, com a chave do Vault. Agendada em inclusao-terapia-clickup.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Agendamento
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('inclusao-terapia-clickup');
EXCEPTION WHEN OTHERS THEN NULL;  -- não existia ainda
END;
$$;

-- Cron do Supabase roda em UTC. 10-22 UTC = 07:00-19:55 em São Paulo (o Brasil
-- não tem mais horário de verão, então o offset é fixo em -3 e a janela não
-- escorrega duas vezes por ano). Seg-sex, que é quando o cronograma trabalha.
--
-- A cada 5 min, como as irmãs: o compromisso entre o cronograma saber rápido e
-- não bater no ClickUp sem motivo — e o guard de pendência zero acima faz a
-- maioria dessas batidas não custar rede nenhuma.
--
-- A implantação acontece em horário comercial, então uma linha depositada fora
-- da janela espera a manhã seguinte. É aceitável: os trâmites são
-- administrativos e ninguém os faria de madrugada.
SELECT cron.schedule(
  'inclusao-terapia-clickup',
  '*/5 10-22 * * 1-5',
  $cron$SELECT public.fn_inclusoes_terapia_disparar()$cron$
);
