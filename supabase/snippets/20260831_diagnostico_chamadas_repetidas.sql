-- Diagnóstico: nome repetido na coluna "Últimas Chamadas" da TV
--
-- Sintoma em 2026-08-31: o nome de um paciente apareceu 5x na lateral da /tv
-- após um reboot do mini PC da recepção. O reboot só recarregou a página — a
-- rota /api/tv/chamadas lê `chamada_paciente` sem deduplicar, então 5 linhas na
-- tela eram 5 linhas no banco.
--
-- CONCLUSÃO DA INVESTIGAÇÃO (31/08) — o que estas consultas mostraram:
--
--   * Um paciente: 15 chamadas num dia, 6 delas em 900 ms. Outros 3 pacientes
--     com padrão igual no mesmo dia.
--   * NÃO era bug. Descartados, nesta ordem: duplo-clique humano (rápido demais),
--     um card por terapia (agenda_tita tem 1 sessão por horário), RPC duplicando
--     cards (339 cards para 339 sessões, excedente 0), realtime remontando a
--     lista (a página só recarrega ao trocar a data) e handler duplicado (um
--     único onClick). A aba Network fechou: 1 clique = 1 POST.
--   * A causa era a AUSÊNCIA DE RETORNO. A TV ficou muda até 31/08 (o mini PC
--     não tinha servidor de áudio) e fica em outra sala: quem apertava "Chamar"
--     não tinha como saber se funcionou, e clicava de novo. Nos dias anteriores,
--     com o mesmo silêncio, os intervalos eram de 11–18s.
--
-- Correções: som no mini PC (ver reference-audio-hdmi-kiosk-tv), botão virando
-- "Chamado" na /solicitar, trava de 90s por (paciente, data, horário) e dedupe
-- por paciente na rota da TV.
--
-- As consultas seguem úteis para reexaminar o padrão — em especial a 3, que
-- mede rajada contra rechamada deliberada.
--
-- Somente leitura. Nada aqui altera dados.

-- ---------------------------------------------------------------------------
-- 1. As chamadas de UM paciente, com o intervalo entre uma e a seguinte.
--    Troque o filtro pelo nome que estiver investigando.
--
--    Sub-segundo entre linhas => a pessoa clicou sem ver retorno na tela.
--    Minutos entre linhas     => rechamada deliberada (o responsável não veio).
-- ---------------------------------------------------------------------------
select
  id,
  nome,
  paciente_id,
  data_atendimento,
  horario,
  status,
  chamado_em,
  chamado_em - lag(chamado_em) over (
    partition by coalesce(paciente_id, nome)
    order by chamado_em
  ) as desde_a_anterior
from chamada_paciente
where nome ilike '%NOME DO PACIENTE AQUI%'
  and chamado_em > now() - interval '24 hours'
order by chamado_em desc;

-- ---------------------------------------------------------------------------
-- 2. O caso é isolado ou acontece todo dia? Agrupa por paciente e por dia,
--    listando só quem foi chamado mais de uma vez.
--
--    `min`/`max` do intervalo separam os dois cenários em lote: um grupo cujo
--    menor intervalo é de poucos segundos tem duplo-toque no meio.
-- ---------------------------------------------------------------------------
with intervalos as (
  select
    coalesce(paciente_id, nome) as quem,
    nome,
    (chamado_em at time zone 'America/Sao_Paulo')::date as dia,
    chamado_em,
    chamado_em - lag(chamado_em) over (
      partition by coalesce(paciente_id, nome),
                   (chamado_em at time zone 'America/Sao_Paulo')::date
      order by chamado_em
    ) as gap
  from chamada_paciente
  where chamado_em > now() - interval '30 days'
)
select
  dia,
  nome,
  count(*)                          as chamadas,
  min(gap)                          as menor_intervalo,
  max(gap)                          as maior_intervalo,
  min(chamado_em)                   as primeira,
  max(chamado_em)                   as ultima
from intervalos
group by dia, quem, nome
having count(*) > 1
order by dia desc, chamadas desc
limit 100;

-- ---------------------------------------------------------------------------
-- 3. Quantas repetições são rajada (<= 10s) contra deliberadas, no período.
--    Uma linha só, para dimensionar o problema antes de decidir se cabe mais
--    alguma trava além das duas já aplicadas.
-- ---------------------------------------------------------------------------
with intervalos as (
  select
    chamado_em - lag(chamado_em) over (
      partition by coalesce(paciente_id, nome),
                   (chamado_em at time zone 'America/Sao_Paulo')::date
      order by chamado_em
    ) as gap
  from chamada_paciente
  where chamado_em > now() - interval '30 days'
)
select
  count(*) filter (where gap is not null)                      as repeticoes,
  count(*) filter (where gap <= interval '10 seconds')         as rajada_ate_10s,
  count(*) filter (where gap >  interval '10 seconds'
                     and gap <= interval '2 minutes')          as entre_10s_e_2min,
  count(*) filter (where gap >  interval '2 minutes')          as deliberadas
from intervalos;
