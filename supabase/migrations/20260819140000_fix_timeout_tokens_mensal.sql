-- Fix "canceling statement due to statement timeout" ao abrir Token Mensal.
--
-- get_tokens_mensal(mes) reusa get_auditoria_assim_periodo() sobre o mês
-- inteiro (~30 dias) em vez de 1 dia só, como get_auditoria_assim(data) faz.
-- O statement_timeout padrão herdado pela role authenticated via PostgREST
-- é curto demais pra esse volume de linhas/joins.
--
-- Mesmo padrão já usado em refresh_dashboard_kpis/get_dashboard_kpis
-- (20260708010000): SET statement_timeout na própria função, sem tocar no
-- timeout global da role authenticated (que continua curto pras outras RPCs).

ALTER FUNCTION public.get_tokens_mensal(date) SET statement_timeout = '30s';
