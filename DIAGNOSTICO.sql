-- ============================================================================
-- Por que a aba Pendencias esta vazia? Rode no SQL Editor de producao.
-- Somente leitura -- nao escreve nada.
-- ============================================================================

-- 1) As regras estao ativas? (esperado: ambas false, foi o combinado)
select codigo, ativo, tolerancia_minutos, prioridade, setor_destino
from public.alertas_regras
order by codigo;

-- 2) Existe algum alerta na tabela?
select coalesce(status,'(nenhum)') as status, count(*)
from public.alertas
group by rollup (status);

-- 3) Qual o SEU papel? Decide o que a RLS te deixa ver.
--    gestao (admin/diretoria/autorizacao) ve tudo; os demais so o proprio setor.
select u.nome, u.role,
       (u.role in ('admin','diretoria','autorizacao')) as ve_tudo
from public.usuarios u
where u.id = auth.uid();

-- 4) O QUE APARECERIA se a regra fosse ligada agora.
--    Mesma classificacao de fn_alertas_avaliar_assim, mas so leitura.
--    Troque a data se quiser olhar outro dia.
with parametros as (
  select (now() at time zone 'America/Sao_Paulo')::date as dia,
         (now() at time zone 'America/Sao_Paulo')       as agora_local
),
src as (
  select s.*, p.dia, p.agora_local
  from parametros p
  cross join lateral public.get_auditoria_assim(p.dia) s
),
fila_com_guia as (
  select f.empresa, f.matricula, f.dep, f.tuss, f.horario
  from public.fila_autorizacoes f, parametros p
  where f.data_atendimento = p.dia
    and f.status = 'concluido'
    and f.numero_autorizacao is not null
  group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
),
avaliado as (
  select s.*,
    case
      when fg.matricula is not null                then 'concluido'
      when s.situacao in ('LIBERADA','CANCELADA')  then 'concluido'
      when s.situacao = 'GLOSA'                    then 'pendente_glosa'
      else                                              'pendente_sem_desfecho'
    end as classe,
    -- tolerancia de 50 min para sem_desfecho; glosa e imediata
    ((s.dia + s.hora_inicial) + interval '50 minutes' <= s.agora_local) as passou_tolerancia
  from src s
  left join fila_com_guia fg
    on  fg.empresa   = s.empresa
    and fg.matricula = s.matricula
    and fg.dep       = s.dep
    and fg.tuss      = s.codigo_tuss
    and fg.horario   = s.hora_inicial
)
select
  classe,
  count(*)                                                   as total,
  count(*) filter (where passou_tolerancia)                   as ja_passou_tolerancia,
  count(*) filter (where not passou_tolerancia)               as ainda_no_prazo
from avaliado
group by classe
order by classe;

-- 5) Detalhe das que virariam pendencia AGORA (as 20 primeiras).
with parametros as (
  select (now() at time zone 'America/Sao_Paulo')::date as dia,
         (now() at time zone 'America/Sao_Paulo')       as agora_local
),
src as (
  select s.*, p.dia, p.agora_local
  from parametros p
  cross join lateral public.get_auditoria_assim(p.dia) s
),
fila_com_guia as (
  select f.empresa, f.matricula, f.dep, f.tuss, f.horario
  from public.fila_autorizacoes f, parametros p
  where f.data_atendimento = p.dia
    and f.status = 'concluido'
    and f.numero_autorizacao is not null
  group by f.empresa, f.matricula, f.dep, f.tuss, f.horario
)
select s.hora_inicial, s.paciente_nome, s.terapias, s.situacao,
  case
    when fg.matricula is not null               then 'concluido'
    when s.situacao in ('LIBERADA','CANCELADA') then 'concluido'
    when s.situacao = 'GLOSA'                   then 'pendente_glosa'
    else                                             'pendente_sem_desfecho'
  end as classe
from src s
left join fila_com_guia fg
  on  fg.empresa   = s.empresa
  and fg.matricula = s.matricula
  and fg.dep       = s.dep
  and fg.tuss      = s.codigo_tuss
  and fg.horario   = s.hora_inicial
where (fg.matricula is null and s.situacao not in ('LIBERADA','CANCELADA'))
  and ( s.situacao = 'GLOSA'
        or (s.dia + s.hora_inicial) + interval '50 minutes' <= s.agora_local )
order by s.hora_inicial
limit 20;
