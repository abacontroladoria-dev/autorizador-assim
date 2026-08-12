-- Corrige o agrupamento de permissões após mover Ocupação de Salas,
-- Simulação de Novo Prestador e Ocupar Profissionais Disponíveis de
-- Cronograma para Relacionamento Prestador no menu (rotas já atualizadas em
-- frontend/lib/permissions/routes.ts) — a tela /admin/permissoes lê
-- grupo/rota da tabela permissoes, não do CODIGO_PARA_ROTAS do frontend,
-- então sem esta migration os módulos continuavam listados sob "Cronograma".

update public.permissoes
set grupo = 'Relacionamento Prestador',
    rota = '/relacionamento-prestador/ocupacao-salas'
where codigo = 'cronograma_ocupacao_salas';

update public.permissoes
set grupo = 'Relacionamento Prestador',
    rota = '/relacionamento-prestador/ocupar-profissionais-disponiveis'
where codigo = 'cronograma_disponibilidade_interna';

-- 'cronograma_solicitacoes' cobria "Simulação, Aumentar Ocupação
-- Profissional e Novo Cronograma" (ver migration 20260702010000) — as
-- outras duas abas nunca ficaram acessíveis por rota nenhuma, então hoje o
-- código cobre só a Simulação. Nome/descrição atualizados para refletir isso.
update public.permissoes
set grupo = 'Relacionamento Prestador',
    rota = '/relacionamento-prestador/solicitacoes',
    nome = 'Simulação de Novo Prestador',
    descricao = 'Simulação de novo prestador por unidade/dia/turno/especialidade, com sugestão automática de contratação e disponibilidade interna'
where codigo = 'cronograma_solicitacoes';

-- "Legenda" e "Histórico" de Relacionamento Prestador foram removidos do
-- sistema (abas não usadas, poluíam o menu) — mesmo padrão de limpeza que a
-- migration 20260706000008 usou ao trocar 'relacionamento_prestador' por
-- permissões granulares.
delete from public.usuarios_permissoes where permissao_codigo in ('relacionamento_prestador_historico', 'relacionamento_prestador_legenda');
delete from public.permissoes where codigo in ('relacionamento_prestador_historico', 'relacionamento_prestador_legenda');
