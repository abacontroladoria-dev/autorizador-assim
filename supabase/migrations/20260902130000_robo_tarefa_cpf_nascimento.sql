-- O robô passa a receber CPF e data de nascimento da tarefa.
--
-- POR QUE
-- A ASSIM abre `#checkBday` ("Confirme os dados abaixo") pedindo NASCIMENTO + CPF
-- quando o credenciado não tem dispositivo Intelbras — o caso desta clínica. Até
-- agora quem digitava era a recepção: o robô esperava e saía da frente
-- (rpa.js:150-152). Passa a preencher sozinho, e para isso precisa dos dois campos
-- na tarefa.
--
-- POR QUE NÃO CRIAR COLUNA EM `fila_autorizacoes`
-- Seria dado duplicado mais backfill, e a fila já tem centenas de milhares de
-- linhas. As duas fontes existentes cobrem tudo, então aqui é lookup, não coluna.
-- (Nota de arqueologia: `autorizacoes.service.ts` MANDA `cpf`/`data_nascimento` no
-- insert e carrega um retry que os remove quando o PostgREST reclama. As colunas
-- nunca existiram; aquele retry dispara em toda inserção. Não é consertado aqui —
-- este arquivo não toca no frontend.)
--
-- A ORDEM DAS FONTES, E POR QUE
--   1. `pacientes`                 cadastro canônico. É quem corrige o drift de
--                                  cpf/nascimento, e seu backfill só grava CPF
--                                  quando sobram exatamente 11 dígitos. Quando
--                                  existe, é o dado certo. Cobre 563 de 583.
--   2. `agenda_tita_autorizacao`   cobertura total (62.669 linhas, zero nulos) e é
--                                  a MESMA fonte que o card da /solicitar exibe.
--                                  Cobre os 20 pacientes sem CPF no cadastro.
--
-- A agenda congela o dado por data de atendimento: correção de cadastro feita hoje
-- não reescreve linha antiga. Por isso o canônico vem primeiro e a agenda é a rede.
-- Autorização avulsa não tem linha na agenda e cai no ramo 1; se o paciente também
-- não estiver no cadastro, volta NULL — e NULL é o sinal de "não digite nada, deixe
-- para o humano", que é o comportamento de hoje.
--
-- NULL, NUNCA STRING VAZIA
-- `NULLIF(...,'')` no fim do CPF. String vazia passaria pelo teste de "tem dado?"
-- no robô e ele digitaria nada num campo que a ASSIM valida — meio CPF é pior que
-- nenhum, porque aciona `limpa_carteira()` e apaga a carteirinha.

CREATE OR REPLACE FUNCTION public.robo_buscar_tarefa(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- Redeclarado de propósito: CREATE OR REPLACE descarta o `proconfig`, então um
-- `SET search_path` posto por ALTER FUNCTION morreria calado aqui. Numa função
-- SECURITY DEFINER isso não é estilo, é privilégio.
SET search_path = public
AS $$
DECLARE
  v_machine_id text := public.robo_autenticar(p_token);
  v_tarefa     jsonb;
  v_paciente   bigint;
  v_cpf        text;
  v_nasc       date;
BEGIN
  -- Máquina pausada pelo painel não recebe trabalho.
  IF NOT EXISTS (SELECT 1 FROM public.maquinas WHERE id = v_machine_id AND ativa) THEN
    RETURN NULL;
  END IF;

  UPDATE public.fila_autorizacoes f
     SET status     = 'processando',
         started_at = now(),
         updated_at = now()
   WHERE f.id = (
           SELECT c.id
             FROM public.fila_autorizacoes c
            WHERE c.status = 'pendente'
              AND c.machine_id = v_machine_id
            ORDER BY c.created_at ASC NULLS LAST, c.id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
  RETURNING jsonb_build_object(
    'id',               f.id,
    'paciente_nome',    f.paciente_nome,
    'data_atendimento', f.data_atendimento,
    'horario',          f.horario,
    'empresa',          f.empresa,
    'matricula',        f.matricula,
    'dep',              f.dep,
    'crm',              f.crm,
    'crm_uf',           f.crm_uf,
    'nome_medico',      f.nome_medico,
    'tuss',             f.tuss
  ),
  -- Guardado à parte porque o lookup abaixo não caberia no RETURNING sem
  -- transformar um probe por chave única em subquery correlacionada.
  -- `paciente_id` é TEXT nesta tabela; o `~ '^\d+$'` existe porque um `::bigint`
  -- em valor não numérico levantaria exceção DEPOIS de a linha já ter virado
  -- 'processando' — a tarefa morreria com 500 e ficaria travada nesse estado,
  -- calada, que é a forma de fila envenenada que este banco já viu.
  CASE WHEN f.paciente_id ~ '^\d+$' THEN f.paciente_id::bigint END
  INTO v_tarefa, v_paciente;

  IF v_tarefa IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_paciente IS NOT NULL THEN
    -- 1. Cadastro canônico. O cast vai no lado da FILA de propósito, ao contrário
    --    da regra geral de não castar `fila_autorizacoes.paciente_id`: ali o
    --    problema é JOIN, onde castar a coluna da fila cega os índices dela. Aqui
    --    a linha da fila já está identificada e travada, e o índice que precisa
    --    servir é `pacientes_tita_paciente_id_key`.
    SELECT p.cpf, p.data_nascimento
      INTO v_cpf, v_nasc
      FROM public.pacientes p
     WHERE p.tita_paciente_id = v_paciente;

    -- 2. A agenda como rede, campo por campo — não o registro inteiro. Um paciente
    --    pode ter nascimento no cadastro e CPF só na agenda; pegar "a linha que
    --    estiver mais completa" perderia metade do dado.
    IF v_cpf IS NULL OR v_nasc IS NULL THEN
      SELECT coalesce(v_cpf,  ag.cpf),
             coalesce(v_nasc, ag.data_nascimento)
        INTO v_cpf, v_nasc
        FROM public.agenda_tita_autorizacao ag
       WHERE ag.paciente_id = v_paciente
         AND (ag.cpf IS NOT NULL OR ag.data_nascimento IS NOT NULL)
       ORDER BY ag.data_atendimento DESC NULLS LAST
       LIMIT 1;
    END IF;
  END IF;

  -- Só dígitos: o campo da ASSIM diz "digite apenas numeros".
  v_cpf := regexp_replace(coalesce(v_cpf, ''), '\D', '', 'g');

  -- O lpad recupera zero à esquerda perdido caso o valor tenha passado por coluna
  -- numérica em algum ponto da cadeia do TiTa. Mas só de 9 dígitos para cima: um
  -- CPF perde no máximo dois zeros desse jeito, e padding de '123' devolveria
  -- '00000000123' — um CPF confiantemente errado, que é pior que campo vazio,
  -- porque o robô o digitaria e a ASSIM rodaria limpa_carteira(). Abaixo de 9 é
  -- dado corrompido, não zero perdido: vira NULL e o humano assume.
  IF length(v_cpf) BETWEEN 9 AND 11 THEN
    v_cpf := lpad(v_cpf, 11, '0');
  ELSE
    v_cpf := NULL;
  END IF;

  RETURN v_tarefa || jsonb_build_object(
    'cpf', v_cpf,
    -- `date` sai como 'YYYY-MM-DD' no jsonb. O robô traduz para a ordem do campo
    -- em tela; nunca passa por new Date(), que trocaria o dia por fuso.
    'data_nascimento', v_nasc
  );
END;
$$;

COMMENT ON FUNCTION public.robo_buscar_tarefa(text) IS
  'Próxima tarefa da máquina, já travada (FOR UPDATE SKIP LOCKED, FIFO por created_at). '
  'Devolve 13 campos: os 11 do formulário mais cpf (só dígitos) e data_nascimento, que o '
  'robô usa para preencher o modal #checkBday da ASSIM. Fonte dos dois: pacientes '
  '(canônico) com fallback campo-a-campo em agenda_tita_autorizacao. NULL quando não há '
  'dado — o robô então deixa o modal para a recepção.';

-- Assinatura inalterada: o GRANT EXECUTE ... TO anon de 20260813100200 continua
-- valendo. Nada de mexer em grants aqui.
