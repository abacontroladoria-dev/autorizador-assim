-- ============================================================
-- Conferência da migration 20260902130000_robo_tarefa_cpf_nascimento
--
-- Rodar bloco por bloco no SQL Editor. Os blocos 1 e 2 são LEITURA e podem
-- rodar ANTES de aplicar a migration — servem para saber o que esperar dela.
-- O bloco 3 confere a função depois de aplicada.
--
-- Repositório é PÚBLICO: nada de CPF real colado de volta neste arquivo.
-- ============================================================


-- ============================================================
-- 1. O que as duas fontes têm hoje                          [leitura]
-- ============================================================
-- Confirma a premissa do desenho: o cadastro é o melhor dado mas não cobre
-- todos, e a agenda cobre o resto.

select
  (select count(*) from public.pacientes)                                as pacientes_total,
  (select count(*) from public.pacientes
    where cpf is not null and data_nascimento is not null)               as pacientes_completos,
  (select count(*) from public.pacientes where cpf is null)              as pacientes_sem_cpf,
  (select count(*) from public.agenda_tita_autorizacao)                  as agenda_total,
  (select count(*) from public.agenda_tita_autorizacao
    where cpf is null or data_nascimento is null)                        as agenda_incompletas;


-- ============================================================
-- 2. O CPF do cadastro precisa de lpad?                     [leitura]
-- ============================================================
-- O ramo do lpad na migration só existe para zero à esquerda perdido em coluna
-- numérica. Se `menos_de_11` vier 0, o ramo nunca dispara — e é bom saber, para
-- ninguém "simplificar" a função removendo o guarda de 9 dígitos por achar que
-- ele é decorativo.

select
  count(*) filter (where length(regexp_replace(cpf, '\D', '', 'g')) = 11)      as com_11,
  count(*) filter (where length(regexp_replace(cpf, '\D', '', 'g')) between 9 and 10) as menos_de_11,
  count(*) filter (where length(regexp_replace(cpf, '\D', '', 'g')) < 9)       as curtos_demais
from public.pacientes
where cpf is not null;


-- ============================================================
-- 3. A função, depois de aplicada                           [leitura]
-- ============================================================

-- 3a. O search_path sobreviveu ao CREATE OR REPLACE?
-- TEM de mostrar {search_path=public}. Vazio = função SECURITY DEFINER sem
-- search_path fixo, que é problema de privilégio, não de estilo.
select proname, prosecdef, proconfig
  from pg_proc
 where proname = 'robo_buscar_tarefa';

-- 3b. O lookup usa o índice único de `pacientes`?
-- Espera-se "Index Scan using pacientes_tita_paciente_id_key". Se aparecer Seq
-- Scan, alguém inverteu o cast para `p.tita_paciente_id::text = ...`.
explain (analyze, buffers)
select p.cpf, p.data_nascimento
  from public.pacientes p
 where p.tita_paciente_id = (
   select paciente_id::bigint
     from public.fila_autorizacoes
    where paciente_id ~ '^\d+$'
    limit 1
 );

-- 3c. O que a função devolveria para as tarefas de hoje, SEM travar nenhuma.
-- Repete a lógica dos dois ramos em leitura pura: dá para ver a cobertura real
-- (quantas tarefas o robô vai conseguir preencher) antes de publicar o 1.1.7.
with tarefas as (
  select f.id, f.paciente_nome,
         case when f.paciente_id ~ '^\d+$' then f.paciente_id::bigint end as pid
    from public.fila_autorizacoes f
   where f.data_atendimento = current_date
),
resolvido as (
  select t.*,
         coalesce(p.cpf,             ag.cpf)             as cpf_bruto,
         coalesce(p.data_nascimento, ag.data_nascimento) as nasc
    from tarefas t
    left join public.pacientes p on p.tita_paciente_id = t.pid
    left join lateral (
      select a.cpf, a.data_nascimento
        from public.agenda_tita_autorizacao a
       where a.paciente_id = t.pid
         and (a.cpf is not null or a.data_nascimento is not null)
       order by a.data_atendimento desc nulls last
       limit 1
    ) ag on true
)
select
  count(*)                                                            as tarefas_hoje,
  count(*) filter (
    where length(regexp_replace(coalesce(cpf_bruto,''), '\D','','g')) between 9 and 11
      and nasc is not null
  )                                                                   as o_robo_preenche,
  count(*) filter (where nasc is null)                                as sem_nascimento,
  count(*) filter (
    where length(regexp_replace(coalesce(cpf_bruto,''), '\D','','g')) < 9
  )                                                                   as sem_cpf_utilizavel
from resolvido;

-- 3d. Teste de ponta a ponta, com uma máquina de teste.
-- Precisa de uma linha 'pendente' com o machine_id daquela máquina. Devolve a
-- tarefa JÁ TRAVADA (vira 'processando') — usar máquina de teste, não de
-- recepção, e conferir que vêm as chaves `cpf` e `data_nascimento`.
--
-- select public.robo_buscar_tarefa('<TOKEN_DA_MAQUINA_DE_TESTE>');
--
-- Para devolver a linha à fila depois do teste:
-- update public.fila_autorizacoes
--    set status = 'pendente', started_at = null
--  where id = '<ID_DA_LINHA>';
