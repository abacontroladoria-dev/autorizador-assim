-- Fix: papel `disponibilidade_terapeuta` não lia de volta o próprio status
-- em /disponibilidade-terapeuta (2026-08-18)
--
-- Causa raiz: a Fase 2 do endurecimento de RLS (2026-08-17, ver
-- 20260817_advisors_fix_fase2_security_invoker.sql) passou
-- vw_central_terapeutica para security_invoker = true e, no mesmo dia,
-- ampliou a policy de SELECT de controle_terapeutico para cobrir os papéis
-- `recepcao` e `rp` (policy controle_terapeutico_select_gestao_escala) —
-- mas esqueceu o papel `disponibilidade_terapeuta`, que fica de fora do
-- mapa normal de permissões (frontend/lib/permissions/routes.ts:7 — "tem
-- fluxo dedicado e rota pública") e por isso não apareceu na varredura.
--
-- Efeito: a escrita (Edge Function controle-terapeutico-upsert) sempre
-- funciona porque roda com service_role, ignorando RLS. Mas a leitura de
-- volta em /disponibilidade-terapeuta usa o client do navegador com o JWT
-- da própria usuária. Como controle_terapeutico entra em
-- vw_central_terapeutica por LEFT JOIN, a linha da agenda continua
-- aparecendo (por isso a lista carrega), mas as colunas de controle_terapeutico
-- — inclusive status — somem para esse papel, caindo no
-- COALESCE(ct.status, 'pendente') da view. Resultado: para quem tem o papel
-- disponibilidade_terapeuta, todo atendimento sempre volta 'pendente', nunca
-- 'disponivel'/'indisponivel', mesmo com a escrita já confirmada no banco.
--
-- Fix: policy aditiva de SELECT (permissivas somam em OR, não estreita nada
-- existente), no mesmo padrão da controle_terapeutico_select_gestao_escala.

CREATE POLICY controle_terapeutico_select_disponibilidade_terapeuta
  ON public.controle_terapeutico
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.ativo = true
        AND u.role = 'disponibilidade_terapeuta'
    )
  );

-- Validação (rodar após aplicar, substituindo pelo uuid de um usuário real
-- com role = 'disponibilidade_terapeuta'):
--
-- set local role authenticated;
-- set local "request.jwt.claims" = '{"sub":"<uuid-do-usuario>"}';
-- select status, count(*) from vw_central_terapeutica
--   where data_atendimento = current_date group by status;
--
-- Esperado: status deixa de vir só 'pendente' e passa a refletir
-- 'disponivel'/'indisponivel' já marcados no dia.
