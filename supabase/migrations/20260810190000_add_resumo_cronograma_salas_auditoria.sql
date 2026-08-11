-- Pedido do usuário (2026-08-10): a planilha da trilha de auditoria de
-- Ocupação de Salas precisa deixar claro, sem abrir o JSON de antes/depois,
-- o que exatamente mudou (núcleo? capacidade? status?). Resumo é calculado no
-- frontend (registrarAuditoriaSala, via lib/cronograma/auditoriaFormat.ts) e
-- gravado pronto — "Núcleo: Terapia ABA → Especialidades Terapêuticas".

ALTER TABLE public.cronograma_salas_auditoria
  ADD COLUMN IF NOT EXISTS resumo text;
