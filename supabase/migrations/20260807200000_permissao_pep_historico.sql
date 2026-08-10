-- Nova aba "PEP - Histórico": evolução mensal potencial × alcançado por
-- Analista do Comportamento, lida direto de pep_apuracao_mensal — inclusive
-- de prestadores que já saíram (não depende de upload de Grade nem de
-- roster ativo).
INSERT INTO public.permissoes (codigo, nome, rota, grupo, descricao) VALUES
  ('relacionamento_prestador_pep_historico', 'PEP - Histórico', '/relacionamento-prestador/pep-historico', 'Relacionamento Prestador', 'Evolução mensal do potencial x alcançado da PEP por Analista do Comportamento')
ON CONFLICT (codigo) DO NOTHING;
