-- Remove Terapia Ocupacional da BLACKLIST_AUTORIZACAO para que passe a
-- aparecer em vw_blocos_autorizaveis_assim e, consequentemente, em
-- vw_auditoria_autorizacoes_assim como qualquer outra terapia.
UPDATE public.config_regras_terapias
SET ativo = false
WHERE categoria = 'BLACKLIST_AUTORIZACAO'
  AND terapia_nome ILIKE '%Terapia Ocupacional%';
