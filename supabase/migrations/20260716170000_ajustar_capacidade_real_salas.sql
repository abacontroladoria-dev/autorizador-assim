-- Ajuste data-driven da capacidade de salas, derivado de toda a base
-- sincronizada de csv_grades_profissionais (17.156 agendamentos "Agendado"
-- analisados, em 26 datas distintas já sincronizadas): para cada sala física,
-- calculado o número máximo de profissionais distintos observado no MESMO
-- instante exato (mesma data + hora_inicial) em qualquer momento do histórico
-- sincronizado. Isso substitui o "chute seguro" (capacidade='unico' para
-- todas) da migração de seed anterior por um valor batendo com o uso real.
--
-- Regra: max=1 -> unico (sem mudança), max=2 -> duplo, max>=3 -> multiplo.

-- 1) Duas salas físicas que existem na agenda mas não tinham sido cadastradas
--    (não apareciam na amostra de agenda_tita_autorizacao_v2 usada no seed
--    anterior, mas existem em csv_grades_profissionais).
insert into public.cronograma_salas
  (unidade_nome, nucleo, andar, numero_sala, nome_exibicao, capacidade, status, sala_nome_referencia, observacoes)
values
  ('Fazendinha', null, null, '6', 'Sala 6', 'unico', 'ativa', 'Unid. Fazendinha - Sala 6', null),
  ('Padre Miguel', null, null, '21', 'Sala 21', 'unico', 'ativa', 'Unid. Padre Miguel - Sala 21', null)
on conflict (unidade_nome, numero_sala) do nothing;

-- 2) Ajuste de capacidade (22 salas precisavam mudar de 'unico').
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Fazendinha'    and numero_sala = '1';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Fazendinha'    and numero_sala = '2';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Fazendinha'    and numero_sala = '3';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Fazendinha'    and numero_sala = '7';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Fazendinha'    and numero_sala = '11';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Fazendinha'    and numero_sala = '12';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '5';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '7';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '8';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '13';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '15';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '18';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '19';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '20';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '21';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '22';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '24';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '25';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '26';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '35';
update public.cronograma_salas set capacidade = 'duplo'    where unidade_nome = 'Realengo'       and numero_sala = '36';
update public.cronograma_salas set capacidade = 'multiplo' where unidade_nome = 'Realengo'       and numero_sala = '41';

-- Observação: 'multiplo' representa capacidade projetada de 3 (ver
-- capacidadeProjetadaSala em salasTypes.ts). Salas com pico observado de 4+
-- profissionais simultâneos (Fazendinha Sala 11 = 4, Realengo Sala 5 = 6,
-- Sala 18 = 7, Sala 21 = 5, Sala 22 = 5) ficam sob-representadas nesse bucket
-- — a % de ocupação nunca passará de 100% (o código já limita isso), mas o
-- "tamanho" da sala não reflete picos tão altos. Se isso importar para a
-- operação, seria necessário um bucket de capacidade além de 'multiplo' (não
-- implementado agora — avaliar se vale a pena numa fase futura).
