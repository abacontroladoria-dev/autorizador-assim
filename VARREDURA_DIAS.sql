-- ============================================================================
-- POR QUE cada atendimento foi classificado como concluido?
-- Somente leitura. Ajuste a data na primeira linha.
--
-- O objetivo e testar a hipotese H2: o sinal fila_com_guia (robo colheu a guia no
-- aceite) esta marcando como concluido algo que a auditoria considera problema?
-- ============================================================================

\set dia '2026-07-29'

with src as (
  select * from public.get_auditoria_assim(:'dia'::date)
),
fila_com_guia as (
  select f.empresa, f.matricula, f.dep, f.tuss, f.horario,
         max(f.numero_autorizacao) as guia_fila,
         max(f.status)             as status_fila
  from public.fila_autorizacoes f
  where f.data_atendimento = :'dia'::date
    and f.status = 'concluido'
    and f.numero_autorizacao is not null
  group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
),
avaliado as (
  select s.paciente_nome, s.hora_inicial, s.terapias, s.situacao,
         s.guia as guia_assim, s.token,
         fg.guia_fila,
         (fg.matricula is not null) as veio_da_fila,
    case
      when fg.matricula is not null                then 'concluido'
      when s.situacao in ('LIBERADA','CANCELADA')  then 'concluido'
      when s.situacao = 'GLOSA'                    then 'pendente_glosa'
      else                                              'pendente_sem_desfecho'
    end as classe,
    -- Qual das duas fontes decidiu?
    case
      when fg.matricula is not null and s.situacao in ('LIBERADA','CANCELADA')
                                                   then '1. ambas concordam'
      when fg.matricula is not null                then '2. SO a fila (guia do robo)'
      when s.situacao in ('LIBERADA','CANCELADA')   then '3. SO autorizacoes_assim'
      else                                              '4. nenhuma -> pendente'
    end as decidido_por
  from src s
  left join fila_com_guia fg
    on  fg.empresa   = s.empresa
    and fg.matricula = s.matricula
    and fg.dep       = s.dep
    and fg.tuss      = s.codigo_tuss
    and fg.horario   = s.hora_inicial
)

-- (A) De onde vem a conclusao. Se "2. SO a fila" for a maioria esmagadora,
--     a hipotese H2 fica plausivel e vale olhar o bloco (B).
select decidido_por, situacao, count(*)
from avaliado
group by decidido_por, situacao
order by decidido_por, count(*) desc;

-- (B) Os casos onde MEU sinal sobrepoe a auditoria: a fila tem guia, mas a
--     situacao ainda e um estado de problema. Se estes forem legitimos (guia
--     existe de verdade), H1 esta certa. Se parecerem errados, H2 esta certa.
with src as (
  select * from public.get_auditoria_assim(:'dia'::date)
),
fila_com_guia as (
  select f.empresa, f.matricula, f.dep, f.tuss, f.horario,
         max(f.numero_autorizacao) as guia_fila
  from public.fila_autorizacoes f
  where f.data_atendimento = :'dia'::date
    and f.status = 'concluido'
    and f.numero_autorizacao is not null
  group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
)
select s.hora_inicial, s.paciente_nome, s.terapias,
       s.situacao      as situacao_auditoria,
       fg.guia_fila    as guia_colhida_pelo_robo,
       s.guia          as guia_em_autorizacoes_assim,
       s.observacao
from src s
join fila_com_guia fg
  on  fg.empresa   = s.empresa
  and fg.matricula = s.matricula
  and fg.dep       = s.dep
  and fg.tuss      = s.codigo_tuss
  and fg.horario   = s.hora_inicial
where s.situacao not in ('LIBERADA','CANCELADA')
order by s.hora_inicial
limit 30;
