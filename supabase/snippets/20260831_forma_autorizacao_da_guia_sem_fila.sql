-- ===========================================================================
-- A forma de validação da guia que não tem linha na fila
-- ===========================================================================
--
-- SINTOMA
-- Na Central de Pacientes, Clarisse Dos Santos Marques 31/08 13:00 (Aplicador
-- ABA (PS), guia 475629) aparecia com forma de autorização 'automatico',
-- enquanto as outras três sessões da MESMA paciente no MESMO dia mostravam
-- 'QR Code' e 'Erro no Reconhecimento Facial'. A atendente leu isso como dado
-- faltando e ia buscar à mão no portal da ASSIM.
--
-- O dado NUNCA faltou. Em autorizacoes_assim a linha da guia 475629 traz
-- biofacial = '9-FACIAL', que é exatamente o que
-- forma_validacao_do_biofacial() mapeia para 'Biometria' (verificado contra a
-- função em produção: devolve 'Biometria').
--
-- A CAUSA
-- Esta sessão cai na Parte 2 das leituras da Central — o ramo das autorizações
-- que existem na ASSIM e NÃO têm linha em fila_autorizacoes (guia tirada fora
-- do robô, sem modal, portanto sem ninguém para responder a forma).
--
-- Nesse ramo a CTE `guias_sem_fila` é `SELECT aa.*` sobre autorizacoes_assim:
-- `g.biofacial` e `g.teve_token` estão em mãos, na mesma linha de onde já saem
-- `g.guia` e `g.data_autorizacao`. E a projeção, ao lado disso, escrevia
--
--     'automatico'::text AS forma_autorizacao
--
-- um literal chumbado, ignorando as duas colunas. Não é "sem informação": é a
-- informação disponível, descartada na projeção.
--
-- É O MESMO BUG QUE 20260827000001 JÁ CORRIGIU NA AUDITORIA
-- Aquela migration descreve a mesma falha ("a CTE `autorizacoes` nunca
-- carregava `aa.biofacial`, então o dado existia em autorizacoes_assim e não
-- chegava à tela") e cita esta view como tendo "JÁ resolvido isto" com o
-- 'automatico'. Não resolveu — 'automatico' é marca-lugar, não rótulo. A
-- Central ficou com a mesma lacuna, só que disfarçada por uma palavra.
--
-- POR QUE 'automatico' É PIOR QUE NULL AQUI
-- 'automatico' não pertence ao vocabulário de OPCOES_VALIDACAO (QR Code,
-- Biometria, Token, Erro no Reconhecimento Facial...). Ele entra no filtro
-- "Forma" da Central como se fosse uma forma de validação de verdade, e sugere
-- que o sistema validou algo automaticamente — quando o fato é o oposto:
-- ninguém registrou nada no Pulsar, e a ASSIM registrou.
--
-- O QUE MUDA
-- Nos DOIS pontos (a view e a RPC), troca o literal por:
--
--     COALESCE(public.forma_validacao_do_biofacial(g.biofacial, g.teve_token),
--              'Sem registro no Pulsar')
--
-- O COALESCE é obrigatório e não é defensivo por hábito: o de-para devolve NULL
-- de propósito para código desconhecido (4, 5, 6, 7 e qualquer coisa nova) —
-- ele nunca chuta. Sem o COALESCE, código novo voltaria a sumir da tela, que é
-- justamente o sintoma que estamos corrigindo.
--
-- O texto do fallback diz a verdade que 'automatico' escondia: a guia é real e
-- veio da ASSIM; o que não existe é registro de COMO a presença foi validada.
--
-- GRANT: nada a fazer. As duas leituras são SECURITY INVOKER, e
-- 20260827000001:108-109 já concedeu EXECUTE de forma_validacao_do_biofacial a
-- anon e authenticated (exatamente para um COALESCE como este não derrubar a
-- tela com 42501). Verificado: a função responde por PostgREST.
--
-- ESCOPO: só o ramo "guia sem fila". A Parte 1 (sessões com linha na fila) não
-- é tocada — lá `forma_autorizacao` é coluna real, escrita pelo modal ou pelo
-- sync, e continua mandando.
--
-- ORDEM: recria as duas leituras A PARTIR DE 20260825130000 (autorizações
-- avulsas: o `fa.avulsa = false` no NOT EXISTS de `slots_sem_fila`). Aquela
-- precisa estar aplicada antes, senão isto a desfaz.
--
-- A VIEW É O CONTRATO DA RPC: listar_central_pacientes é
-- `RETURNS SETOF public.vw_central_pacientes` (20260825130000:523), ou seja o
-- tipo de linha da view É a assinatura de saída da RPC. Por isso a substituição
-- preserva NOME, POSIÇÃO e TIPO da coluna — só troca a expressão que a produz
-- (text -> text, mesmo lugar na lista). Se o tipo mudasse, o CREATE OR REPLACE
-- VIEW falharia com "cannot change data type of view column", e a RPC
-- quebraria junto. É também por isso que a view vem ANTES da função no bloco
-- abaixo: a função é recriada já contra o tipo novo.
--
-- COMO VALIDAR (antes e depois)
--
--   -- 1. o caso relatado: deve sair 'Biometria', não 'automatico'
--   SELECT paciente_nome, horario, numero_autorizacao, forma_autorizacao
--   FROM public.listar_central_pacientes('2026-08-31')
--   WHERE paciente_nome ILIKE 'Clarisse%' ORDER BY horario;
--
--   -- 2. ninguém mais deve responder 'automatico' em nenhuma data
--   SELECT forma_autorizacao, count(*)
--   FROM public.listar_central_pacientes('2026-08-31')
--   GROUP BY 1 ORDER BY 2 DESC;
--
--   -- 3. quanto o de-para não cobre (fallback legítimo): olhar os biofacial
--   --    crus que caíram em 'Sem registro no Pulsar' e ver se apareceu código
--   --    novo na ASSIM — se sim, estender forma_validacao_do_biofacial.
--   SELECT DISTINCT aa.biofacial
--   FROM public.autorizacoes_assim aa
--   WHERE aa.data_execucao::date = '2026-08-31'
--     AND public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token) IS NULL
--     AND aa.biofacial IS NOT NULL;
--
-- NADA AQUI FOI APLICADO EM PRODUÇÃO.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda: se o de-para não estiver lá, pare antes de mexer nas leituras.
-- ---------------------------------------------------------------------------
DO $guard$
BEGIN
  IF to_regprocedure('public.forma_validacao_do_biofacial(text, boolean)') IS NULL THEN
    RAISE EXCEPTION
      'forma_validacao_do_biofacial(text,boolean) nao existe: aplique '
      '20260821080000_forma_autorizacao_do_relatorio.sql antes deste snippet.';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1. vw_central_pacientes  (ramo guias_sem_fila)
-- 2. listar_central_pacientes(date)  (Parte 2)
--
-- Os dois corpos são longos e idênticos ao de 20260825130000 exceto por UMA
-- linha cada. Em vez de colar 600 linhas e arriscar uma divergência silenciosa
-- entre a cópia e o original, o patch abaixo reescreve só a linha do literal,
-- a partir da definição VIVA no catálogo.
--
-- Por que isto é seguro: o alvo ocorre exatamente uma vez em cada objeto, e o
-- DO verifica a contagem antes de aplicar. Se a definição em produção divergir
-- do esperado, ele levanta exceção e o BEGIN/COMMIT desfaz — nunca aplica um
-- replace parcial.
-- ---------------------------------------------------------------------------
-- NOTA SOBRE A BUSCA (aprendido na primeira tentativa, que abortou com
-- "encontrei 0"): NÃO se procura o literal copiado do arquivo de migration.
-- `pg_get_viewdef` devolve a definição REIMPRESSA pelo parser, não o texto que
-- foi digitado — o espaçamento de alinhamento (`'automatico'::text        AS`)
-- é reduzido a um espaço, e o parser pode ainda escrever a expressão como
-- ('automatico'::text) ou omitir o ::text redundante. Casar string exata contra
-- uma definição reimpressa é frágil por construção.
--
-- Por isso o alvo é uma REGEX ancorada nas duas únicas coisas estáveis: o
-- literal 'automatico' e o alias forma_autorizacao, com espaço livre entre eles.
DO $patch$
DECLARE
  -- Parênteses e ::text opcionais; \s+ tolera qualquer espaçamento ou quebra de
  -- linha entre o literal e o alias. Flag 'i' porque o corpo da RPC não é
  -- reimpresso e pode ter sido digitado com `as` minúsculo.
  -- Não casa com a coluna real `fa.forma_autorizacao` da Parte 1: o alvo exige o
  -- literal 'automatico' imediatamente antes do AS. (Testado nas 6 variantes.)
  v_alvo  text := '\(?''automatico''(::text)?\)?\s+AS\s+forma_autorizacao';
  v_novo  text := 'COALESCE(public.forma_validacao_do_biofacial(g.biofacial, g.teve_token), ''Sem registro no Pulsar''::text) AS forma_autorizacao';
  v_def   text;
  v_ocor  int;
BEGIN
  -- ── a view ────────────────────────────────────────────────────────────────
  v_def  := pg_get_viewdef('public.vw_central_pacientes'::regclass, true);
  v_ocor := (SELECT count(*) FROM regexp_matches(v_def, v_alvo, 'gi'));

  IF v_ocor <> 1 THEN
    RAISE EXCEPTION
      'vw_central_pacientes: esperava 1 ocorrencia de ''automatico'' AS '
      'forma_autorizacao, encontrei %. Inspecione com: SELECT '
      'pg_get_viewdef(''public.vw_central_pacientes''::regclass, true);', v_ocor;
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.vw_central_pacientes AS '
       || regexp_replace(v_def, v_alvo, v_novo, 'gi');

  -- ── a RPC ─────────────────────────────────────────────────────────────────
  -- CUIDADO (reference_create_or_replace_perde_proconfig): pg_get_functiondef
  -- devolve a definicao COMPLETA, com o SET search_path e o SECURITY de origem,
  -- então recriar por ela preserva o proconfig. Não montar o CREATE à mão aqui.
  --
  -- Aqui o corpo NÃO é reimpresso (fica como foi digitado, dentro do $$), então
  -- o espaçamento original sobrevive — mas a mesma regex serve para os dois
  -- casos, e é isso que faz este bloco não depender de qual dos dois é.
  v_def  := pg_get_functiondef('public.listar_central_pacientes(date)'::regprocedure);
  v_ocor := (SELECT count(*) FROM regexp_matches(v_def, v_alvo, 'gi'));

  IF v_ocor <> 1 THEN
    RAISE EXCEPTION
      'listar_central_pacientes(date): esperava 1 ocorrencia de ''automatico'' '
      'AS forma_autorizacao, encontrei %. Inspecione com: SELECT '
      'pg_get_functiondef(''public.listar_central_pacientes(date)''::regprocedure);',
      v_ocor;
  END IF;

  EXECUTE regexp_replace(v_def, v_alvo, v_novo, 'gi');
END
$patch$;

-- ---------------------------------------------------------------------------
-- Prova, dentro da própria transação: o caso relatado tem de sair 'Biometria'.
--
-- 'Biometria' e não 'Biometria Facial' de propósito: o rótulo mais claro que o
-- operador vê na tela é um de-para de EXIBIÇÃO no frontend
-- (components/auditoria-assim/formaValidacao.ts -> rotuloForma). O banco segue
-- gravando e devolvendo o vocabulário de OPCOES_VALIDACAO, que é o que as
-- 4.264 linhas já existentes dizem e o que o SQL casa por texto.
-- Se não sair, o COMMIT não acontece.
-- ---------------------------------------------------------------------------
DO $prova$
DECLARE
  v_forma text;
BEGIN
  SELECT forma_autorizacao INTO v_forma
  FROM public.listar_central_pacientes('2026-08-31')
  WHERE paciente_nome ILIKE 'Clarisse Dos Santos%'
    AND horario = '13:00:00';

  IF v_forma IS DISTINCT FROM 'Biometria' THEN
    RAISE EXCEPTION
      'Prova falhou: Clarisse 31/08 13:00 devolveu % (esperado ''Biometria'', '
      'de biofacial ''9-FACIAL''). Rollback.', coalesce(v_forma, 'NULL');
  END IF;

  RAISE NOTICE 'OK: Clarisse 31/08 13:00 -> %', v_forma;
END
$prova$;

COMMIT;
