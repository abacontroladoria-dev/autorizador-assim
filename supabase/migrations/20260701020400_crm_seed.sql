-- CRM — Seed Data
-- M-C05 | CRM Block
-- Depends on:
--   20260701020100_crm_tables.sql  (crm.pipeline_stages, crm.team_functions, crm.teams)
--   20260701020300_crm_rls.sql    (não obrigatório, mas seed é o último passo CRM)
--
-- O que faz:
--   1. Cria 6 estágios de pipeline padrão para a Universo ABA
--   2. Cria 5 funções de time padrão (SDR, Closer, CS, Suporte, Marketing)
--   3. Cria 3 times de vendas padrão (Vendas, Suporte, Marketing)
--
-- Idempotente: todos os inserts usam ON CONFLICT DO NOTHING ou ON CONFLICT DO UPDATE.
-- Re-executar esta migration não cria duplicatas.
--
-- ROLLBACK (somente dados, estrutura preservada):
--   delete from crm.team_members  where organization_id = 'a0000000-0000-0000-0000-000000000001';
--   delete from crm.teams          where organization_id = 'a0000000-0000-0000-0000-000000000001';
--   delete from crm.team_functions where organization_id = 'a0000000-0000-0000-0000-000000000001';
--   delete from crm.pipeline_stages where organization_id = 'a0000000-0000-0000-0000-000000000001';

-- ============================================================================
-- INSERT: crm.pipeline_stages — funil de vendas padrão Universo ABA
--
-- UUID fixo para idempotência: permite re-executar sem duplicar.
--
-- Estágios is_system = true (Fechado/Ganho, Perdido):
--   A UI deve desabilitar o botão de exclusão para esses estágios.
--   auto_win / auto_lose: quando um deal entra neste estágio, o status
--   deve ser atualizado para 'won' / 'lost' pela aplicação.
--
-- Contexto clínico para cada estágio:
--   Novos Leads     → contato chegou pelo WhatsApp, ainda não qualificado
--   Qualificação    → responsável foi contactado, perfil em avaliação
--   Apresentação    → triagem agendada ou em andamento
--   Negociação      → proposta de matrícula enviada, aguardando decisão
--   Fechado/Ganho   → matrícula confirmada (paciente inicia tratamento)
--   Perdido         → desistência, não elegível, encaminhado para outro serviço
-- ============================================================================
insert into crm.pipeline_stages (
  id, organization_id, title, color, position, is_system, is_active, auto_win, auto_lose
) values
  (
    'c0000000-0000-0000-0001-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Novos Leads', '#6366f1', 0, false, true, false, false
  ),
  (
    'c0000000-0000-0000-0001-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Qualificação', '#8b5cf6', 1, false, true, false, false
  ),
  (
    'c0000000-0000-0000-0001-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Apresentação', '#3b82f6', 2, false, true, false, false
  ),
  (
    'c0000000-0000-0000-0001-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'Negociação', '#f59e0b', 3, false, true, false, false
  ),
  (
    'c0000000-0000-0000-0001-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'Fechado/Ganho', '#10b981', 4, true, true, true, false
  ),
  (
    'c0000000-0000-0000-0001-000000000006',
    'a0000000-0000-0000-0000-000000000001',
    'Perdido', '#ef4444', 5, true, true, false, true
  )
on conflict (organization_id, position) do update
  set
    title      = excluded.title,
    color      = excluded.color,
    is_system  = excluded.is_system,
    auto_win   = excluded.auto_win,
    auto_lose  = excluded.auto_lose,
    updated_at = now();

-- ============================================================================
-- INSERT: crm.team_functions — funções dos membros de times de vendas
--
-- UUID fixo para idempotência.
-- Contexto clínico:
--   SDR               → responsável por triagem inicial do lead via WhatsApp
--   Closer            → responsável por fechar a matrícula
--   CS                → acompanhamento pós-matrícula e retenção
--   Suporte Técnico   → dúvidas sobre plataforma e atendimento
--   Analista de Marketing → origem dos leads, campanhas
-- ============================================================================
insert into crm.team_functions (
  id, organization_id, name, description, is_active
) values
  (
    'd0000000-0000-0000-0001-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'SDR',
    'Triagem inicial de leads e qualificação via WhatsApp',
    true
  ),
  (
    'd0000000-0000-0000-0001-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Closer',
    'Fechamento de matrículas e negociação com responsáveis',
    true
  ),
  (
    'd0000000-0000-0000-0001-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'CS',
    'Customer success: acompanhamento pós-matrícula e retenção',
    true
  ),
  (
    'd0000000-0000-0000-0001-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'Suporte Técnico',
    'Suporte a dúvidas sobre atendimentos e plataforma',
    true
  ),
  (
    'd0000000-0000-0000-0001-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'Analista de Marketing',
    'Gestão de campanhas e análise de origem de leads',
    true
  )
on conflict (organization_id, name) do update
  set
    description = excluded.description,
    is_active   = excluded.is_active,
    updated_at  = now();

-- ============================================================================
-- INSERT: crm.teams — times de vendas padrão
--
-- UUID fixo para idempotência.
-- Estes são os times CRM (comercial) — distintos de central.teams (roteamento).
--
-- Comercial → SDRs e Closers trabalhando leads de matrícula
-- Suporte   → CS e Suporte Técnico para famílias já matriculadas
-- Marketing → Responsável pela geração e análise de leads
-- ============================================================================
insert into crm.teams (
  id, organization_id, name, description, color, is_active
) values
  (
    'e0000000-0000-0000-0001-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Comercial',
    'SDRs e Closers: qualificação e fechamento de matrículas',
    '#6366f1',
    true
  ),
  (
    'e0000000-0000-0000-0001-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Suporte',
    'CS e Suporte: acompanhamento de famílias matriculadas',
    '#10b981',
    true
  ),
  (
    'e0000000-0000-0000-0001-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Marketing',
    'Geração e análise de leads — campanhas e métricas de funil',
    '#f59e0b',
    true
  )
on conflict (organization_id, name) do update
  set
    description = excluded.description,
    color       = excluded.color,
    is_active   = excluded.is_active,
    updated_at  = now();
