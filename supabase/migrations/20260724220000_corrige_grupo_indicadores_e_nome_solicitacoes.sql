-- Achado do usuário (2026-07-24) testando a tela de permissões: os códigos
-- de Indicadores estavam com grupo='Cronograma' (herdado do código
-- original ocupacao_profissionais, criado antes de existir um menu
-- "Indicadores" separado no Sidebar) — por isso apareciam misturados com
-- Cronograma na tela de Permissões, embora o Sidebar já os separe
-- visualmente há tempo. Move pro próprio grupo "Indicadores".
update public.permissoes
  set grupo = 'Indicadores'
  where codigo in (
    'ocupacao_profissionais',
    'indicadores_ocupacao_unidades',
    'indicadores_pacientes',
    'indicadores_previsao_receitas',
    'indicadores_comparativo_sessoes'
  );

-- "Cronograma · Outras Abas" era o nome de cronograma_solicitacoes de quando
-- a rota /cronograma/solicitacoes tinha 3 abas (Simulação, Aumentar
-- Ocupação, Novo Cronograma). As outras duas foram removidas do Sidebar
-- nesta mesma sessão (merge de 2026-07-24, ver Sidebar.tsx) - só sobrou
-- "Simulação de Novo Prestador", então o nome genérico ficou obsoleto.
update public.permissoes
  set nome = 'Simulação de Novo Prestador'
  where codigo = 'cronograma_solicitacoes';
