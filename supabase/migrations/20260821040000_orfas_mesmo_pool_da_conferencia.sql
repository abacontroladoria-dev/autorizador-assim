-- =============================================================================
-- get_guias_orfas tem de numerar sobre o MESMO pool que a Conferência
-- =============================================================================
-- A Etapa 3 passou a excluir a guia triada do pool posicional ANTES do
-- row_number() (20260821030000). `get_guias_orfas` também excluía guia triada —
-- mas no WHERE externo, o que tira a guia do RESULTADO e não da NUMERAÇÃO.
--
-- As duas passaram a discordar. Cenário medido no teste:
--
--   10/08: 2 sessões de TUSS 22070435 e 3 guias liberadas (30001 08:00,
--          30002 09:05, 30003 14:05). A 30001 é a reautorização atrasada de uma
--          sessão de 03/08.
--
--   depois de vincular 30001 ao bloco de 03/08:
--     Conferência   -> 30002 cobre a sessão de 09:00, 30003 cobre a de 14:00.
--                      Nenhuma sobra. CORRETO.
--     get_guias_orfas -> ainda numerava 30003 como ordem 3 (porque a 30001
--                      seguia no row_number()) e a reportava como órfã.
--
-- Efeito na tela: a aba Reconciliação ofereceria para vincular uma guia que a
-- Conferência já considera casada com uma sessão. O operador vincularia de novo,
-- em outro bloco, e criaria uma cobertura dupla — duas sessões "autorizadas"
-- pela mesma autorização.
--
-- É o mesmo erro que 20260821000000 já tinha na primeira escrita (filtro de
-- `status` antes da função de janela) numa outra posição do mesmo SELECT: em
-- Postgres o WHERE roda ANTES do row_number(), então tudo que precisa afetar a
-- numeração tem de estar na CTE, e tudo que só classifica fica fora.
--
-- A exclusão sai do WHERE externo e vai para a CTE `guias`. Não fica nos dois
-- lugares: na CTE ela já é suficiente, e a cópia no WHERE seria letra morta que
-- alguém tentaria "consertar" depois.
--
-- `status` e `codigo_tuss` CONTINUAM no WHERE externo, e isso é proposital: eles
-- classificam a guia sem tirá-la da partição. A glosa tem de seguir contando
-- posição — é ela que faz a liberação seguinte ser a ordem 2.
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
set statement_timeout = '55s'
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
      -- A exclusão que ESTA migration move para cá. Idêntica à da CTE
      -- `autorizacoes` de get_auditoria_assim_periodo (20260821030000): guia já
      -- triada não compete por posição. Se as duas divergirem, a Reconciliação
      -- oferece guia que a Conferência já casou.
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
    -- por tempo: o número da guia recicla (20260805170300:99-107).
    and not exists (
      select 1 from public.fila_autorizacoes fa
      where fa.numero_autorizacao = g.guia
        and fa.horario_autorizacao is not null
        and abs(extract(epoch from (fa.horario_autorizacao - g.data_execucao))) <= 300
    )
  order by g.data_execucao desc, g.guia
$$;

comment on function public.get_guias_orfas(date, date) is
  'Guias ASSIM liberadas que sobraram do match posicional e ainda não foram triadas. Numera sobre o mesmo pool que get_auditoria_assim_periodo — guia triada sai antes do row_number(), senão as duas telas discordam.';
