-- Nova rota dedicada /cronograma/disponibilidade-interna (checagem de
-- disponibilidade de profissionais já contratados, incluindo remanejamento,
-- antes de sugerir contratação — ver lib/cronograma/disponibilidadeInterna.ts).
-- Mesmo padrão de cronograma_ocupacao_paciente: código próprio pra poder ser
-- concedido por usuário sem depender de outras permissões de Cronograma.

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cronograma_disponibilidade_interna', 'Disponibilidade Interna', '/cronograma/disponibilidade-interna', 'Cronograma', 'Verifica se um profissional já contratado (direto ou via remanejamento) cobre uma necessidade antes de abrir vaga de contratação')
on conflict (codigo) do nothing;
