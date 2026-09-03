-- =============================================================================
-- Contraprova — 20260903010000 (forma_autorizacao segue a ASSIM)
-- =============================================================================
-- SOMENTE LEITURA. Rodar DEPOIS de aplicar a migration.
--
-- A migration muda só o RÓTULO de uma coluna: o COALESCE de forma_autorizacao
-- ganhou o degrau do meio (o biofacial da guia pareada por POSIÇÃO), então a
-- tela passa a mostrar a resposta da ASSIM em vez do clique da recepção.
-- Nenhuma sessão entra ou sai da Conferência.
--
-- NOTA: `get_tokens_mensal` tem statement_timeout de 30s e varre o mês. Rodar
-- um bloco por vez.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- BLOCO 1 — o `8-` SEM token
-- ---------------------------------------------------------------------------
-- ESPERADO: uma única linha, 'Dispositivo indisponível' com count 6.
--
-- ANTES da migration eram três rótulos diferentes para o mesmo fato, e quatro
-- das seis mentiam (afirmavam token numa sessão sem token):
--   Token                      3
--   Dispositivo indisponível   2
--   QR Code                    1
select
  t.forma_autorizacao,
  count(*) as linhas
from public.get_tokens_mensal('2026-08-01') t
join public.autorizacoes_assim aa on aa.guia = t.guia
where split_part(btrim(coalesce(aa.biofacial, '')), '-', 1) = '8'
  and aa.teve_token is distinct from true
group by 1
order by 2 desc;


-- ---------------------------------------------------------------------------
-- BLOCO 2 — o `8-` COM token
-- ---------------------------------------------------------------------------
-- ESPERADO: uma única linha, 'Token' com count 57.
--
-- ANTES havia duas linhas lendo 'Erro no Reconhecimento Facial' TENDO token
-- (guias 78387 e 166677) — o mesmo bug, no subconjunto que já entrava pela
-- Semente 1. `forma_validacao_do_biofacial` devolve 'Token' para `8-` + token,
-- então agora as 57 concordam.
select
  t.forma_autorizacao,
  count(*) as linhas
from public.get_tokens_mensal('2026-08-01') t
join public.autorizacoes_assim aa on aa.guia = t.guia
where split_part(btrim(coalesce(aa.biofacial, '')), '-', 1) = '8'
  and aa.teve_token = true
group by 1
order by 2 desc;


-- ---------------------------------------------------------------------------
-- BLOCO 3 — o total NÃO muda
-- ---------------------------------------------------------------------------
-- O WHERE final ficou intocado, então o conjunto de sessões é o mesmo de antes
-- desta migration (mas DEPOIS da 20260903000000, que acrescentou as 6).
-- Se este número mudou, algo saiu do escopo.
select count(*) as total_agosto   from public.get_tokens_mensal('2026-08-01');

select count(*) as total_setembro from public.get_tokens_mensal('2026-09-01');


-- ---------------------------------------------------------------------------
-- BLOCO 4 — varredura: onde a tela ainda discorda da ASSIM
-- ---------------------------------------------------------------------------
-- Não se limita ao `8-`: compara, em TODO o mês, o rótulo exibido contra o que
-- o biofacial do relatório diz. Toda linha devolvida aqui é um caso em que a
-- Conferência mostra a intenção da recepção porque a ASSIM não respondeu
-- (`biofacial` nulo) ou trouxe código desconhecido — 4, 5, 6, 7 e qualquer
-- coisa nova, que `forma_validacao_do_biofacial` mapeia para NULL de propósito
-- (20260821080000:44-49, "código desconhecido não vira chute").
--
-- ESPERADO: nenhuma linha com `biofacial` preenchido E prefixo conhecido. As
-- que aparecerem com prefixo 4/5/6/7 são vocabulário novo da ASSIM a mapear —
-- achado legítimo, não regressão desta migration.
select
  aa.biofacial,
  split_part(btrim(coalesce(aa.biofacial, '')), '-', 1) as prefixo,
  aa.teve_token,
  t.forma_autorizacao                                    as exibido_na_tela,
  public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token) as diz_a_assim,
  count(*)                                               as linhas
from public.get_tokens_mensal('2026-08-01') t
join public.autorizacoes_assim aa on aa.guia = t.guia
where public.forma_validacao_do_biofacial(aa.biofacial, aa.teve_token)
        is distinct from t.forma_autorizacao
group by 1, 2, 3, 4, 5
order by 6 desc;
