-- Corrige a grafia de dois nomes de convênio.
--
-- A carga inicial (APLICAR_3_convenios_2026-08-31) tirou o nome de dois lugares
-- diferentes: a lista de convênios da clínica, em caixa mista, e a conferência
-- de CNPJ/ANS, digitada em caixa alta. Onde os dois discordavam, o segundo
-- venceu — e a tela passou a mostrar "ASSIM SAUDE" e "AMIL SAUDE" no lugar de
-- "ASSIM Saúde" e "Amil Saude".
--
-- Vale a grafia da lista da clínica: é ela que aparece no relatório do TiTa e é
-- por ela que a recepção reconhece a operadora.
--
-- SEGURO PARA O VÍNCULO: o paciente aponta para o PLANO
-- (pacientes_ficha_medica.plano_saude_id), não para o nome do convênio, então
-- renomear não desfaz nenhuma das 581 ligações. E o casamento do import
-- (scripts/importar-favorecidos-tita.js) compara por chavePlano() — sem acento,
-- caixa alta —, então "ASSIM Saúde" e "ASSIM SAUDE" são a mesma chave para ele.

update public.convenios
   set nome = 'ASSIM Saúde'
 where nome = 'ASSIM SAUDE';

update public.convenios
   set nome = 'Amil Saude'
 where nome = 'AMIL SAUDE';

-- ===== CONFERÊNCIA =====
select c.nome, c.cnpj, c.ans
from public.convenios c
where c.ativo
  and c.cnpj is not null
order by c.nome;
-- Esperado: os 5 com CNPJ, agora com "Amil Saude" e "ASSIM Saúde" em caixa
-- mista, mais BRADESCO SAÚDE S.A, PORTO SEGURO e SULAMERICA como já estavam.
