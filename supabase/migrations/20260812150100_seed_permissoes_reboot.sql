-- Permissões das novas telas do sistema próprio de agendamentos (Etapa 2):
-- cadastro de paciente/profissional e as duas rotas de cronograma (grade
-- por paciente/profissional, ainda placeholder — conteúdo visual vem na
-- Etapa 3). Ver frontend/lib/permissions/routes.ts para o mapeamento
-- codigo -> rota usado pelo Sidebar/canAccess.

INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('cadastros_pacientes', 'Cadastro de Paciente', '/cadastros/pacientes', 'Cadastros', 'Cadastro de pacientes do sistema próprio de agendamentos'),
  ('cadastros_profissionais', 'Cadastro de Profissional', '/cadastros/profissionais', 'Cadastros', 'Cadastro de profissionais e disponibilidade do sistema próprio de agendamentos'),
  ('cronograma_por_paciente', 'Por Paciente', '/cronograma/por-paciente', 'Cronograma', 'Grade de agendamentos por paciente'),
  ('cronograma_por_profissional', 'Por Profissional', '/cronograma/por-profissional', 'Cronograma', 'Grade de agendamentos por profissional')
ON CONFLICT (codigo) DO NOTHING;
