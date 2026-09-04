-- ============================================================================
-- CONTRAPROVA — central.vw_vagas_livres e listar_vagas_disponiveis(p_unidade)
--
-- SÓ LEITURA. Rodar DEPOIS de aplicar as migrations 20260904100000 e
-- 20260904100100, e ANTES do deploy do frontend.
--
-- Os blocos 1-3 dependem só da view; rode-os logo depois de aplicá-la, porque é
-- o momento mais barato de descobrir que a grafia do TiTa mudou. Os blocos 4-6
-- exigem a RPC nova.
--
-- Cada bloco LANÇA em vez de devolver linha: um "select que parece ok" é como
-- uma contraprova passa sem provar nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Toda linha da view tem uma das três unidades
--
-- A view filtra pelos três prefixos, então unidade NULL aqui significaria que o
-- `case` do SELECT e os `like` do WHERE divergiram — o erro que a repetição
-- literal dos prefixos torna possível.
-- ----------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n
    from central.vw_vagas_livres
   where unidade is null
      or unidade not in ('Realengo', 'Fazendinha', 'Padre Miguel');

  if n > 0 then
    raise exception 'vw_vagas_livres: % linha(s) com unidade nula ou fora das três. O case do SELECT divergiu dos like do WHERE.', n;
  end if;
  raise notice 'BLOCO 1 ok — toda linha tem uma das três unidades';
end $$;

-- ----------------------------------------------------------------------------
-- 2. As três unidades existem de fato — SE FALHAR, PARE
--
-- Este é o bloco que detecta mudança de grafia na origem. A comparação da view
-- é sensível a caixa de propósito: se o TiTa passar a escrever 'UNID. REALENGO'
-- ou 'Unid.Realengo', as linhas somem da view em silêncio e a unidade
-- inteira desaparece da oferta.
--
-- Falhar aqui NÃO é para ser contornado com ilike. É para investigar o que
-- mudou na origem — o snippet 20260904_diagnostico_reservas_em_sala_nao_fisica
-- (bloco 3) lista o vocabulário real de sala_nome.
-- ----------------------------------------------------------------------------
do $$
declare
  n         int;
  faltando  text;
begin
  select count(distinct unidade) into n from central.vw_vagas_livres;

  select string_agg(u, ', ') into faltando
    from unnest(array['Realengo','Fazendinha','Padre Miguel']) u
   where not exists (select 1 from central.vw_vagas_livres v where v.unidade = u);

  if faltando is not null then
    raise exception
      'vw_vagas_livres não tem vaga em: %. Ou a unidade está sem vaga livre de verdade, ou a grafia do prefixo mudou no TiTa. NÃO conserte com ilike — investigue o vocabulário de sala_nome primeiro.',
      faltando;
  end if;
  raise notice 'BLOCO 2 ok — as três unidades têm vaga (% distintas)', n;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Nenhuma sala não-física passou
--
-- 'AT Externo Escola' e 'AT Externo Casa' são atendimento na escola ou na casa
-- do paciente. Oferecê-los como se fossem a clínica erra o endereço na cara do
-- responsável — e antes desta view eles ERAM oferecidos quando não havia filtro
-- de unidade (só 'Sala Teste' era oculta, e por igualdade exata).
-- ----------------------------------------------------------------------------
do $$
declare
  n     int;
  quais text;
begin
  select count(*), string_agg(distinct sala_nome, ' | ')
    into n, quais
    from central.vw_vagas_livres
   where sala_nome not like 'Unid. %';

  if n > 0 then
    raise exception 'vw_vagas_livres: % vaga(s) sem prefixo Unid. passaram: %', n, quais;
  end if;
  raise notice 'BLOCO 3 ok — nenhuma sala não-física na view';
end $$;

-- ----------------------------------------------------------------------------
-- 4. p_unidade inválida LANÇA — não filtra em silêncio
--
-- O caso é 'Realango' (typo). Se ele não lançar, o filtro silencioso voltou:
-- quem pediu uma unidade recebe as três misturadas, que é exatamente o bug
-- original entrando pela porta de trás.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    perform * from central.listar_vagas_disponiveis(p_unidade => 'Realango');
    raise exception 'p_unidade inválida NÃO lançou — o filtro silencioso voltou';
  exception
    when invalid_parameter_value then
      raise notice 'BLOCO 4 ok — p_unidade inválida lança 22023 (chega ao PostgREST como 400)';
  end;
end $$;

-- Caixa errada também precisa lançar: a validação é por igualdade exata, e é
-- normalizarUnidade() no TypeScript que traduz 'realengo' antes de chegar aqui.
-- Se este bloco não lançar, alguém afrouxou a validação para ilike e a
-- normalização do lado do agente ficou sem propósito.
do $$
begin
  begin
    perform * from central.listar_vagas_disponiveis(p_unidade => 'realengo');
    raise exception 'p_unidade em caixa errada NÃO lançou — a validação foi afrouxada';
  exception
    when invalid_parameter_value then
      raise notice 'BLOCO 4b ok — a validação é por igualdade exata';
  end;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Com p_unidade, só vem daquela unidade
-- ----------------------------------------------------------------------------
do $$
declare
  u text;
  n int;
begin
  foreach u in array array['Realengo','Fazendinha','Padre Miguel'] loop
    select count(*) into n
      from central.listar_vagas_disponiveis(p_unidade => u, p_limite => 500)
     where unidade is distinct from u;

    if n > 0 then
      raise exception '% vaga(s) de outra unidade vazaram no filtro de %', n, u;
    end if;
  end loop;
  raise notice 'BLOCO 5 ok — o filtro por unidade não vaza';
end $$;

-- ----------------------------------------------------------------------------
-- 6. O bloco que PROVA o motivo da mudança
--
-- Antes, o filtro de unidade era aplicado em TypeScript sobre as no máximo 500
-- linhas que a RPC devolvia, ordenadas por (data, hora, profissional). Agora o
-- teto de 500 vale POR UNIDADE.
--
-- Se `soma_por_unidade > total_sem_filtro`, o teto global estava escondendo
-- vagas: são vagas que existiam e que o agente nunca teria visto. O número é
-- concreto — anote-o no livro-caixa.
--
-- Se `soma_por_unidade < total_sem_filtro`, algo está errado: o filtro
-- descartou vaga em vez de recortar. Isso LANÇA.
-- ----------------------------------------------------------------------------
do $$
declare
  v_total int;
  v_soma  int;
  v_r     int;
  v_f     int;
  v_pm    int;
begin
  select count(*) into v_total from central.listar_vagas_disponiveis(p_limite => 500);

  select count(*) into v_r  from central.listar_vagas_disponiveis(p_unidade => 'Realengo',     p_limite => 500);
  select count(*) into v_f  from central.listar_vagas_disponiveis(p_unidade => 'Fazendinha',   p_limite => 500);
  select count(*) into v_pm from central.listar_vagas_disponiveis(p_unidade => 'Padre Miguel', p_limite => 500);
  v_soma := v_r + v_f + v_pm;

  raise notice 'BLOCO 6 — sem filtro: %  |  Realengo: %  Fazendinha: %  Padre Miguel: %  |  soma: %',
    v_total, v_r, v_f, v_pm, v_soma;

  if v_soma < v_total then
    raise exception
      'A soma por unidade (%) é MENOR que o total sem filtro (%) — o filtro perdeu vaga em vez de recortar.',
      v_soma, v_total;
  end if;

  if v_soma > v_total then
    raise notice
      '  → O teto global escondia % vaga(s). Elas existiam e o agente nunca as veria. É o defeito que esta mudança conserta.',
      v_soma - v_total;
  else
    -- Em PRODUÇÃO isto não acontece: medido em 04/09/2026, eram 5.763 vagas
    -- ofertáveis e 472 alcançáveis (91,8% invisíveis, nas três unidades). Cair
    -- aqui significa base pequena — tipicamente uma stack local com dump
    -- antigo, onde o total inteiro cabe nas 500. Não é sinal de que o defeito
    -- não existe.
    raise notice
      '  → O total cabe nas 500 nesta base, então aqui não há vaga escondida. NÃO conclua que o defeito é hipotético: em produção (04/09/2026) eram 472 de 5.763 alcançáveis. Base pequena não reproduz o teto.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6b. O corte por DATA — o efeito mais grave, e o que o bloco 6 não mostra
--
-- O `order by` começa por `data`, então as linhas que cabem no teto são todas
-- dos primeiros dias da janela. O bloco 6 conta vagas; este conta DIAS, que é o
-- que o responsável percebe: "não temos vaga" para tudo depois do N-ésimo dia.
--
-- Medido em produção antes da mudança: 4 dias visíveis de 21 existentes.
-- Depois da mudança, cada unidade tem seu próprio teto, então o horizonte
-- visível se estende — e p_data_inicio/p_data_fim passam a alcançar o resto.
-- ----------------------------------------------------------------------------
do $$
declare
  v_dias_vis  int;
  v_dias_tot  int;
  v_ate_vis   date;
  v_ate_tot   date;
begin
  with ordenadas as (
    select row_number() over (order by data, hora_inicial, profissional_nome) as pos, data
      from central.vw_vagas_livres
     where data >= (now() at time zone 'America/Sao_Paulo')::date
       and data <= (now() at time zone 'America/Sao_Paulo')::date + 30
  )
  select
    count(distinct data) filter (where pos <= 500),
    count(distinct data),
    max(data) filter (where pos <= 500),
    max(data)
  into v_dias_vis, v_dias_tot, v_ate_vis, v_ate_tot
  from ordenadas;

  raise notice 'BLOCO 6b — com teto GLOBAL de 500: % de % dias visíveis (até % de %)',
    v_dias_vis, v_dias_tot, v_ate_vis, v_ate_tot;

  if v_dias_tot > 0 and v_dias_vis < v_dias_tot then
    raise notice
      '  → A partir de % a resposta era "não temos vaga" com agenda cheia. Quem pedia "essa semana" era atendido; quem pedia "semana que vem", não.',
      v_ate_vis + 1;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Panorama, para o livro-caixa
-- ----------------------------------------------------------------------------
select
  unidade,
  count(*)                                          as vagas_ofertaveis,
  count(*) filter (where e_sala_numerada)           as em_sala_numerada,
  count(*) filter (where not e_sala_numerada)       as em_papel_da_unidade,
  count(distinct terapia_id)                        as terapias,
  count(distinct profissional_id)                   as profissionais,
  min(data)                                         as primeira_data,
  max(data)                                         as ultima_data
from central.listar_vagas_disponiveis(p_limite => 500)
group by unidade
order by vagas_ofertaveis desc;
