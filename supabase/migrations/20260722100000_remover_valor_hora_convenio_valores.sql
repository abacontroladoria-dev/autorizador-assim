-- O sistema deixou de trabalhar com "Valor Hora" — toda sessão (inclusive
-- Processo Diagnóstico, que antes era cobrado por hora real) passa a ser
-- precificada só por "Valor Sessão". Todos os valores já estavam zerados
-- antes dessa migration (confirmado pelo usuário), então não há dado real
-- sendo perdido aqui.

alter table public.cronograma_convenio_valores drop column if exists valor_hora;
alter table public.cronograma_convenio_valores_paciente drop column if exists valor_hora;
