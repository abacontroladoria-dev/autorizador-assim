ALTER TABLE public.substituicoes_historico
  ADD COLUMN IF NOT EXISTS fora_da_especialidade BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_excecao TEXT;

COMMENT ON COLUMN public.substituicoes_historico.fora_da_especialidade IS
  'TRUE quando profissional_substituto_nome não pertence à matriz terapiasCompativeis() da terapia_real da sessão.';
COMMENT ON COLUMN public.substituicoes_historico.motivo_excecao IS
  'Motivo obrigatório digitado pelo usuário quando fora_da_especialidade = TRUE. NULL quando a substituição segue a matriz de compatibilidade padrão.';

ALTER TABLE public.substituicoes_historico
  ADD CONSTRAINT chk_subst_hist_motivo_excecao
  CHECK (NOT fora_da_especialidade OR (motivo_excecao IS NOT NULL AND btrim(motivo_excecao) <> ''));

CREATE INDEX IF NOT EXISTS idx_subst_hist_fora_especialidade
  ON public.substituicoes_historico (fora_da_especialidade)
  WHERE fora_da_especialidade;
