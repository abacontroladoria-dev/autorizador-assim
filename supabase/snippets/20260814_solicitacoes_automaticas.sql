-- =============================================================================
-- "Aparecem solicitações sozinhas no PC da Laura, de pacientes da tarde"
-- =============================================================================
-- Objetivo: descobrir QUEM escreveu. Não há, no código do frontend, nenhum
-- caminho que crie linha na fila sem clique — criarAutorizacao() só é chamado
-- dentro de handleSolicitarLista / handleFalta / handleFaltaDia / handleManualLista,
-- todos ligados a onClick. Então a linha ou (a) nasceu de um clique que fez mais
-- do que a pessoa esperava, ou (b) já existia e alguém a devolveu para 'pendente'.
--
-- fila_autorizacoes_logs distingue os dois casos sem ambiguidade: o trigger
-- trigger_log_fila_autorizacoes grava 'Solicitação criada' no INSERT e
-- 'Autorização reenviada' quando um UPDATE devolve a linha para 'pendente'.
--
-- Suspeitos conhecidos, para comparar com o que o log disser:
--
--   1. ModalErros "Reprocessar todos" (components/perfil/ModalErros.tsx:75-90)
--      Pega até 50 linhas em 'erro' — SEM filtro de data e SEM filtro de máquina —
--      e joga todas para 'pendente' de uma vez. Um clique só, e volta trabalho
--      antigo de qualquer dia e de qualquer estação para a fila.
--      Assinatura no log: 'Autorização reenviada', várias no MESMO segundo.
--
--   2. Falta do dia (solicitar/page.tsx:690-717)
--      Percorre TODOS os atendimentos do paciente naquele dia, inclusive os da
--      tarde, e cria linha para cada um. Nascem como 'falta'; viram 'pendente'
--      se alguém reverter depois (central-pacientes/page.tsx:272).
--      Assinatura: 'Solicitação criada' com status 'falta', seguida de
--      'Autorização reenviada' e falta_revertida_em preenchido.
--
--   3. Reverter falta, uma a uma (central-pacientes/page.tsx:262-284)
--      Assinatura: falta_revertida_em preenchido, falta_revertida_por_nome com o
--      nome de quem clicou.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. As linhas suspeitas de hoje, na máquina da Laura
-- -----------------------------------------------------------------------------
-- Tudo em 'pendente' hoje, com o horário da sessão e quando a linha nasceu.
-- Se `criado_em_sp` for DEPOIS do horário da sessão, ou se várias linhas tiverem
-- o mesmo segundo de criação, foi ação em lote — não digitação.

SELECT
  fa.id,
  fa.horario                                       AS horario_sessao,
  fa.paciente_nome,
  fa.terapia_nome,
  fa.status,
  fa.machine_id,
  fa.criado_por,
  fa.completion_type,
  (fa.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS criado_em_sp,
  (fa.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo' AS atualizado_em_sp,
  fa.falta_revertida_por_nome,
  fa.falta_revertida_em,
  fa.tita_agendamento_id,
  CASE
    WHEN fa.horario >= TIME '12:00' THEN 'TARDE'
    ELSE 'manhã'
  END                                              AS turno
FROM public.fila_autorizacoes fa
WHERE fa.data_atendimento = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND fa.status = 'pendente'
ORDER BY fa.created_at, fa.horario;


-- -----------------------------------------------------------------------------
-- 2. Rajadas: várias linhas escritas no mesmo segundo = ação em lote
-- -----------------------------------------------------------------------------
-- Digitação humana não produz 8 linhas no mesmo segundo. Isso aponta direto para
-- "Reprocessar todos" ou para a falta do dia.

SELECT
  date_trunc('second', fa.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo' AS segundo_sp,
  fa.machine_id,
  fa.criado_por,
  count(*)                        AS linhas,
  min(fa.horario)                 AS da_sessao,
  max(fa.horario)                 AS ate_a_sessao,
  string_agg(DISTINCT fa.status, ', ') AS status
FROM public.fila_autorizacoes fa
WHERE fa.created_at >= (now() - INTERVAL '2 days')
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY 1 DESC
LIMIT 40;


-- -----------------------------------------------------------------------------
-- 3. A prova: o que o log diz que aconteceu com cada linha
-- -----------------------------------------------------------------------------
-- 'Solicitação criada'    → a linha NASCEU aqui (alguém clicou em solicitar/falta)
-- 'Autorização reenviada' → a linha JÁ EXISTIA e voltou para 'pendente'
--                           (ModalErros "Reprocessar todos" ou reversão de falta)

-- Atenção: fila_autorizacoes_logs.created_at é timestamptz, ao contrário de
-- fila_autorizacoes.created_at, que é timestamp puro em UTC. Por isso aqui a
-- conversão é de um passo só.
SELECT
  l.created_at AT TIME ZONE 'America/Sao_Paulo' AS quando_sp,
  fa.horario        AS horario_sessao,
  fa.paciente_nome,
  l.descricao,
  l.status,
  l.metadata ->> 'status_anterior' AS status_anterior,
  l.usuario,
  l.machine_id
FROM public.fila_autorizacoes_logs l
JOIN public.fila_autorizacoes fa ON fa.id = l.fila_id
WHERE fa.data_atendimento = (now() AT TIME ZONE 'America/Sao_Paulo')::date
ORDER BY l.created_at DESC
LIMIT 100;


-- -----------------------------------------------------------------------------
-- 4. Reprocessamento em lote nos últimos dias (o suspeito nº 1)
-- -----------------------------------------------------------------------------
-- Se aparecer um bloco de 'Autorização reenviada' com status_anterior='erro',
-- todos no mesmo segundo, foi o "Reprocessar todos" do ModalErros.

SELECT
  date_trunc('second', l.created_at) AT TIME ZONE 'America/Sao_Paulo' AS segundo_sp,
  count(*)                                       AS linhas,
  string_agg(DISTINCT l.metadata ->> 'status_anterior', ', ') AS vieram_de,
  string_agg(DISTINCT fa.data_atendimento::text, ', ')        AS datas_afetadas
FROM public.fila_autorizacoes_logs l
JOIN public.fila_autorizacoes fa ON fa.id = l.fila_id
WHERE l.descricao = 'Autorização reenviada'
  AND l.created_at >= (now() - INTERVAL '7 days')
GROUP BY 1
HAVING count(*) > 2
ORDER BY 1 DESC;


-- -----------------------------------------------------------------------------
-- 5. Contenção imediata, se for preciso parar o robô antes de entender
-- -----------------------------------------------------------------------------
-- Pausar a estação NÃO perde nada: robo_buscar_tarefa devolve NULL para máquina
-- inativa e as linhas ficam em 'pendente', esperando. Autorizar sessão da tarde
-- de manhã é que é irreversível — a ASSIM carimba data_execucao no instante da
-- autorização, e todo o casamento por data quebra depois.

-- UPDATE public.maquinas SET ativa = false WHERE id = 'atendente_02';
-- ... resolvido, religar:
-- UPDATE public.maquinas SET ativa = true  WHERE id = 'atendente_02';
