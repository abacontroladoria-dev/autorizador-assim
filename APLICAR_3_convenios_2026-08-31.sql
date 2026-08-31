-- APLICAR 3 — Cadastro curado de convênios + plano "Padrão" de cada um
--
-- Cole INTEIRO no SQL Editor do Supabase.
--
-- O QUE FAZ:
--   1. cria os 17 convênios da lista da clínica, com CNPJ/ANS/razão social só
--      onde o dado foi conferido (o resto fica em branco de propósito);
--   2. cria 1 plano "Padrão" para cada um;
--   3. inativa o convênio de teste ("Convênio 1 - Teste") e os planos dele;
--   4. registra tudo em public.cadastros_auditoria, para o Histórico da tela
--      mostrar estas criações como mostra as feitas pela UI.
--
-- MEMORIAL SAÚDE LTDA **NÃO** é criado: a operadora não existe mais e quem era
-- Memorial hoje é ASSIM SAUDE. O redirecionamento dos 22 pacientes que vêm com
-- esse nome no relatório do TiTa está em scripts/importar-favorecidos-tita.js
-- (REDIRECIONAMENTO_CONVENIO) — não aqui.
--
-- CNPJ/ANS em branco não impede faturar. Preencher com palpite, sim, atrapalha:
-- o número errado numa guia volta como glosa. Por isso só entram os cinco
-- conferidos.
--
-- IDEMPOTENTE: reaplicar não duplica nada. O índice parcial
-- convenios_nome_ativo_key é lower(nome) WHERE ativo, e todo insert daqui é
-- guardado por NOT EXISTS na mesma condição.

BEGIN;

-- ===== 1. Convênios =====
with novos(nome, razao_social, cnpj, ans) as (
  values
    -- Conferidos pela clínica em 2026-08-31. O NOME segue a grafia da lista da
    -- clínica (a mesma do relatório do TiTa), não a da conferência de CNPJ —
    -- ver 20260831140000, que corrigiu ASSIM e Amil depois desta carga.
    ('ASSIM Saúde',            'GRUPO HOSPITALAR DO RIO DE JANEIRO LTDA.',   '31.925.548/0001-76', '309222'),
    ('SULAMERICA',             'SUL AMERICA COMPANHIA DE SEGURO SAUDE',      '01.685.053/0001-56', '006246'),
    ('BRADESCO SAÚDE S.A',     'BRADESCO SAUDE S/A',                         '92.693.118/0001-60', '005711'),
    ('Amil Saude',             'AMIL ASSISTENCIA MEDICA INTERNACIONAL S.A.', '29.309.127/0001-79', '326305'),
    ('PORTO SEGURO',           'PORTO SEGURO - SEGURO SAUDE S/A',            '04.540.010/0001-70', '000582'),

    -- Operadoras cujo CNPJ/ANS varia por filial — em branco até serem
    -- conferidos um a um. A grafia é a do relatório do TiTa, que é por onde os
    -- pacientes chegam.
    ('LEVE SAUDE',             null, null, null),
    ('SEGUROS UNIMED',         null, null, null),
    ('UNIMED FERJ',            null, null, null),
    ('Unimed Nacional',        null, null, null),
    ('UNIMED - VOLTA REDONDA', null, null, null),
    ('POSTAL SAUDE',           null, null, null),
    ('CAIXA SAÚDE',            null, null, null),
    ('FuSEx',                  null, null, null),

    -- Não são operadoras: são a forma como a clínica classifica quem paga.
    -- Entram como convênio porque é o campo que o cadastro do paciente tem.
    ('Particular',             null, null, null),
    ('Gratuidade',             null, null, null),
    ('Interno',                null, null, null),
    ('Administrativo',         null, null, null)
)
insert into public.convenios (nome, razao_social, cnpj, ans, nome_usuario_responsavel)
select n.nome, n.razao_social, n.cnpj, n.ans, 'Carga inicial de convênios'
from novos n
where not exists (
  select 1 from public.convenios c
  where lower(c.nome) = lower(n.nome) and c.ativo
);

-- ===== 2. Um plano "Padrão" por convênio =====
-- Um plano só, e genérico, porque o relatório do TiTa traz UM campo ("Plano de
-- Saúde") preenchido com o nome da OPERADORA — não há, na origem, distinção de
-- produto que justifique mais de um plano. Quando houver, cadastra-se pela tela.
insert into public.planos_saude (convenio_id, nome, nome_usuario_responsavel)
select c.id, 'Padrão', 'Carga inicial de convênios'
from public.convenios c
where c.ativo
  and not exists (
    select 1 from public.planos_saude p
    where p.convenio_id = c.id and lower(p.nome) = 'padrão' and p.ativo
  );

-- ===== 3. Trilha de auditoria =====
-- Sem isto a carga fica invisível no Histórico da tela, enquanto tudo criado
-- pela UI aparece — e a diferença entre "ninguém mexeu" e "não foi registrado"
-- é justamente o que uma trilha existe para eliminar.
insert into public.cadastros_auditoria
  (tabela, registro_id, acao, convenio_nome, alvo_nome, depois, motivo)
select
  'convenio', c.id::text, 'criar', c.nome, c.nome,
  jsonb_build_object('nome', c.nome, 'razao_social', c.razao_social,
                     'cnpj', c.cnpj, 'ans', c.ans),
  'Carga inicial do cadastro de convênios da clínica'
from public.convenios c
where c.nome_usuario_responsavel = 'Carga inicial de convênios'
  and not exists (
    select 1 from public.cadastros_auditoria a
    where a.tabela = 'convenio' and a.registro_id = c.id::text and a.acao = 'criar'
  );

insert into public.cadastros_auditoria
  (tabela, registro_id, acao, convenio_nome, alvo_nome, depois, motivo)
select
  'plano_saude', p.id::text, 'criar', c.nome, p.nome,
  jsonb_build_object('nome', p.nome, 'convenio_id', p.convenio_id),
  'Carga inicial do cadastro de convênios da clínica'
from public.planos_saude p
join public.convenios c on c.id = p.convenio_id
where p.nome_usuario_responsavel = 'Carga inicial de convênios'
  and not exists (
    select 1 from public.cadastros_auditoria a
    where a.tabela = 'plano_saude' and a.registro_id = p.id::text and a.acao = 'criar'
  );

-- ===== 4. Dado de teste sai de cena =====
-- Inativa o convênio E os planos dele, que é a regra que a tela passa a aplicar
-- sozinha (convenios.service.ts, definirAtivoConvenio): plano de convênio
-- inativo não pode continuar ofertável no select da ficha médica.
update public.planos_saude p
   set ativo = false
  from public.convenios c
 where c.id = p.convenio_id
   and lower(c.nome) like 'convênio 1 - teste%'
   and p.ativo;

update public.convenios
   set ativo = false
 where lower(nome) like 'convênio 1 - teste%'
   and ativo;

COMMIT;

-- ===== CONFERÊNCIA (sai como tabela na tela) =====
select
  (select count(*) from public.convenios    where ativo)                        as convenios_ativos,
  (select count(*) from public.planos_saude where ativo)                        as planos_ativos,
  (select count(*) from public.convenios    where not ativo)                    as convenios_inativos,
  (select count(*) from public.convenios    where ativo and cnpj is not null)   as com_cnpj;
-- Esperado: 17 convênios ativos, 17 planos ativos, 1 inativo, 5 com CNPJ.

select c.nome, c.cnpj, c.ans, count(p.id) as planos
from public.convenios c
left join public.planos_saude p on p.convenio_id = c.id and p.ativo
where c.ativo
group by c.id, c.nome, c.cnpj, c.ans
order by c.nome;
