-- Seed dos defaults NÃO sensíveis de remuneracao_config
-- (portado de calculadora-remuneracao/src/constants/{taxas,config,feriados}.js).
-- Nenhum salário/contrato aqui — isso é importado via app (Passo 9).
--
-- Formato de `feriados`: cada data mapeia para {nome, tipo: "integral"|"parcial", parcial_a_partir?}.
-- Regra de negócio para o Passo 5/6 (classificarSessaoReal / calcularRemuneracaoReal):
--   - Feriado "integral" sem evolução → NÃO conta como "⚠️ Registro não realizado".
--   - Feriado "integral" COM evolução → classificar como "❓ Analisar Inconsistência"
--     ("Evolução em data de feriado").
--   - Feriado "parcial" (ex.: 2026-06-29, ponto facultativo a partir das 13:00) → sessões
--     antes de `parcial_a_partir` seguem regra normal; a partir desse horário, mesma regra
--     do feriado integral acima.

INSERT INTO remuneracao_config (
  taxas_pa, diarias, cc_pa_default, cc_pe_default, cc_lim_default,
  eta_bonus_default, dow_pt, feriados
)
SELECT
  '{
    "Aplicador ABA (AE)": 30,
    "Aplicador ABA (EF)": 30,
    "Aplicador ABA (HS)": 30,
    "Aplicador ABA (PS)": 30,
    "Aplicador ABA (SF)": 30,
    "Aplicador ABA Casa": 30,
    "Aplicador ABA Escola": 30,
    "Aplicador Suporte": 30,
    "Musicoterapia": 30,
    "Fonoaudiologia": 30,
    "Terapia Ocupacional": 35,
    "Fisioterapia": 30,
    "Fisioterapia Aquática": 30,
    "Psicologia": 30,
    "Psicomotricidade": 30,
    "Psicopedagogia": 30,
    "Terapia Alimentar": 30,
    "Arteterapia": 30,
    "Equoterapia": 30,
    "Supervisão ABA": 30,
    "Habilidades Sociais (Psicologia ABA)": 30,
    "Facilitador Técnico": 30,
    "Especialista Técnico de Área": 50,
    "Técnico Terapêutico Particular": 30,
    "OFERECER CONSULTA NUTRIÇÃO": 30,
    "Coordenador de Caso": 35.00
  }'::jsonb,
  '{
    "Aplicador ABA (AE)": 0,
    "Aplicador ABA (EF)": 0,
    "Aplicador ABA (HS)": 0,
    "Aplicador ABA (PS)": 0,
    "Aplicador ABA (SF)": 0,
    "Aplicador ABA Casa": 30,
    "Aplicador ABA Escola": 30,
    "Aplicador Suporte": 0,
    "Musicoterapia": 200,
    "Fonoaudiologia": 300,
    "Terapia Ocupacional": 350,
    "Fisioterapia": 0,
    "Fisioterapia Aquática": 0,
    "Terapia Alimentar": 0,
    "Psicologia": 0,
    "Psicomotricidade": 0,
    "Psicopedagogia": 0,
    "Arteterapia": 0,
    "Equoterapia": 0,
    "Supervisão ABA": 0,
    "Habilidades Sociais (Psicologia ABA)": 0,
    "Facilitador Técnico": 0,
    "Especialista Técnico de Área": 350,
    "Técnico Terapêutico Particular": 0,
    "OFERECER CONSULTA NUTRIÇÃO": 0,
    "Coordenador de Caso": 0
  }'::jsonb,
  35.00,
  133.34,
  18,
  500,
  '{"1": "Seg", "2": "Ter", "3": "Qua", "4": "Qui", "5": "Sex"}'::jsonb,
  '{
    "2026-01-01": {"nome": "Confraternização Universal", "tipo": "integral"},
    "2026-04-03": {"nome": "Sexta-feira Santa", "tipo": "integral"},
    "2026-04-21": {"nome": "Tiradentes", "tipo": "integral"},
    "2026-05-01": {"nome": "Dia do Trabalho", "tipo": "integral"},
    "2026-06-04": {"nome": "Corpus Christi (Corpo de Cristo)", "tipo": "integral"},
    "2026-06-29": {"nome": "Ponto facultativo — Jogo da Seleção Brasileira Copa 2026", "tipo": "parcial", "parcial_a_partir": "13:00"},
    "2026-09-07": {"nome": "Independência do Brasil", "tipo": "integral"},
    "2026-10-12": {"nome": "N. S. Aparecida", "tipo": "integral"},
    "2026-11-02": {"nome": "Finados", "tipo": "integral"},
    "2026-11-15": {"nome": "Proclamação da República", "tipo": "integral"},
    "2026-11-20": {"nome": "Consciência Negra", "tipo": "integral"},
    "2026-12-25": {"nome": "Natal", "tipo": "integral"},
    "2025-01-01": {"nome": "Confraternização Universal", "tipo": "integral"},
    "2025-04-18": {"nome": "Sexta-feira Santa", "tipo": "integral"},
    "2025-04-21": {"nome": "Tiradentes", "tipo": "integral"},
    "2025-05-01": {"nome": "Dia do Trabalho", "tipo": "integral"},
    "2025-06-19": {"nome": "Corpus Christi (Corpo de Cristo)", "tipo": "integral"},
    "2025-09-07": {"nome": "Independência do Brasil", "tipo": "integral"},
    "2025-10-12": {"nome": "N. S. Aparecida", "tipo": "integral"},
    "2025-11-02": {"nome": "Finados", "tipo": "integral"},
    "2025-11-15": {"nome": "Proclamação da República", "tipo": "integral"},
    "2025-11-20": {"nome": "Consciência Negra", "tipo": "integral"},
    "2025-12-25": {"nome": "Natal", "tipo": "integral"}
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM remuneracao_config);
