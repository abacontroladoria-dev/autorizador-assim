-- Cobre o subquery DISTINCT ON (profissional_id) ORDER BY profissional_id
-- que fazia full table scan em cada consulta da vw_central_terapeutica
CREATE INDEX IF NOT EXISTS idx_agenda_tita_profissional_id
  ON public.agenda_tita (profissional_id, profissional_nome);
