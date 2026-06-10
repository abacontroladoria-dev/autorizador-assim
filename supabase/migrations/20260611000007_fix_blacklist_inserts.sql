-- Verifica se a tabela exists e insere os registros de blacklist
-- com melhor tratamento de erros

BEGIN;

-- Confirmar que a tabela existe
-- (Se não existir, a migration falhará aqui, o que é o esperado)

-- Limpar registros antigos duplicados
DELETE FROM public.config_regras_terapias
WHERE categoria = 'BLACKLIST_AUTORIZACAO'
  AND terapia_nome IN ('Aplicador ABA Escola', 'Aplicador ABA Casa')
  AND ativo = false;

-- Inserir os registros de blacklist (ativo = true)
INSERT INTO public.config_regras_terapias (categoria, terapia_nome, ativo)
SELECT 'BLACKLIST_AUTORIZACAO', 'Aplicador ABA Escola', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.config_regras_terapias
  WHERE categoria = 'BLACKLIST_AUTORIZACAO'
    AND terapia_nome = 'Aplicador ABA Escola'
    AND ativo = true
);

INSERT INTO public.config_regras_terapias (categoria, terapia_nome, ativo)
SELECT 'BLACKLIST_AUTORIZACAO', 'Aplicador ABA Casa', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.config_regras_terapias
  WHERE categoria = 'BLACKLIST_AUTORIZACAO'
    AND terapia_nome = 'Aplicador ABA Casa'
    AND ativo = true
);

COMMIT;

-- Verificação final
SELECT categoria, terapia_nome, ativo
FROM public.config_regras_terapias
WHERE categoria = 'BLACKLIST_AUTORIZACAO' AND ativo = true
ORDER BY terapia_nome;
