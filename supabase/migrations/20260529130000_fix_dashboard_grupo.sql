-- Renomeia grupo 'Geral' para 'Sistema' para corresponder ao agrupamento da sidebar
update public.permissoes set grupo = 'Sistema' where codigo = 'dashboard';
