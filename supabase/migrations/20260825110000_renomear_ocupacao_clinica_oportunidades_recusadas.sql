-- Renomeia a permissão 'ocupacao_clinica' ("Aceites e Recusas") para
-- "Oportunidades recusadas", acompanhando a mudança de nome no sidebar e a
-- troca da rota de ?tab=acompanhamento para ?tab=oportunidades-recusadas
-- (ver OcupacaoShell.tsx e Sidebar.tsx). Só UPDATE — o código permanece
-- 'ocupacao_clinica', então todos os overrides de acesso já concedidos
-- continuam valendo sem precisar ser refeitos.

update public.permissoes
  set nome = 'Oportunidades recusadas',
      rota = '/cronograma/ocupacao?tab=oportunidades-recusadas'
  where codigo = 'ocupacao_clinica';
