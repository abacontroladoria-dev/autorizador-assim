-- Renomeia a nomenclatura enganosa completion_type='manual' -> 'presenca'.
-- 'manual' dava a falsa impressao de autorizacao obtida fora do Sistema Pulsar;
-- na realidade sinaliza apenas "paciente != ASSIM" (sem fluxo de autorizacao automatizada).
update public.fila_autorizacoes
set completion_type = 'presenca',
    numero_autorizacao = 'N/A'
where completion_type = 'manual';
