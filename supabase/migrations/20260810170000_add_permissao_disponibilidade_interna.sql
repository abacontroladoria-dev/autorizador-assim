-- Nova rota dedicada /cronograma/ocupar-profissionais-disponiveis (checagem de
-- disponibilidade de profissionais já contratados, incluindo remanejamento,
-- antes de sugerir contratação — ver lib/cronograma/disponibilidadeInterna.ts).
-- Mesmo padrão de cronograma_ocupacao_paciente: código próprio pra poder ser
-- concedido por usuário sem depender de outras permissões de Cronograma.

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cronograma_disponibilidade_interna', 'Ocupar Profissionais Disponíveis', '/cronograma/ocupar-profissionais-disponiveis', 'Cronograma', 'Verifica se um profissional já contratado (direto ou via remanejamento) cobre uma necessidade antes de abrir vaga de contratação')
on conflict (codigo) do nothing;
