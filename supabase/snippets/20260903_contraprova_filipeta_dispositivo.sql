-- =============================================================================
-- Contraprova — 20260903000000 (filipeta por 8-DISPOSITIVO INDISPONIVEL)
-- =============================================================================
-- SOMENTE LEITURA. Rodar DEPOIS de aplicar a migration.
--
-- A migration só ACRESCENTA linhas à Conferência de Filipetas; nenhuma sai.
-- Estes três blocos medem quanto ela acrescentou e provam que as linhas novas
-- são exatamente as do `8-`.
--
-- NOTA: `get_tokens_mensal` tem statement_timeout de 30s e varre o mês. Rodar
-- um bloco por vez.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- BLOCO 1 — quantas partições do mês têm `8-` SEM token
-- ---------------------------------------------------------------------------
-- É o buraco que a migration fecha: com token a Semente 1 já pegava, sem token
-- a partição não entrava por porta nenhuma. Se vier 0, o mês não tinha o caso
-- e o total do Bloco 2 não muda — o que NÃO significa que a regra não funciona.
select
  count(*)                                              as linhas_8_sem_token,
  count(distinct concat_ws('_',
    split_part(aa.matricula, '.', 1),
    split_part(aa.matricula, '.', 2),
    split_part(aa.matricula, '.', 3),
    date(aa.data_execucao),
    aa.codigo_tuss))                                    as particoes_afetadas
from public.autorizacoes_assim aa
where date(aa.data_execucao) >= date '2026-08-01'
  and date(aa.data_execucao) <  date '2026-09-01'
  and split_part(btrim(coalesce(aa.biofacial, '')), '-', 1) = '8'
  and aa.teve_token is distinct from true;


-- ---------------------------------------------------------------------------
-- BLOCO 2 — o total do mês na Conferência
-- ---------------------------------------------------------------------------
-- Comparar com o número que você tinha ANTES de aplicar. Deve subir (ou ficar
-- igual, se o Bloco 1 devolveu 0). Nunca descer — se descer, algo saiu, e a
-- migration não tira nada: sinal de que a versão aplicada não é esta.
select count(*) as total_agosto from public.get_tokens_mensal('2026-08-01');

select count(*) as total_setembro from public.get_tokens_mensal('2026-09-01');


-- ---------------------------------------------------------------------------
-- BLOCO 3 — as linhas que entraram pela porta nova, nomeadas
-- ---------------------------------------------------------------------------
-- Cruza a Conferência com o biofacial da guia exibida. `forma_autorizacao`
-- deve ler 'Dispositivo indisponível' nas linhas sem token e 'Token' nas com
-- token — os dois rótulos que forma_validacao_do_biofacial devolve para o `8-`.
select
  t.data_atendimento,
  t.hora_inicial,
  t.paciente_nome,
  t.terapias,
  t.guia,
  t.token,
  t.forma_autorizacao,
  aa.biofacial,
  aa.teve_token,
  case when aa.teve_token then 'já entrava (Semente 1, token)'
       else 'ENTROU PELA REGRA NOVA (8- sem token)' end as porta_de_entrada
from public.get_tokens_mensal('2026-08-01') t
join public.autorizacoes_assim aa on aa.guia = t.guia
where split_part(btrim(coalesce(aa.biofacial, '')), '-', 1) = '8'
order by aa.teve_token, t.data_atendimento, t.hora_inicial;
