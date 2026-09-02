-- =============================================================================
-- Backfill do resumo gerencial da Auditoria ASSIM — junho/2026
-- =============================================================================
-- POR QUE ESTE ARQUIVO EXISTE
-- O modal "Visão do Período" (`/auditoria-assim?tab=auditoria` → botão) não soma
-- nada ao vivo: ele lê `auditoria_assim_resumo_diario`, que é preenchida por
-- cron. Os dois jobs de 20260824050000 cobrem `current_date - 7` (a cada 15 min)
-- e `current_date - 45` (de madrugada). Em 02/09/2026 a janela de 45 dias começa
-- em 19/07 — junho NUNCA entrou nela, e a semeadura da migration foi de 7 dias.
-- Digitar 01/06–30/06 no modal hoje devolve "Nenhuma sessão no intervalo".
--
-- POR QUE JUNHO, E POR QUE NÃO MAIO
-- O BLOCO 3 de `20260824_resumo_diario_auditoria_assim_remoto.sql` deixou junho
-- COMENTADO, sob a ressalva de que `agenda_tita` não teria volume confiável
-- antes de 01/07 (o congelamento da grade). A contagem desmente isso para junho:
--
--     mes         sessoes_assim
--     2026-05-01          2.994   ← pela metade, o congelamento morde aqui
--     2026-06-01          7.742   ← volume cheio
--     2026-07-01          7.907
--     2026-08-01          7.261
--
-- Junho é comparável a julho e agosto. Maio, não — 2.994 é ~40% de um mês
-- inteiro, então um resumo de maio mostraria um vale que é falha de carga, e não
-- queda de operação. Por isso este arquivo cobre junho e deixa maio de fora.
--
-- POR QUE EM QUINZENAS, E NÃO O MÊS DE UMA VEZ
-- `refresh_auditoria_assim_resumo` itera DIA A DIA chamando `get_auditoria_assim`
-- + `get_faltas_auditoria_assim`, e cada dia custa segundos. A função tem
-- `statement_timeout = '20min'` declarado dentro do CREATE, mas quem desiste
-- primeiro é o NAVEGADOR: o SQL Editor devolve "Failed to fetch" em comando
-- longo, e aí não se sabe se o backfill terminou ou morreu no meio. Duas
-- chamadas de ~15 dias cabem com folga e cada uma devolve seu número.
--
-- `p_forcar => true` é obrigatório: junho está muito além do corte de 45 dias,
-- então os dias nascem `fechado = true` e o caminho normal os PULARIA em
-- silêncio, devolvendo 0 sem erro nenhum.
--
-- Não há DDL aqui — nada a registrar em `supabase_migrations.schema_migrations`.
-- Este é um runbook de carga de dados, como o `robo_provisionar.sql`.
--
-- ORDEM DE EXECUÇÃO — uma linha por vez, conferindo o retorno antes de seguir.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉ-CHECAGEM — o que já existe hoje
-- ─────────────────────────────────────────────────────────────────────────────
-- Confirma o diagnóstico antes de gastar os minutos: se `primeiro_dia` já for
-- de junho, o backfill já foi feito e não há o que rodar.
select
  min(data)                        as primeiro_dia,
  max(data)                        as ultimo_dia,
  count(distinct data)             as dias,
  count(*)                         as linhas,
  count(*) filter (where fechado)  as linhas_fechadas,
  max(atualizado_em)               as ultimo_refresh
from public.auditoria_assim_resumo_diario;

-- Quanto junho tem para oferecer, por dia. É o teto do que o backfill pode
-- gravar — serve de sanidade para o número que as duas chamadas devolverem.
select count(*) as sessoes_assim_junho
from public.agenda_tita
where ativo = true
  and convenio_nome ilike '%assim%'
  and data_atendimento between '2026-06-01' and '2026-06-30';


-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL — uma linha por vez
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada uma leva alguns minutos. O retorno é quantas linhas de RESUMO a quinzena
-- gerou (combinações distintas), sempre menor que o número de sessões — é o
-- colapso por (paciente, situação, token, TUSS, terapia, sala, código de glosa)
-- que a granularidade da tabela faz.

select public.refresh_auditoria_assim_resumo('2026-06-01', '2026-06-15', true) as linhas_junho_1a_quinzena;

select public.refresh_auditoria_assim_resumo('2026-06-16', '2026-06-30', true) as linhas_junho_2a_quinzena;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA 1 — junho ficou completo?
-- ─────────────────────────────────────────────────────────────────────────────
-- Espera-se ~21 dias úteis. Dia sem movimento (fim de semana, feriado) não gera
-- linha e não é defeito; um BURACO no meio da semana é.
select
  count(distinct data) as dias_com_resumo,
  min(data)            as primeiro,
  max(data)            as ultimo,
  sum(sessoes)         as sessoes_somadas,
  count(*)             as linhas
from public.auditoria_assim_resumo_diario
where data between '2026-06-01' and '2026-06-30';

-- Dia a dia, para ver o buraco se ele existir.
select data, sum(sessoes) as sessoes, count(*) as combinacoes
from public.auditoria_assim_resumo_diario
where data between '2026-06-01' and '2026-06-30'
group by 1
order by 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA 2 — paridade contra a tela diária
-- ─────────────────────────────────────────────────────────────────────────────
-- A verificação que importa, e a razão de o desenho existir: o modal e o card do
-- dia têm de dizer o mesmo número. Escolha um dia útil de junho com movimento
-- variado. Divergência aqui não é ruído — significa que o resumo e a tela
-- discordam sobre o mesmo dia.
with esperado as (
  select situacao, count(*)::int as n
  from public.get_auditoria_assim('2026-06-10'::date)
  group by 1
  union all
  select case when tipo_falta ilike '%terapeuta%' then 'FALTA_TERAPEUTA' else 'FALTA' end, count(*)::int
  from public.get_faltas_auditoria_assim('2026-06-10'::date)
  group by 1
),
obtido as (
  select situacao, sum(sessoes)::int as n
  from public.auditoria_assim_resumo_diario
  where data = '2026-06-10'::date
  group by 1
)
select
  coalesce(e.situacao, o.situacao) as situacao,
  coalesce(e.n, 0)                 as pela_rpc,
  coalesce(o.n, 0)                 as pelo_resumo,
  case when coalesce(e.n, 0) = coalesce(o.n, 0) then 'OK' else '*** DIVERGE ***' end as veredito
from esperado e
full join obtido o using (situacao)
order by 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- DEPOIS DE RODAR
-- ─────────────────────────────────────────────────────────────────────────────
-- No app: /auditoria-assim?tab=auditoria → "Visão do Período" → De 01/06/2026,
-- Até 30/06/2026. O modal abre em `inicioDoMes()`→hoje, então junho precisa ser
-- digitado nos dois campos.
--
-- O gráfico virá SEMANAL, não diário: `DIAS_ATE_SERIE_DIARIA` em
-- frontend/hooks/useResumoGerencial.ts é 45, e junho inteiro dá 29 dias — ou
-- seja, ainda diário. Um recorte que cruze junho e julho junto passaria de 45 e
-- viraria semanal.
--
-- O rodapé dirá "atualizado <data do backfill>", que é o `now()` desta execução
-- e não a data das sessões. Está correto: é quando o número foi calculado.
--
-- O cron NÃO vai desfazer isto. A passada noturna cobre `current_date - 45` e
-- junho está fora; além disso os dias gravados nascem `fechado = true`, e a
-- função pula dia fechado. Se junho precisar ser recontado (uma glosa atrasada
-- que chegue depois), é rodar as duas linhas de backfill de novo.
