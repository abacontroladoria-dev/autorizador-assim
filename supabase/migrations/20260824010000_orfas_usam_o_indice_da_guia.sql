-- =============================================================================
-- A janela de 5 min vira `between`, para o índice da guia poder ser usado
-- =============================================================================
-- Companheira de 20260824000000, que criou `idx_fila_autorizacoes_guia_horario`.
-- Só o índice não bastaria: escrito como estava, o predicado de tempo é
-- inalcançável por índice nenhum.
--
--     abs(extract(epoch from (fa.horario_autorizacao - g.data_execucao))) <= 300
--
-- A coluna está dentro de uma expressão (subtração, extract, abs). O planner não
-- consegue traduzir isso em faixa de busca, então varre e avalia linha a linha.
-- Reescrito como faixa literal sobre a coluna crua, o mesmo teste passa a ser
-- resolvido dentro do index scan:
--
--     fa.horario_autorizacao between g.data_execucao - interval '5 minutes'
--                                and g.data_execucao + interval '5 minutes'
--
-- Equivalente termo a termo: `between` inclui os extremos, como o `<= 300`
-- incluía exatamente 300 s, e o `is not null` explícito some porque `between`
-- contra NULL já não é verdadeiro. O que NÃO muda é o motivo de a checagem
-- existir qualificada por tempo: o número da guia da ASSIM recicla
-- (20260805170300:99-107), então comparar `numero_autorizacao = guia` cru casaria
-- guias de meses diferentes.
--
-- E o `statement_timeout` da função cai de 55 s para 15 s. Os 55 s vieram de
-- quando a função levava 44 s — ou seja, davam a ela licença para prender uma
-- conexão do pool por quase um minuto, que é exatamente como uma tela lenta virou
-- um banco inteiro em 504. Com o índice ela roda em ordem de milissegundos; 15 s
-- é folga larga e, se alguém regredir o predicado, a falha aparece rápido em vez
-- de derrubar o resto. A tela aguenta a falha: o catch de
-- useAnaliseReincidencia.ts:475-481 é silencioso de propósito e só perde o atalho
-- de vincular.
--
-- Todo o resto do corpo é idêntico a 20260821040000 — em particular a divisão
-- entre o que fica na CTE `guias` (afeta a numeração) e o que fica no WHERE
-- externo (só classifica). Essa divisão é a razão de aquela migration existir.
-- =============================================================================

create or replace function public.get_guias_orfas(p_de date, p_ate date)
returns table (
  guia                text,
  carteirinha         text,
  paciente_id         bigint,
  paciente_nome       text,
  data_execucao       timestamp without time zone,
  codigo_tuss         text,
  status              text,
  teve_token          boolean,
  token               text,
  biofacial           text,
  ordem_autorizacao   bigint,
  sessoes_na_particao bigint
)
language sql
stable
security definer
set search_path = public
-- Declarado aqui dentro, e não por ALTER FUNCTION: `create or replace` descarta
-- o proconfig posto de fora, calado (20260817:CREATE OR REPLACE perde proconfig).
set statement_timeout = '15s'
as $$
  with n_sessoes as (
    select b.empresa, b.matricula, b.dep, b.data_atendimento, b.codigo_tuss,
           count(*) as n
    from public.fn_blocos_assim(p_de, p_ate) b
    group by 1,2,3,4,5
  ),
  guias as (
    select
      aa.guia,
      aa.matricula as carteirinha,
      aa.paciente_id,
      aa.paciente_nome,
      aa.data_execucao,
      aa.codigo_tuss,
      aa.status,
      aa.teve_token,
      aa.token,
      aa.biofacial,
      split_part(aa.matricula, '.', 1) as empresa,
      split_part(aa.matricula, '.', 2) as matricula_base,
      split_part(aa.matricula, '.', 3) as dep,
      row_number() over (
        partition by split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                     split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
        order by aa.data_execucao
      ) as ordem_autorizacao
    from public.autorizacoes_assim aa
    -- Nada de filtro de `status` aqui: o WHERE roda antes da função de janela, e
    -- tirar a glosa da partição faria a liberação posterior virar ordem 1 e
    -- deixar de ser excedente — o caso da Kourtney desapareceria da tela.
    -- `status` e `codigo_tuss` são filtrados no WHERE final.
    where aa.data_execucao is not null      -- há 2 linhas de teste em produção
                                            -- (TESTE123/TESTE999) com tudo nulo
      and date(aa.data_execucao) between p_de and p_ate
      -- Idêntica à da CTE `autorizacoes` de get_auditoria_assim_periodo
      -- (20260821030000): guia já triada não compete por posição. Se as duas
      -- divergirem, a Reconciliação oferece guia que a Conferência já casou.
      and not exists (
        select 1 from public.autorizacoes_vinculos v
        where v.guia = aa.guia and v.desfeito_em is null
      )
  )
  select
    g.guia, g.carteirinha, g.paciente_id, g.paciente_nome, g.data_execucao,
    g.codigo_tuss, g.status, g.teve_token, g.token, g.biofacial,
    g.ordem_autorizacao, coalesce(ns.n, 0) as sessoes_na_particao
  from guias g
  left join n_sessoes ns
    on  ns.empresa          = g.empresa
    and ns.matricula        = g.matricula_base
    and ns.dep              = g.dep
    and ns.data_atendimento = date(g.data_execucao)
    and ns.codigo_tuss      = g.codigo_tuss
  where g.status = 'Liberado'        -- 'Liberado *' = cancelada; o resto é glosa
    and g.codigo_tuss is not null
    and g.ordem_autorizacao > coalesce(ns.n, 0)
    -- e não é guia que o próprio Pulsar capturou. Comparação SEMPRE qualificada
    -- por tempo: o número da guia recicla (20260805170300:99-107). Escrita como
    -- faixa sobre a coluna crua, e não como `abs(extract(epoch ...)) <= 300`, para
    -- caber em idx_fila_autorizacoes_guia_horario (20260824000000).
    and not exists (
      select 1 from public.fila_autorizacoes fa
      where fa.numero_autorizacao = g.guia
        and fa.horario_autorizacao between g.data_execucao - interval '5 minutes'
                                       and g.data_execucao + interval '5 minutes'
    )
  order by g.data_execucao desc, g.guia
$$;

comment on function public.get_guias_orfas(date, date) is
  'Guias ASSIM liberadas que sobraram do match posicional e ainda não foram triadas. Numera sobre o mesmo pool que get_auditoria_assim_periodo — guia triada sai antes do row_number(), senão as duas telas discordam. A janela de 5 min contra a fila é `between` sobre a coluna crua, para usar idx_fila_autorizacoes_guia_horario.';
