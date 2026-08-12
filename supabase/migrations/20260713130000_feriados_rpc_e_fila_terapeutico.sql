-- Correções do code-review da tela "Análise de Tratativas" (escopo Terapêutico).
--
-- Contexto: a tela é acessível pelos roles 'terapeutico' e 'diretoria', mas o
-- 'terapeutico' não tinha SELECT em remuneracao_config nem em fila_autorizacoes.
-- Como RLS bloqueia SELECT retornando LINHAS VAZIAS (não erro), as leituras
-- falhavam silenciosamente: feriados sumiam e a presença caía no fallback "Sim",
-- distorcendo as contagens só para esse role.

-- ── #1 — Feriados SEM expor taxas ────────────────────────────────────────────
-- RLS é row-level: liberar SELECT em remuneracao_config para 'terapeutico'
-- vazaria taxas_pa/diárias/valores de CC (proibido nesta tela). Em vez disso,
-- expomos SOMENTE a coluna feriados via função SECURITY DEFINER, que roda como
-- owner e devolve apenas o JSON de feriados — nenhum valor monetário sai daqui.
CREATE OR REPLACE FUNCTION public.get_remuneracao_feriados()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT feriados
  FROM public.remuneracao_config
  ORDER BY updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_remuneracao_feriados() FROM public;
GRANT EXECUTE ON FUNCTION public.get_remuneracao_feriados() TO authenticated;

-- ── #2 — Presença: fila_autorizacoes para 'terapeutico' ─────────────────────
-- fila_autorizacoes não contém valores monetários (é a fila de autorização /
-- presença, mesma fonte usada em Reposição de Faltas). Liberamos apenas SELECT
-- para 'terapeutico'; escrita continua restrita às policies existentes.
DROP POLICY IF EXISTS "fila_autorizacoes_terapeutico_select" ON public.fila_autorizacoes;
CREATE POLICY "fila_autorizacoes_terapeutico_select"
  ON public.fila_autorizacoes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.role = 'terapeutico'
        AND u.ativo = true
    )
  );
