-- Renomeia a tela "Valores de Convênio" para "Cadastro de Valores" e move a
-- rota de /cronograma/valores-convenio para /cronograma/cadastro-valores. O
-- código de permissão (cronograma_valores_convenio) continua o mesmo — só o
-- nome de exibição e a rota mudam.

update public.permissoes
set nome = 'Cadastro de Valores',
    rota = '/cronograma/cadastro-valores',
    descricao = 'Cadastro de valores por convênio/terapia, com exceções por paciente'
where codigo = 'cronograma_valores_convenio';
