-- Central de Atendimento — o resumo por especialidade deixa de ser amostra
--
-- Depends on:
--   20260904100000_central_vagas_livres_por_unidade.sql (central.vw_vagas_livres)
--
-- O DEFEITO QUE ESTA FUNÇÃO CONSERTA
--
-- `listarTerapiasComVaga()` (availability.repository.ts:83-117) responde "quais
-- especialidades vocês têm disponíveis?". Ela fazia isso chamando
-- listar_vagas_disponiveis com limite 500 e agregando EM MEMÓRIA — inclusive o
-- conjunto de unidades em que cada terapia tem vaga.
--
-- Isso é o mesmo bug de teto da migration 20260904100100, em outra roupa, e o
-- filtro de unidade que acabamos de mover para o banco NÃO o resolve: aqui não
-- há unidade para filtrar, justamente porque a pergunta é "onde cada terapia
-- tem vaga".
--
-- O sintoma concreto: uma terapia que só tem vaga em Padre Miguel a partir da
-- linha 501 aparece com unidades = ['Realengo']. O agente então diz "temos
-- fono, mas só em Realengo" — falso, e falso com a confiança de quem consultou
-- o sistema. O responsável que só pode ir a Padre Miguel desiste.
--
-- POR QUE UMA FUNÇÃO EM VEZ DE AUMENTAR O LIMITE
--
-- Não há limite que resolva: o teto existe para proteger o pool do PostgREST, e
-- a grade cresce. A pergunta certa é uma AGREGAÇÃO, e agregação com `group by`
-- não precisa de teto de linhas — o resultado tem no máximo (nº de terapias × 3)
-- linhas, tipicamente algumas dezenas, em vez de 500 linhas de detalhe das
-- quais só se extraía uma contagem.
--
-- Isto também troca ~500 linhas trafegadas por ~40. Ganho secundário, mas real
-- num projeto que já teve 504 por esgotamento de pool.
--
-- ROLLBACK:
--   drop function if exists central.contar_vagas_por_terapia_e_unidade(date, date);

create or replace function central.contar_vagas_por_terapia_e_unidade(
  p_data_inicio date default null,
  p_data_fim    date default null
)
returns table (
  terapia_id   bigint,
  terapia_nome text,
  unidade      text,
  vagas        bigint
)
language plpgsql
stable
set search_path = public, central
as $$
declare
  v_agora  timestamp := now() at time zone 'America/Sao_Paulo';
  v_inicio date;
  v_fim    date;
begin
  v_inicio := coalesce(p_data_inicio, v_agora::date);
  v_fim    := coalesce(p_data_fim,    v_agora::date + 30);

  return query
  select
    v.terapia_id,
    -- O nome pode vir como lista ("Aplicador ABA (PS), Psicopedagogia") quando
    -- o profissional atende mais de uma especialidade naquele horário. É texto
    -- de exibição; só o id é chave confiável, e é por isso que o group by é
    -- pelo id e o nome vem por min() em vez de entrar no agrupamento — senão a
    -- mesma terapia se parte em várias linhas por variação de grafia.
    min(v.terapia_nome)                as terapia_nome,
    v.unidade,
    count(*)                           as vagas
  from central.vw_vagas_livres v
  where v.data >= v_inicio
    and v.data <= v_fim
    -- Mesma regra de passado da listar_vagas_disponiveis: no dia corrente a
    -- comparação é por hora. Uma terapia cujas únicas vagas do dia já passaram
    -- não pode ser anunciada como disponível.
    and (v.data > v_agora::date or v.hora_inicial > v_agora::time)
    and v.terapia_id is not null
    -- A vaga não pode já ter sido prometida por nós.
    and not exists (
      select 1
      from central.appointments ap
      where ap.profissional_id = v.profissional_id
        and ap.date            = v.data
        and ap.time            = v.hora_inicial
        and ap.status in ('scheduled', 'confirmed')
    )
  group by v.terapia_id, v.unidade
  order by count(*) desc, v.terapia_id, v.unidade;
end;
$$;

comment on function central.contar_vagas_por_terapia_e_unidade(date, date) is
  'Quantas vagas ofertáveis cada terapia tem, POR UNIDADE. Responde "quais especialidades vocês têm disponíveis, e onde?" sem despejar centenas de horários. Substitui a agregação em memória de listarTerapiasComVaga, que era feita sobre as 500 primeiras linhas da janela e por isso podia afirmar que uma terapia só existe em Realengo quando ela tinha vaga em Padre Miguel a partir da linha 501. Agregação com group by não precisa de teto de linhas.';

grant execute on function central.contar_vagas_por_terapia_e_unidade(date, date)
  to authenticated, service_role;
