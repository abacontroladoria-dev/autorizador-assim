-- =============================================================================
-- DIAGNÓSTICO — guia 26905 rotulada "Outra semana" e indisponível para vínculo
-- 2026-09-03 · SOMENTE LEITURA (nenhum insert/update/delete/DDL)
-- =============================================================================
--
-- O CASO
-- Guia 26905, paciente_id 11691, matrícula ......0750812..,
-- data_execucao 2026-09-01 17:36, status 'Liberado', TUSS 22070384,
-- biofacial '1-ERRO NO RECONHECIMENTO FA'. Segundo a operação é a substituição
-- de uma glosa do MESMO dia, e deveria estar disponível para ser vinculada.
--
-- A DEDUÇÃO QUE ESTE SNIPPET TESTA
-- "Outra semana" NÃO é cálculo de data: é o fundo de uma cadeia de `else`
-- (CartaoAtendimento.tsx:120-124 sobre estadoDeUmaGuia, useAnaliseReincidencia
-- .ts:308-318). Para ser VINCULÁVEL a guia precisa sair de `get_guias_orfas`
-- (estado 'sem-vinculo', rótulo "Sem vínculo"); para ler "Outra semana" ela
-- precisa ter FALHADO esse teste. Os dois ramos são mutuamente exclusivos, logo
-- o rótulo observado é prova de que a 26905 não está saindo de get_guias_orfas.
-- O rótulo é sintoma. A exclusão real está numa cláusula da RPC.
--
-- COMO USAR
-- Rodar bloco por bloco no SQL Editor. Cada bloco imprime um `veredito` legível.
-- O bloco 1 é o teste direto; os blocos 3, 4 e 5 dizem QUAL cláusula a matou;
-- o 6 detalha o porquê no caso da sessão não contada; o 7 mede um segundo bug,
-- independente do primeiro.
--
-- REFERÊNCIA DA DEFINIÇÃO VIGENTE (confirmada como a mais recente das 3)
--   get_guias_orfas  → 20260824010000_orfas_usam_o_indice_da_guia.sql:39-129
--   fn_blocos_assim  → 20260824020000_fn_blocos_assim_cast_do_lado_certo.sql:90-186
--
-- NOTA DE FUSO (reference_fila_autorizacoes_dois_fusos)
-- `data_execucao` é `timestamp without time zone` em hora de SP.
-- `fila_autorizacoes.horario_autorizacao` também é hora de SP — é a coluna
-- certa para comparar. `created_at`/`updated_at`/`completed_at` da mesma tabela
-- são UTC e NÃO servem aqui (o updated_at 20:39 da linha original é UTC, ~3h à
-- frente do data_execucao 17:36 — não é divergência, é fuso).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 0 — a linha crua, com a matrícula já fatiada como a RPC a fatia
-- -----------------------------------------------------------------------------
-- Confere que empresa/matricula/dep saem '000000' / '0750812' / '00'. É a chave
-- do left join com n_sessoes; se vier diferente, o bloco 5 explica sozinho.
select
  aa.guia,
  aa.paciente_id,
  aa.paciente_nome,
  aa.matricula,
  split_part(aa.matricula, '.', 1) as empresa,
  split_part(aa.matricula, '.', 2) as matricula_base,
  split_part(aa.matricula, '.', 3) as dep,
  aa.data_execucao,
  date(aa.data_execucao)           as dia_execucao,
  aa.data_autorizacao,
  aa.status,
  aa.codigo_tuss,
  aa.codigo_erro,
  aa.descricao_erro,
  aa.teve_token,
  aa.biofacial,
  aa.updated_at
from public.autorizacoes_assim aa
where aa.guia = '26905'
  and date(aa.data_execucao) between date '2026-08-25' and date '2026-09-02';


-- -----------------------------------------------------------------------------
-- BLOCO 1 — O TESTE DIRETO: ela sai de get_guias_orfas?
-- -----------------------------------------------------------------------------
-- Uma linha = está na fila, é vinculável, e o problema é de FRONT (carga da
-- semana / ehOrfa) — o alvo passa a ser useAnaliseReincidencia.
-- Zero linhas = a RPC a descartou, e os blocos 3/4/5 dizem qual cláusula.
select
  case when count(*) > 0
    then 'ESTÁ na fila de órfãs (' || count(*) || ' linha) — investigar o FRONT'
    else 'NÃO está na fila de órfãs — a RPC a descartou; ver blocos 3, 4 e 5'
  end as veredito
from public.get_guias_orfas(date '2026-09-01', date '2026-09-01') o
where o.guia = '26905';

-- e, se estiver, com que números
select
  o.guia, o.paciente_nome, o.data_execucao, o.codigo_tuss, o.status,
  o.ordem_autorizacao, o.sessoes_na_particao, o.teve_token, o.biofacial
from public.get_guias_orfas(date '2026-09-01', date '2026-09-01') o
where o.guia = '26905';


-- -----------------------------------------------------------------------------
-- BLOCO 2 — a partição inteira: a glosa e a liberação lado a lado
-- -----------------------------------------------------------------------------
-- Espelha o row_number() da RPC (mesma partition by, mesmo order by) SEM os
-- filtros do WHERE final, para ver a sequência real do dia. Aqui se lê se a
-- 26905 é de fato a 2ª (ou 3ª) autorização da partição — a assinatura da glosa
-- reautorizada — e QUAL guia foi a glosada que ela substitui.
with particao as (
  select
    aa.guia,
    aa.data_execucao,
    aa.status,
    aa.codigo_erro,
    aa.descricao_erro,
    aa.teve_token,
    aa.biofacial,
    exists (
      select 1 from public.autorizacoes_vinculos v
      where v.guia = aa.guia and v.desfeito_em is null
    ) as ja_triada,
    row_number() over (
      partition by split_part(aa.matricula,'.',1), split_part(aa.matricula,'.',2),
                   split_part(aa.matricula,'.',3), date(aa.data_execucao), aa.codigo_tuss
      order by aa.data_execucao
    ) as ordem_autorizacao
  from public.autorizacoes_assim aa
  where aa.data_execucao is not null
    and date(aa.data_execucao) = date '2026-09-01'
    and split_part(aa.matricula, '.', 2) = '0750812'
    and aa.codigo_tuss = '22070384'
)
select
  p.ordem_autorizacao,
  p.guia,
  p.data_execucao,
  p.status,
  case
    when p.status = 'Liberado'   then 'liberada'
    when p.status = 'Liberado *' then 'CANCELADA (não cobre nada)'
    else 'glosa/recusa'
  end as leitura_do_status,
  p.codigo_erro,
  p.descricao_erro,
  p.ja_triada,
  p.biofacial
from particao p
order by p.ordem_autorizacao;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — HIPÓTESE 3: já triada? (exclusão dentro da CTE, antes do row_number)
-- -----------------------------------------------------------------------------
-- Se houver linha viva aqui, a guia sai da fila por projeto — mas então o rótulo
-- seria "Vinculada"/"Autorização extra", não "Outra semana". Medido porque é
-- barato e fecha a porta.
select
  case when count(*) = 0
    then 'sem vínculo vivo — NÃO é esta a causa'
    else 'TEM vínculo vivo (' || count(*) || ') — excluída da fila por triagem'
  end as veredito
from public.autorizacoes_vinculos v
where v.guia = '26905'
  and v.desfeito_em is null;

select
  v.id, v.guia, v.guia_original, v.tipo, v.bloco_id, v.fila_id,
  v.observacao, v.vinculado_por, v.vinculado_em, v.desfeito_em, v.desfeito_motivo
from public.autorizacoes_vinculos v
where v.guia = '26905'
order by v.vinculado_em desc;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — HIPÓTESE 1 (a mais provável): capturada pelo próprio Pulsar?
-- -----------------------------------------------------------------------------
-- A RPC exclui a guia quando existe linha em fila_autorizacoes com o MESMO
-- número e horario_autorizacao dentro de ±5 min de data_execucao. Se a
-- reautorização saiu pelo robô (e não pelo portal), a guia é tratada como já
-- contabilizada e nunca chega à fila de órfãs.
select
  case when count(*) > 0
    then 'CASOU com a fila em ±5 min (' || count(*) || ') — É ESTA a causa da exclusão'
    else 'não casou em ±5 min — NÃO é esta a causa'
  end as veredito
from public.fila_autorizacoes fa
where fa.numero_autorizacao = '26905'
  and fa.horario_autorizacao between timestamp '2026-09-01 17:36:00' - interval '5 minutes'
                                 and timestamp '2026-09-01 17:36:00' + interval '5 minutes';

-- SEM o filtro de tempo: o número da guia RECICLA na ASSIM
-- (reference_guia_assim_nao_e_unica), então é preciso ver se o número existe na
-- fila com OUTRO horário — e a que distância do instante da autorização.
select
  fa.id,
  fa.numero_autorizacao,
  fa.paciente_id,
  fa.paciente_nome,
  fa.data_atendimento,
  fa.horario                as horario_da_sessao,
  fa.horario_autorizacao    as horario_autorizacao_sp,
  fa.tuss,
  fa.status,
  fa.status_assim,
  fa.tipo_falta,
  fa.machine_id,
  fa.avulsa,
  round(extract(epoch from (fa.horario_autorizacao - timestamp '2026-09-01 17:36:00')) / 60.0, 1)
    as minutos_vs_data_execucao,
  case
    when fa.horario_autorizacao is null then 'sem horario_autorizacao'
    when abs(extract(epoch from (fa.horario_autorizacao - timestamp '2026-09-01 17:36:00'))) <= 300
      then 'DENTRO da janela de 5 min (exclui da fila de órfãs)'
    else 'fora da janela de 5 min'
  end as veredito
from public.fila_autorizacoes fa
where fa.numero_autorizacao = '26905'
order by fa.horario_autorizacao desc nulls last;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — HIPÓTESE 2: quantas sessões fn_blocos_assim conta na partição?
-- -----------------------------------------------------------------------------
-- A RPC só considera órfã a guia EXCEDENTE: ordem_autorizacao > n_sessoes.
-- Se `sessoes_contadas` vier 0 e a guia for ordem 1, ela até passaria (1 > 0);
-- se vier >= a ordem dela, a guia é descartada por não ser excedente.
select
  coalesce(sum(b.quantidade_sessoes), 0) as sessoes_contadas,
  count(*)                               as blocos,
  string_agg(b.hora_inicial::text || ' ' || coalesce(b.terapias, '?'), ' | '
             order by b.hora_inicial)    as blocos_detalhe
from public.fn_blocos_assim(date '2026-09-01', date '2026-09-01') b
where b.empresa     = '000000'
  and b.matricula   = '0750812'
  and b.dep         = '00'
  and b.codigo_tuss = '22070384';

-- a partição do lado da agenda, sem filtrar TUSS — para ver se a sessão existe
-- mas com OUTRO TUSS (a v1 não reconcilia entre TUSS diferentes)
select
  b.bloco_id, b.paciente_nome, b.data_atendimento, b.hora_inicial,
  b.codigo_tuss, b.convenio_nome, b.terapias, b.quantidade_sessoes
from public.fn_blocos_assim(date '2026-09-01', date '2026-09-01') b
where b.matricula = '0750812'
order by b.hora_inicial;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — se o bloco 5 contou 0: QUAL filtro comeu a sessão?
-- -----------------------------------------------------------------------------
-- As sessões CRUAS do paciente no dia, com cada filtro de fn_blocos_assim
-- avaliado em coluna própria. A primeira coluna que disser "corta" é a causa.
select
  at.paciente_id,
  at.paciente_nome,
  at.data_atendimento,
  at.hora_inicial,
  at.terapia_nome,
  at.terapia_exibicao_nome,
  at.convenio_nome,
  at.numero_carteirinha,
  at.ativo,
  public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) as tuss_calculado,
  -- os filtros, na ordem em que a função os aplica
  case when at.ativo then 'ok' else 'CORTA: ativo = false' end                            as f_ativo,
  case when at.convenio_nome ilike '%assim%' then 'ok'
       else 'CORTA: convênio não-ASSIM (' || coalesce(at.convenio_nome,'null') || ')' end as f_convenio,
  case when public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) is not null
       then 'ok' else 'CORTA: TUSS nulo' end                                              as f_tuss,
  case when exists (
         select 1 from public.config_regras_terapias r
         where r.categoria = 'BLACKLIST_AUTORIZACAO' and r.ativo = true
           and at.terapia_nome ilike ('%' || r.terapia_nome || '%'))
       then 'CORTA: BLACKLIST_AUTORIZACAO' else 'ok' end                                  as f_blacklist,
  case when at.terapia_nome ilike '%Aplicador ABA Escola%'
         or at.terapia_nome ilike '%Aplicador ABA Casa%'
         or at.terapia_nome ilike '%Aplicador Suporte%'
         or at.terapia_nome ilike '%Supervisão ABA%'
       then 'CORTA: terapia Aplicador/Supervisão' else 'ok' end                           as f_terapia_aba,
  case when exists (
         select 1 from public.fila_autorizacoes f
         where f.paciente_id = at.paciente_id::text
           and f.data_atendimento = at.data_atendimento
           and f.horario = at.hora_inicial
           and ((f.status is distinct from 'glosa'
                 and upper(coalesce(f.status_assim, '')) like '%FALTA%')
                or upper(coalesce(f.tipo_falta, '')) like '%PACIENTE%'
                or upper(coalesce(f.tipo_falta, '')) like '%TERAPEUTA%'))
       then 'CORTA: marcada como falta' else 'ok' end                                     as f_falta,
  -- a chave do left join com n_sessoes, do lado da AGENDA
  substring(at.numero_carteirinha, 1, 6)                         as empresa_agenda,
  substring(at.numero_carteirinha, 7, 7)                         as matricula_agenda,
  right(regexp_replace(at.numero_carteirinha, '\D', '', 'g'), 2) as dep_agenda
from public.agenda_tita at
where at.data_atendimento = date '2026-09-01'
  and at.paciente_id = 11691
order by at.hora_inicial, at.terapia_nome;


-- -----------------------------------------------------------------------------
-- BLOCO 7 — BUG INDEPENDENTE: a janela de get_candidatas_vinculo é retroativa
-- -----------------------------------------------------------------------------
-- get_candidatas_vinculo usa v_ate := date(data_execucao) e
-- v_de := v_ate - p_janela_dias, com
-- distancia_horas = data_execucao - (data_atendimento + hora_inicial).
-- Como data_execucao (17:36) é o INSTANTE DA AUTORIZAÇÃO e não o da sessão
-- (reference_data_execucao_assim), uma sessão MAIS TARDE no mesmo dia produz
-- distancia_horas NEGATIVA. Ela continua no intervalo de DIAS, mas o operador
-- lê "x h antes" — e a ordenação por abs(distância) a joga para longe.
-- Este bloco mede se o caso existe aqui.
select
  a.bloco_id,
  a.paciente_nome,
  a.data_atendimento,
  a.hora_inicial,
  a.codigo_tuss,
  a.situacao,
  a.guia                                                          as guia_atual,
  a.status_assim,
  round(extract(epoch from (timestamp '2026-09-01 17:36:00'
        - (a.data_atendimento + a.hora_inicial))) / 3600.0, 2)     as distancia_horas,
  case
    when (a.data_atendimento + a.hora_inicial) > timestamp '2026-09-01 17:36:00'
      then 'SESSÃO DEPOIS da autorização — distancia_horas NEGATIVA (autorização adiantada)'
    else 'sessão antes da autorização — caso normal da glosa reautorizada'
  end                                                              as veredito_janela
from public.get_auditoria_assim_periodo(date '2026-09-01', date '2026-09-01') a
where a.matricula   = '0750812'
  and a.codigo_tuss = '22070384'
order by a.hora_inicial;

-- e o que get_candidatas_vinculo de fato ofereceria para esta guia.
-- Ela NÃO exige que a guia esteja na fila de órfãs (só que tenha data_execucao
-- e TUSS), então roda mesmo com a guia excluída do bloco 1 — é o que permite
-- separar "não é oferecida" de "não tem candidata".
-- RODAR ISOLADO: tem statement_timeout de 55s e faz um laço dia-a-dia sobre
-- get_auditoria_assim_periodo (7 chamadas). Se estourar, é sintoma conhecido,
-- não erro do snippet.
select
  c.bloco_id,
  c.data_atendimento,
  c.hora_inicial,
  c.situacao,
  c.guia_atual,
  c.distancia_horas,
  c.ja_vinculado,
  c.elegivel,
  case
    when c.elegivel then 'OFERECIDA como alvo clicável'
    when c.ja_vinculado then 'visível, não-elegível: já vinculada'
    else 'visível, não-elegível: situação ' || coalesce(c.situacao, '?')
  end as veredito
from public.get_candidatas_vinculo('26905', 7) c
order by c.data_atendimento, c.hora_inicial;
