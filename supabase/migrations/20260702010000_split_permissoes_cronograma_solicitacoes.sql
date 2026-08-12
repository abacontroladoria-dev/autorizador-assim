-- Separa 'cronograma_solicitacoes' em códigos independentes para "Saída de
-- Profissional" e "Ocupação de Paciente", que viraram rotas dedicadas
-- (/cronograma/saida-profissional e /cronograma/ocupacao-paciente) para
-- poderem ser concedidas por usuário sem depender uma da outra.
-- 'cronograma_solicitacoes' passa a cobrir só as abas restantes de
-- /cronograma/solicitacoes (Simulação, Aumentar Ocupação Profissional, Novo Cronograma).

update public.permissoes
set nome = 'Cronograma · Outras Abas',
    descricao = 'Simulação de novo prestador, aumento de ocupação por profissional e novo cronograma'
where codigo = 'cronograma_solicitacoes';

insert into public.permissoes (codigo, nome, rota, grupo, descricao) values
  ('cronograma_saida_profissional', 'Saída de Profissional', '/cronograma/saida-profissional', 'Cronograma', 'Análise de impacto e redistribuição de sessões na saída de um profissional'),
  ('cronograma_ocupacao_paciente', 'Ocupação de Paciente', '/cronograma/ocupacao-paciente', 'Cronograma', 'Aumento de ocupação de sessões por paciente')
on conflict (codigo) do nothing;
