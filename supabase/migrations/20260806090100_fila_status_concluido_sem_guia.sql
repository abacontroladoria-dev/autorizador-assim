-- 'concluido_sem_guia' já era tratado em todo o resto do sistema — severity.ts:131,
-- SidePanel.tsx:37, solicitar/page.tsx:464,1102 e o CASE de status_final em
-- listar_central_autorizacoes — mas `chk_status` nunca o aceitou. Na prática era um
-- status fantasma: qualquer tentativa de gravá-lo estourava violação de constraint,
-- então o RPA gravava 'concluido' mesmo quando não conseguia capturar a guia, e a
-- sessão ficava verde ("Autorizado") com o campo Guia vazio.
--
-- Caso que expôs isso: Alvaro Soares Da Silva, 05/08/2026, sessões de 13:00 e 13:40 —
-- autorizadas de fato na ASSIM em 03/08 (guias 5401 e 3883), mas sem vínculo algum
-- em fila_autorizacoes, e sem nada na tela sinalizando a lacuna.

ALTER TABLE public.fila_autorizacoes DROP CONSTRAINT IF EXISTS chk_status;

ALTER TABLE public.fila_autorizacoes ADD CONSTRAINT chk_status CHECK (
  status = ANY (ARRAY[
    'pendente'::text,
    'processando'::text,
    'executando'::text,
    'concluido'::text,
    'concluido_sem_guia'::text,
    'erro'::text,
    'falta'::text,
    'glosa'::text,
    'cancelado'::text
  ])
);
