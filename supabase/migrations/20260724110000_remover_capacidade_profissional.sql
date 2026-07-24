-- Remove a tela "Capacidade" (Cadastros → Capac. Analista Comportamento) por
-- completo. O único campo que sobrevivia (limite_cc, override por
-- profissional do limite de pacientes de Coordenador de Caso) nunca chegou a
-- ser usado na prática — nenhum profissional passou do limite padrão geral
-- (remuneracao_parametros_gerais.cc_lim_default) pra justificar um valor
-- individual. O alerta de excesso em "Rem. Mês - Previsão" continua existindo,
-- só que sempre com o valor padrão geral, sem override por profissional.

drop view if exists public.vw_remuneracao_coordenadores_caso;
drop table if exists public.remuneracao_capacidades;

-- usuarios_permissoes.permissao_codigo referencia permissoes(codigo) ON DELETE
-- CASCADE (20260529110000) — overrides individuais dessa permissão somem junto.
delete from public.permissoes where codigo = 'cadastros_capacidade';
