-- O custo mensal PJ (ex.: R$2.600 de Terapia Ocupacional) é calculado pra 1
-- dia/semana COMPLETO (manhã+tarde). Quando a simulação marca só manhã ou só
-- tarde num dia, o custo daquele dia precisa ser proporcional à capacidade
-- do turno selecionado, não o dia inteiro — por isso capacidade_diária
-- (um número só) não é suficiente: precisa ser manhã e tarde separados
-- (ex.: TO = 6 manhã + 7 tarde = 13 dia completo, mas não meio a meio).
--
-- be_capacidade_diaria continua existindo (nada a migrar dela — dado antigo
-- fica, só deixa de ser a fonte usada pelo cálculo); os novos campos é que
-- alimentam lib/remuneracao/pontoEquilibrio.ts a partir de agora.

alter table public.remuneracao_taxas_especialidade
  add column if not exists be_capacidade_manha numeric,
  add column if not exists be_capacidade_tarde numeric;

-- Terapia Ocupacional: valor informado explicitamente (6 manhã + 7 tarde).
-- Fonoaudiologia/Musicoterapia ficam em branco de propósito — cada uma tem
-- seu próprio valor, a preencher em Variáveis & Taxas.
update public.remuneracao_taxas_especialidade
set be_capacidade_manha = 6, be_capacidade_tarde = 7
where especialidade = 'Terapia Ocupacional';
