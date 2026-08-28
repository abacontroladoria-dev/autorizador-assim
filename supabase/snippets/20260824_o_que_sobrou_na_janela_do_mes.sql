-- =============================================================================
-- O que sobrou na janela do mês
-- =============================================================================
-- Depois de 20260824020000, medido em 24/08:
--
--   fn_blocos_assim   7 dias ......  13.126 →    706 ms   (buffers 53.938 → 8.832)
--   get_guias_orfas   7 dias ......  49.230 →  2.717 ms
--   get_guias_orfas   MÊS ..........          13.113 ms   ← ainda acima dos 8 s
--
-- A conta que sobra: dos 2.717 ms dos 7 dias, 706 são fn_blocos_assim e ~2.000 são
-- o resto de get_guias_orfas. No mês, fn_blocos_assim deve custar ~3× isso e o
-- resto ~3,4× — o que já explica os 13 s sem precisar de mistério novo. Estes
-- blocos confirmam a divisão antes de mexer em qualquer coisa.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A divisão do mês: quanto é fn_blocos_assim e quanto é o resto
-- -----------------------------------------------------------------------------
explain (analyze, buffers, timing)
select count(*) from public.fn_blocos_assim(date_trunc('month', current_date)::date, current_date);

-- Subtrair do total de get_guias_orfas no mês (13.113 ms). Se sobrar a maior
-- parte, o alvo é o corpo de get_guias_orfas — a CTE `guias` —, não mais a
-- fn_blocos_assim.


-- -----------------------------------------------------------------------------
-- 2. A CTE `guias` isolada, com o plano à mostra
-- -----------------------------------------------------------------------------
-- Cópia do corpo de get_guias_orfas (20260824010000:68-103), sem a função no
-- meio. Três candidatos a custo, em ordem de suspeita:
--
--   a) a função de janela: `row_number() over (partition by split_part(...)×3,
--      date(...), codigo_tuss order by data_execucao)` — cinco expressões por
--      linha, e um sort sobre elas
--   b) o `not exists` contra autorizacoes_vinculos, por guia
--   c) o scan de autorizacoes_assim
--
-- Sobre (c) já sei que NÃO é predicado não-sargável: existe
-- `idx_autorizacoes_assim_date_exec ON autorizacoes_assim (date(data_execucao))`,
-- índice de expressão que casa com o `date(aa.data_execucao) between p_de and
-- p_ate`. Procurar `Index Scan using idx_autorizacoes_assim_date_exec` para
-- confirmar que está sendo usado.
explain (analyze, buffers, timing)
with guias as (
  select
    aa.guia,
    aa.data_execucao,
    aa.codigo_tuss,
    aa.status,
    split_part(aa.matricula, '.', 1) as empresa,
    split_part(aa.matricula, '.', 2) as matricula_base,
    split_part(aa.matricula, '.', 3) as dep,
    row_number() over (
      partition by split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                   split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
      order by aa.data_execucao
    ) as ordem_autorizacao
  from public.autorizacoes_assim aa
  where aa.data_execucao is not null
    and date(aa.data_execucao) between date_trunc('month', current_date)::date and current_date
    and not exists (
      select 1 from public.autorizacoes_vinculos v
      where v.guia = aa.guia and v.desfeito_em is null
    )
)
select count(*) from guias;


-- -----------------------------------------------------------------------------
-- 3. O anti-join contra a fila, agora que ele tem índice
-- -----------------------------------------------------------------------------
-- É o predicado que 20260824010000 reescreveu para `between`, e que agora tem
-- idx_fila_autorizacoes_guia_horario (válido, 632 kB). Confirmar que o índice
-- está sendo usado de fato — procurar `Index Scan using
-- idx_fila_autorizacoes_guia_horario`, não `Seq Scan on fila_autorizacoes`.
explain (analyze, buffers, timing)
select count(*)
from public.autorizacoes_assim aa
where aa.data_execucao is not null
  and date(aa.data_execucao) between date_trunc('month', current_date)::date and current_date
  and not exists (
    select 1 from public.fila_autorizacoes fa
    where fa.numero_autorizacao = aa.guia
      and fa.horario_autorizacao between aa.data_execucao - interval '5 minutes'
                                     and aa.data_execucao + interval '5 minutes'
  );


-- -----------------------------------------------------------------------------
-- 4. Fechar a equivalência de 20260824020000
-- -----------------------------------------------------------------------------
-- O plano novo devolveu rows=1483, igual ao antigo — sinal forte, porque o
-- anti-join só remove linhas inteiras ANTES do agrupamento. Mas a soma de
-- sessões fecha o argumento, e é uma query.
select count(*) as blocos, sum(quantidade_sessoes) as sessoes
from public.fn_blocos_assim(current_date - 7, current_date);
-- Guardar. Comparável a qualquer medição futura da mesma janela.
