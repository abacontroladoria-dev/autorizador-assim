-- ===========================================================================
-- O que existe, de fato, em autorizacoes_assim
-- ===========================================================================
--
-- Complemento de 20260821_biofacial_no_relatorio.sql, que já responde "dá para
-- aposentar o modal?". Este aqui é mais cru: mostra as ENTRADAS da tabela, para
-- olhar antes de decidir qualquer coisa.
--
-- POR QUE O BLOCO 0 E O BLOCO 4 IMPORTAM MAIS DO QUE PARECEM
--
-- O relatório da ASSIM foi atualizado, e quem escreve nesta tabela é um robô
-- FORA deste repositório — não controlamos o upsert dele (dito em
-- 20260821000000_reconciliacao_autorizacoes_vinculos.sql:36-39). Ou seja: a
-- tabela pode ter ganhado coluna que os types do projeto não conhecem.
-- `types/supabase.ts` lista 16 colunas (biofacial, codigo_erro, codigo_tuss,
-- data_autorizacao, data_execucao, descricao_erro, guia, matricula,
-- matricula_limpa, paciente_id, paciente_nome, status, status_tratado,
-- teve_token, token, updated_at) — se o bloco 0 devolver mais que isso, chegou
-- informação nova que ninguém está lendo ainda.
--
-- LEMBRETES QUE EVITAM LEITURA ERRADA
--   - `data_execucao` é o INSTANTE DA AUTORIZAÇÃO no portal, não a data do
--     atendimento, e é timestamp without time zone em hora de São Paulo.
--   - `guia` é chave única NA TABELA, mas o número RECICLA ao longo do tempo:
--     a linha antiga é sobrescrita pela nova com o mesmo número.
--   - `Liberado *` (com asterisco) é autorização DESFEITA, não liberada.
--
-- Somente leitura.

-- ---------------------------------------------------------------------------
-- 0. A estrutura real da tabela hoje
-- ---------------------------------------------------------------------------
-- Compare com as 16 colunas listadas acima. Coluna a mais = o relatório novo
-- trouxe campo que o sistema ainda ignora.
SELECT
  ordinal_position AS pos,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'autorizacoes_assim'
ORDER BY ordinal_position;


-- ---------------------------------------------------------------------------
-- 1. Volume e janela: de quando até quando a tabela tem dado
-- ---------------------------------------------------------------------------
SELECT
  count(*)                    AS linhas,
  count(DISTINCT guia)        AS guias_distintas,
  min(data_execucao)          AS mais_antiga,
  max(data_execucao)          AS mais_recente,
  max(updated_at)             AS ultima_carga
FROM public.autorizacoes_assim;


-- ---------------------------------------------------------------------------
-- 2. As entradas cruas, mais recentes primeiro
-- ---------------------------------------------------------------------------
-- É o "olhar a tabela". Ajuste o LIMIT à vontade.
SELECT
  aa.data_execucao,
  aa.guia,
  aa.paciente_nome,
  aa.matricula,
  aa.matricula_limpa,
  aa.codigo_tuss,
  aa.status,
  aa.status_tratado,
  aa.biofacial,
  aa.teve_token,
  aa.token,
  aa.codigo_erro,
  aa.descricao_erro,
  aa.data_autorizacao,
  aa.updated_at
FROM public.autorizacoes_assim aa
ORDER BY aa.data_execucao DESC
LIMIT 100;


-- ---------------------------------------------------------------------------
-- 3. Vocabulário de cada coluna categórica
-- ---------------------------------------------------------------------------
-- Uma consulta só para os quatro campos de texto controlado. Serve para ver o
-- conjunto de valores possíveis sem ter que rodar quatro GROUP BY.
WITH base AS (
  SELECT *
  FROM public.autorizacoes_assim
  WHERE data_execucao >= DATE '2026-07-01'
)
SELECT campo, valor, linhas, primeira_vez, ultima_vez
FROM (
  SELECT 'biofacial'      AS campo, COALESCE(NULLIF(btrim(biofacial), ''), '(vazio/NULL)')      AS valor,
         count(*) AS linhas, min(data_execucao)::date AS primeira_vez, max(data_execucao)::date AS ultima_vez
  FROM base GROUP BY 2
  UNION ALL
  SELECT 'status',        COALESCE(NULLIF(btrim(status), ''), '(vazio/NULL)'),
         count(*), min(data_execucao)::date, max(data_execucao)::date
  FROM base GROUP BY 2
  UNION ALL
  SELECT 'status_tratado', COALESCE(NULLIF(btrim(status_tratado), ''), '(vazio/NULL)'),
         count(*), min(data_execucao)::date, max(data_execucao)::date
  FROM base GROUP BY 2
  UNION ALL
  SELECT 'codigo_erro',   COALESCE(NULLIF(btrim(codigo_erro), ''), '(vazio/NULL)'),
         count(*), min(data_execucao)::date, max(data_execucao)::date
  FROM base GROUP BY 2
) t
ORDER BY campo, linhas DESC;


-- ---------------------------------------------------------------------------
-- 4. A linha inteira, sem escolher coluna
-- ---------------------------------------------------------------------------
-- to_jsonb devolve TUDO, inclusive coluna que este snippet não sabe que existe.
-- É o jeito de ver o que o relatório novo passou a mandar.
SELECT to_jsonb(aa) AS linha_completa
FROM public.autorizacoes_assim aa
ORDER BY aa.data_execucao DESC
LIMIT 5;


-- ---------------------------------------------------------------------------
-- 5. Quantas linhas por dia, e quanto vem com biofacial
-- ---------------------------------------------------------------------------
-- O dia em que `com_biofacial` sai do zero é o dia em que a ASSIM ligou o campo.
SELECT
  aa.data_execucao::date                                          AS dia,
  count(*)                                                        AS linhas,
  count(*) FILTER (WHERE btrim(COALESCE(aa.biofacial, '')) <> '') AS com_biofacial,
  count(*) FILTER (WHERE aa.teve_token)                           AS com_token,
  count(*) FILTER (WHERE aa.status = 'Liberado')                  AS liberadas,
  count(*) FILTER (WHERE aa.status = 'Liberado *')                AS desfeitas,
  count(*) FILTER (WHERE aa.status NOT ILIKE 'Liberado%')          AS recusadas
FROM public.autorizacoes_assim aa
WHERE aa.data_execucao >= DATE '2026-07-01'
GROUP BY 1
ORDER BY 1 DESC;


-- ---------------------------------------------------------------------------
-- 6. O que existe em biofacial ALÉM de 9- e 10-, entre 03/08 e 07/08
-- ---------------------------------------------------------------------------
-- 9-FACIAL e 10-QRCODE são o padrão. O que interessa é o resto: se Token e
-- "Erro no Reconhecimento Facial" têm código próprio no relatório, o de-para
-- fecha e o modal pode sair; se não têm, o relatório perde informação que a
-- Conferência de Filipetas usa (get_tokens_mensal lê forma_autorizacao).
--
-- COALESCE antes do NOT LIKE é proposital: `NULL NOT LIKE '9-%'` devolve NULL,
-- não TRUE, e as linhas sem biofacial sumiriam do resultado justamente aqui,
-- onde elas são metade da pergunta.
--
-- Janela: 03/08 00:00 até 07/08 23:59, escrita como < 08/08 para não depender
-- da precisão do timestamp.

SELECT
  COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)') AS valor_biofacial,
  count(*)                                                  AS linhas,
  min(aa.data_execucao)                                     AS primeira,
  max(aa.data_execucao)                                     AS ultima,
  min(aa.guia)                                              AS exemplo_guia
FROM public.autorizacoes_assim aa
WHERE aa.data_execucao >= TIMESTAMP '2026-08-03 00:00:00'
  AND aa.data_execucao <  TIMESTAMP '2026-08-08 00:00:00'
  AND COALESCE(btrim(aa.biofacial), '') NOT LIKE '9-%'
  AND COALESCE(btrim(aa.biofacial), '') NOT LIKE '10-%'
GROUP BY 1
ORDER BY linhas DESC;


-- 6b. As mesmas linhas, cruas, para olhar uma a uma
SELECT
  aa.data_execucao,
  aa.guia,
  aa.paciente_nome,
  aa.codigo_tuss,
  aa.status,
  aa.biofacial,
  aa.teve_token,
  aa.token,
  aa.codigo_erro,
  aa.descricao_erro
FROM public.autorizacoes_assim aa
WHERE aa.data_execucao >= TIMESTAMP '2026-08-03 00:00:00'
  AND aa.data_execucao <  TIMESTAMP '2026-08-08 00:00:00'
  AND COALESCE(btrim(aa.biofacial), '') NOT LIKE '9-%'
  AND COALESCE(btrim(aa.biofacial), '') NOT LIKE '10-%'
ORDER BY aa.data_execucao
LIMIT 200;


-- 6c. O caminho inverso, que é o que decide
-- Parte do que a ATENDENTE marcou e pergunta o que o relatório diz naquelas
-- mesmas autorizações. Se as linhas de Token/erro facial vierem com biofacial
-- '9-FACIAL', o relatório NÃO distingue esses casos e o modal não pode sair
-- inteiro. Pareamento pelo INSTANTE (±300s), nunca pelo número cru da guia.
SELECT
  fa.forma_autorizacao                                      AS atendente_marcou,
  COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)') AS relatorio_diz,
  count(*)                                                  AS linhas
FROM public.fila_autorizacoes fa
LEFT JOIN public.autorizacoes_assim aa
  ON  aa.guia = fa.numero_autorizacao
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
WHERE fa.horario_autorizacao >= TIMESTAMP '2026-08-03 00:00:00'
  AND fa.horario_autorizacao <  TIMESTAMP '2026-08-08 00:00:00'
  AND btrim(COALESCE(fa.forma_autorizacao, '')) <> ''
GROUP BY 1, 2
ORDER BY atendente_marcou, linhas DESC;


-- ---------------------------------------------------------------------------
-- 7. O vocabulário completo, e o caso do Token
-- ---------------------------------------------------------------------------
-- MEDIDO em 21/08/2026, janela 03-07/08, valores fora de 9-/10-:
--
--   8-DISPOSITIVO INDISPONIVEL   39 linhas   04/08 17:15 -> 05/08 17:07
--   1-ERRO NO RECONHECIMENTO FA   2 linhas   03/08 14:39 -> 05/08 17:45
--   3-BENEFICIARIO SEM CELULAR    1 linha    05/08 12:17
--
-- DUAS COISAS QUE ISSO PROVA
--
-- 1. O rótulo vem TRUNCADO EM 25 CARACTERES. "ERRO NO RECONHECIMENTO FACIAL"
--    chega como "ERRO NO RECONHECIMENTO FA" — e os outros dois só parecem
--    inteiros porque têm 24. É o mesmo comportamento de paciente_nome, que vem
--    cortado em 20 ("ANTONELLA MACHADO NE"). Todo de-para tem de ler o PREFIXO
--    NUMÉRICO; comparar o texto completo falha calado justamente no valor que
--    mais importa.
--
-- 2. O relatório tem categoria que o MODAL NÃO TEM: 8-DISPOSITIVO INDISPONIVEL
--    é o caso em que a ASSIM cai no #checkBday (nascimento + CPF) por não haver
--    dispositivo Intelbras. As seis opções de OPCOES_VALIDACAO (rpa.js:407) não
--    oferecem isso, então hoje a atendente é obrigada a marcar outra coisa. 39
--    ocorrências em ~24h não é exceção rara.
--
-- O QUE AINDA FALTA: o Token não apareceu na janela. Ou não houve nenhum, ou
-- ele não mora em biofacial — a tabela já tem teve_token/token em colunas
-- próprias. As duas consultas abaixo fecham isso.

-- 7a. Vocabulário completo na tabela inteira (sem recorte de data), cruzado com
-- as colunas de token. Revela também os códigos 2, 4, 5, 6 e 7, que a janela de
-- 03-07/08 não mostrou.
SELECT
  COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)')   AS valor_biofacial,
  count(*)                                                    AS linhas,
  count(*) FILTER (WHERE aa.teve_token)                       AS com_teve_token,
  count(*) FILTER (WHERE btrim(COALESCE(aa.token, '')) <> '') AS com_numero_token,
  min(aa.data_execucao)::date                                 AS primeira,
  max(aa.data_execucao)::date                                 AS ultima
FROM public.autorizacoes_assim aa
GROUP BY 1
ORDER BY linhas DESC;


-- 7b. O que o relatório diz onde a ATENDENTE marcou Token.
-- Se vier '9-FACIAL' ou vazio com teve_token = false, o relatório não sabe do
-- token e a Conferência de Filipetas continua dependendo do modal.
-- Janela = o mês que a tabela retém hoje.
SELECT
  fa.forma_autorizacao                                      AS atendente_marcou,
  COALESCE(NULLIF(btrim(aa.biofacial), ''), '(vazio/NULL)') AS relatorio_diz,
  aa.teve_token,
  count(*)                                                  AS linhas
FROM public.fila_autorizacoes fa
LEFT JOIN public.autorizacoes_assim aa
  ON  aa.guia = fa.numero_autorizacao
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
WHERE fa.horario_autorizacao >= TIMESTAMP '2026-07-22 00:00:00'
  AND fa.forma_autorizacao ILIKE '%token%'
GROUP BY 1, 2, 3
ORDER BY linhas DESC;


-- ---------------------------------------------------------------------------
-- 8. As duas verificações antes de aposentar o modal
-- ---------------------------------------------------------------------------
-- O vocabulário fechou (bloco 7): 5.233 linhas distribuídas em 9-, 10-, 8-, 1-,
-- 2-, 3- e dois TESTE. Não existe código de Token — o token é CONSEQUÊNCIA do
-- 8-DISPOSITIVO INDISPONIVEL (97 dos 106 casos emitem filipeta).
--
-- Falta responder duas coisas.

-- ---------------------------------------------------------------------------
-- 8a. O relatório perde algum caso que o modal registra?
-- ---------------------------------------------------------------------------
-- Matriz completa PARTINDO DA FILA (que é permanente) e perguntando o que o
-- relatório diz. O LEFT JOIN é o ponto: linha sem par aparece como
-- '(sem par no relatorio)' em vez de sumir, e é ela que decidiria manter o
-- modal. Janela = o mês que a tabela retém.
SELECT
  COALESCE(NULLIF(btrim(fa.forma_autorizacao), ''), '(nao respondido)') AS atendente_marcou,
  CASE
    WHEN fa.numero_autorizacao IS NULL THEN '(fila sem guia)'
    WHEN aa.guia IS NULL               THEN '(sem par no relatorio)'
    ELSE COALESCE(NULLIF(btrim(aa.biofacial), ''), '(biofacial vazio)')
  END                                                                  AS relatorio_diz,
  count(*)                                                             AS linhas
FROM public.fila_autorizacoes fa
LEFT JOIN public.autorizacoes_assim aa
  ON  aa.guia = fa.numero_autorizacao
  AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
WHERE fa.horario_autorizacao >= TIMESTAMP '2026-07-22 00:00:00'
GROUP BY 1, 2
ORDER BY atendente_marcou, linhas DESC;


-- 8b. O caso do erro facial, nos dois lados, em número seco.
-- O relatório mostrou 17 linhas com 1-. Se a fila tiver muito mais, o relatório
-- está perdendo casos e a segunda semente de get_tokens_mensal não pode trocar
-- de fonte.
SELECT
  (SELECT count(*) FROM public.fila_autorizacoes
    WHERE horario_autorizacao >= TIMESTAMP '2026-07-22 00:00:00'
      AND forma_autorizacao ILIKE '%reconhecimento facial%')            AS na_fila,
  (SELECT count(*) FROM public.autorizacoes_assim
    WHERE data_execucao >= TIMESTAMP '2026-07-22 00:00:00'
      AND btrim(COALESCE(biofacial, '')) LIKE '1-%')                    AS no_relatorio;


-- ---------------------------------------------------------------------------
-- 8c. A Conferência de Filipetas já depende da janela rolante?
-- ---------------------------------------------------------------------------
-- RESPOSTA PELO CÓDIGO, já verificada: sim. get_tokens_mensal tem duas
-- sementes (20260820_tokens_mensal_inclui_erro_facial_remoto.sql):
--
--   semente 1 (token)       FROM autorizacoes_assim aa ... WHERE teve_token = true
--   semente 2 (erro facial) FROM fila_autorizacoes f ... WHERE f.forma_autorizacao
--                                                        ILIKE '%reconhecimento facial%'
--
-- e o filtro final é `mt.teve_token = true OR fo.forma_autorizacao ILIKE ...`.
-- Ou seja, a semente do TOKEN já vive inteiramente dentro da janela rolante de
-- ~30 dias. Refazer a conferência de um mês que saiu da janela já não acha
-- filipeta hoje — fragilidade PRÉ-EXISTENTE, não introduzida por aposentar o
-- modal. Esta consulta mede o tamanho do efeito.
--
-- Se julho vier muito abaixo de agosto, está medido.
SELECT 'julho'  AS mes, count(*) AS linhas FROM public.get_tokens_mensal(DATE '2026-07-01')
UNION ALL
SELECT 'agosto',        count(*)           FROM public.get_tokens_mensal(DATE '2026-08-01');


-- ---------------------------------------------------------------------------
-- 9. As 1.214 autorizações que o relatório não tem
-- ---------------------------------------------------------------------------
-- MEDIDO em 21/08/2026, janela 22/07 -> 21/08:
--
--   fila com horario_autorizacao ....... 6.419 linhas
--   autorizacoes_assim ................. 5.233 linhas
--   sem par no relatorio ............... 1.214 (18,9%)
--
-- E o recorte '(fila sem guia)' NÃO APARECEU: toda linha da fila com
-- horario_autorizacao tem numero_autorizacao. Ou seja, são 1.214 autorizações
-- com guia que o relatório simplesmente não traz.
--
-- Duas explicações possíveis, com consequências opostas:
--
--   a) O relatório é CAPADO em ~5.233 linhas. Suspeita forte: exatamente
--      5.233 linhas / 5.233 guias distintas foram medidas em 05/08/2026 E em
--      21/08/2026 — dezesseis dias depois, mesmo número. Se for cap, o buraco é
--      permanente e imprevisível, e nada que dependa só do relatório está
--      completo.
--
--   b) Aquelas linhas não são autorizações de verdade (guia carimbada por outro
--      caminho, linha de robô legado, duplicata). Aí o relatório está certo e o
--      buraco é da fila.
--
-- Esta consulta separa as duas. A coluna que decide é
-- `guia_existe_ignorando_hora`: se a guia está no relatório mas não casou, o
-- problema é a janela de ±300s; se não está, o relatório não tem a linha.
SELECT
  fa.status,
  fa.machine_id,
  count(*)                                        AS linhas,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.autorizacoes_assim aa
      WHERE aa.guia = fa.numero_autorizacao
    )
  )                                               AS guia_existe_ignorando_hora,
  min(fa.horario_autorizacao)                     AS primeira,
  max(fa.horario_autorizacao)                     AS ultima
FROM public.fila_autorizacoes fa
WHERE fa.horario_autorizacao >= TIMESTAMP '2026-07-22 00:00:00'
  AND fa.numero_autorizacao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.autorizacoes_assim aa
    WHERE aa.guia = fa.numero_autorizacao
      AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
  )
GROUP BY 1, 2
ORDER BY linhas DESC;


-- 9b. O cap existe? Compare o volume dia a dia dos dois lados.
-- Se o relatório for capado por QUANTIDADE, os dias mais antigos da janela vêm
-- truncados e os recentes completos — o corte aparece como degrau na ponta
-- esquerda, não como perda espalhada.
SELECT
  d.dia,
  count(DISTINCT fa.id)   AS na_fila,
  count(DISTINCT aa.guia) AS no_relatorio
FROM (
  SELECT generate_series(DATE '2026-07-22', DATE '2026-08-21', INTERVAL '1 day')::date AS dia
) d
LEFT JOIN public.fila_autorizacoes fa
  ON  fa.horario_autorizacao::date = d.dia
  AND fa.numero_autorizacao IS NOT NULL
LEFT JOIN public.autorizacoes_assim aa
  ON  aa.data_execucao::date = d.dia
GROUP BY d.dia
ORDER BY d.dia;


-- ---------------------------------------------------------------------------
-- 10. Por máquina: quem nunca aparece no relatório
-- ---------------------------------------------------------------------------
-- MEDIDO em 21/08/2026. O bloco 9b MATOU a hipótese de cap por quantidade: a
-- perda é de 10% a 23% TODO DIA, espalhada, não um degrau na ponta antiga da
-- janela (22/07 perde 44%, mas é o dia em que o relatório começa, às 10:39).
--
-- O bloco 9 mostrou outra coisa, e essa é grave. Das 1.214 linhas sem par,
-- quebradas por máquina, a coluna `guia_existe_ignorando_hora`:
--
--   atendente_01    482 linhas    0 guias existem no relatório
--   WEB             260 linhas    0
--   fazendinha_01    23 linhas    0
--   laptop_aline      3 linhas    0
--   atendente_02    257 linhas   35 existem  (as outras 222, não)
--   atendente_04    148 linhas   31
--   atendente_03     45 linhas   29
--
-- ZERO de 482 não é a taxa-base de ~15% agindo por acaso — é sistemático. As
-- guias dessas máquinas NÃO ESTÃO no relatório em forma nenhuma, nem fora da
-- janela de ±300s. Já atendente_02/03/04 têm parte das guias presentes e só
-- falharam o instante, que é outro problema.
--
-- ISSO É MAIOR QUE A PERGUNTA DO MODAL: tudo que cruza fila x relatório PELA
-- GUIA está cego para essas linhas — get_guias_orfas, a Conferência, a
-- reconciliação. E o guarda que entrou em 20260821070000
-- (guia_ja_usada_por_outra_linha) compara `numero_autorizacao = guia`: se o
-- formato divergir, ele não dispara para essas máquinas. Falha para o lado
-- seguro (não bloqueia), mas não protege.
--
-- HIPÓTESE A TESTAR: formato do número. rpa.js:613 tira os zeros à esquerda
-- "para casar com autorizacoes_assim.guia". Uma máquina em versão antiga, ou o
-- caminho WEB (que não passa por robô nenhum — ver a nota sobre machine_id
-- 'WEB' ser inatingível por robo_buscar_tarefa), pode estar gravando
-- '0051268' onde o relatório tem '51268'. A coluna `casa_sem_zeros` responde.

SELECT
  fa.machine_id,
  count(*)                                                      AS total_com_guia,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.autorizacoes_assim aa
      WHERE aa.guia = fa.numero_autorizacao
        AND abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
    )
  )                                                             AS casou_normal,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.autorizacoes_assim aa
      WHERE aa.guia = fa.numero_autorizacao
    )
  )                                                             AS guia_existe_ignorando_hora,
  -- A pergunta do formato: casaria se tirássemos os zeros à esquerda?
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.autorizacoes_assim aa
      WHERE aa.guia = ltrim(fa.numero_autorizacao, '0')
    )
  )                                                             AS casa_sem_zeros,
  count(*) FILTER (WHERE fa.numero_autorizacao ~ '^0')          AS comeca_com_zero,
  count(*) FILTER (WHERE fa.numero_autorizacao !~ '^[0-9]+$')   AS nao_e_so_digito,
  min(length(fa.numero_autorizacao))                            AS len_min,
  max(length(fa.numero_autorizacao))                            AS len_max,
  min(fa.numero_autorizacao)                                    AS exemplo_menor,
  max(fa.numero_autorizacao)                                    AS exemplo_maior
FROM public.fila_autorizacoes fa
WHERE fa.horario_autorizacao >= TIMESTAMP '2026-07-22 00:00:00'
  AND fa.numero_autorizacao IS NOT NULL
GROUP BY fa.machine_id
ORDER BY total_com_guia DESC;


-- 10b. Como é o número nas máquinas que nunca casam, lado a lado com o relatório
-- do mesmo instante. Dez linhas bastam para ver o formato com o olho.
SELECT
  fa.machine_id,
  fa.horario_autorizacao,
  fa.numero_autorizacao                          AS guia_na_fila,
  length(fa.numero_autorizacao)                  AS tamanho,
  fa.status,
  fa.completion_type,
  (SELECT string_agg(aa.guia, ', ' ORDER BY aa.guia)
     FROM public.autorizacoes_assim aa
    WHERE abs(extract(epoch FROM (fa.horario_autorizacao - aa.data_execucao))) < 300
  )                                              AS guias_do_relatorio_no_mesmo_instante
FROM public.fila_autorizacoes fa
WHERE fa.machine_id IN ('atendente_01', 'WEB')
  AND fa.horario_autorizacao >= TIMESTAMP '2026-08-18 00:00:00'
  AND fa.numero_autorizacao IS NOT NULL
ORDER BY fa.horario_autorizacao DESC
LIMIT 10;
