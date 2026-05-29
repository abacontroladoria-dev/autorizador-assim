alter table public.permissoes add column if not exists descricao text;

update public.permissoes set descricao = 'Acesso ao painel principal'                 where codigo = 'dashboard';
update public.permissoes set descricao = 'Solicitar e visualizar atendimentos'          where codigo = 'atendimentos';
update public.permissoes set descricao = 'Gestão de pacientes'                          where codigo = 'gestao';
update public.permissoes set descricao = 'Cronograma do paciente'                       where codigo = 'cronograma';
update public.permissoes set descricao = 'Escala e disponibilidade dos terapeutas'      where codigo = 'escala_terapeutica';
update public.permissoes set descricao = 'Agenda dos terapeutas'                        where codigo = 'agenda_terapeutica';
update public.permissoes set descricao = 'Agenda e gestão de salas'                     where codigo = 'salas';
update public.permissoes set descricao = 'Auditoria de guias ASSIM'                     where codigo = 'auditoria_assim';
update public.permissoes set descricao = 'Guias e faturamento'                          where codigo = 'guias_digitais';
update public.permissoes set descricao = 'Gestão de usuários'                           where codigo = 'usuarios';
update public.permissoes set descricao = 'Gestão de permissões'                         where codigo = 'permissoes';
