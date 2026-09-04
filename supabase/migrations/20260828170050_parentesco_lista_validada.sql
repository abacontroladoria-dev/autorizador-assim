-- Parentesco vira LISTA FECHADA, não texto solto.
--
-- Motivo: `pacientes_responsaveis.parentesco` nasceu como input livre
-- (FiliacaoResponsaveis.tsx), e o dado de origem já mostra o custo disso — o
-- relatório do AXIUM traz "MAE", "PAI", "AVO", "OUTROS", tudo em caixa alta e
-- sem acento, e a tela aceita qualquer grafia. Sem lista fechada, filtrar ou
-- contar por parentesco vira adivinhação de string.
--
-- A normalização mora em UMA função (public.normalizar_parentesco) porque três
-- consumidores precisam dela e divergir entre eles é o bug clássico deste
-- projeto (ver o comentário de normalizar_nome_paciente em 20260817190000):
--   1. esta migration, para sanear as linhas já digitadas;
--   2. o backfill das colunas legadas pacientes.responsavel_parentesco;
--   3. o import do relatório de favorecidos.

-- ===== Função de normalização =====
--
-- STABLE, e não IMMUTABLE, porque depende de unaccent() — que é STABLE por ser
-- sensível à configuração da extensão. Mesma razão pela qual
-- normalizar_nome_paciente não é usada em índice.
create or replace function public.normalizar_parentesco(p_texto text)
returns text
language sql
stable
set search_path to 'public', 'extensions'
as $$
  with base as (
    select
      -- Minúsculo COM acento preservado: é o acento que separa avó de avô.
      -- Pontuação vira espaço e espaço é colapsado, para "tutor(a) legal" e
      -- "tutor  legal" caírem no mesmo lugar.
      nullif(
        regexp_replace(
          regexp_replace(lower(coalesce(p_texto, '')), '[^[:alnum:][:space:]áàâãéêíóôõúüç]', ' ', 'g'),
          '\s+', ' ', 'g'
        ),
        ''
      ) as com_acento
  ),
  ambos as (
    select
      trim(com_acento) as com_acento,
      trim(lower(unaccent(com_acento))) as sem_acento
    from base
  )
  select case
    -- Avó e avô só se distinguem pelo acento, então vêm ANTES do teste sem
    -- acento. Um "AVO" cru (é o que o AXIUM exporta) permanece sem resposta de
    -- propósito: virar "Avó" seria adivinhar o gênero de uma pessoa real.
    when com_acento in ('avó', 'vó', 'vovó')  then 'Avó'
    when com_acento in ('avô', 'vô', 'vovô')  then 'Avô'

    when sem_acento in ('mae', 'mamae', 'genitora')            then 'Mãe'
    when sem_acento in ('pai', 'papai', 'genitor')             then 'Pai'
    when sem_acento in ('madrasta')                            then 'Madrasta'
    when sem_acento in ('padrasto')                            then 'Padrasto'
    -- irma/irmao não são ambíguos sem acento: diferem na última letra.
    when sem_acento in ('irma')                                then 'Irmã'
    when sem_acento in ('irmao')                               then 'Irmão'
    when sem_acento in ('tia')                                 then 'Tia'
    when sem_acento in ('tio')                                 then 'Tio'
    when sem_acento in ('tutor', 'tutora', 'tutor legal',
                        'tutora legal', 'tutor a legal')       then 'Tutor(a) legal'
    when sem_acento in ('responsavel legal', 'responsavel',
                        'resp legal')                          then 'Responsável legal'
    when sem_acento in ('proprio paciente', 'o proprio',
                        'proprio', 'propria', 'paciente')      then 'Próprio paciente'
    when sem_acento in ('outro', 'outros', 'outra')            then 'Outro'

    -- Inclui explicitamente o "Não informado" que o AXIUM usa como preenchimento
    -- de campo vazio — não é um parentesco, é ausência dele.
    else null
  end
  from ambos;
$$;

comment on function public.normalizar_parentesco(text) is
  'Mapa único de texto livre -> lista fechada de parentesco. Devolve NULL para o '
  'que não mapeia com certeza, incluindo "AVO" sem acento (avó ou avô? adivinhar '
  'o gênero de uma pessoa real não é normalização). Não re-inlinar esta lógica '
  'em serviço ou script: a duplicação divergente é o bug que normalizar_nome_paciente '
  'já custou a este projeto.';

-- ===== Saneamento das linhas já digitadas =====
--
-- Roda ANTES do CHECK, senão o ALTER TABLE falha em bloco por causa de uma
-- linha antiga. O que não mapeia vira NULL e é RELATADO — nunca cai em "Outro",
-- que é uma afirmação positiva ("é um parentesco fora da lista") e esconderia
-- do usuário justamente os casos que precisam de revisão na tela.
do $$
declare
  r          record;
  n_mapeado  integer := 0;
  n_perdido  integer := 0;
begin
  for r in
    select paciente_id, tipo, parentesco
    from public.pacientes_responsaveis
    where parentesco is not null
  loop
    if public.normalizar_parentesco(r.parentesco) is null then
      n_perdido := n_perdido + 1;
      raise notice 'Parentesco sem correspondência (revisar na tela): paciente_id=% tipo=% valor=%',
        r.paciente_id, r.tipo, r.parentesco;
    elsif public.normalizar_parentesco(r.parentesco) is distinct from r.parentesco then
      n_mapeado := n_mapeado + 1;
    end if;
  end loop;

  update public.pacientes_responsaveis
     set parentesco = public.normalizar_parentesco(parentesco)
   where parentesco is not null
     and parentesco is distinct from public.normalizar_parentesco(parentesco);

  raise notice 'Parentesco saneado: % normalizado(s), % zerado(s) por não mapear.',
    n_mapeado, n_perdido;
end $$;

-- ===== CHECK =====
--
-- Padrão idempotente por pg_constraint, igual a 20260826100000: a migration
-- precisa poder ser reaplicada num banco que já a recebeu (o histórico de
-- migrations deste projeto tem desalinhamentos conhecidos).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pacientes_responsaveis'::regclass
                   and conname = 'pacientes_responsaveis_parentesco_check') then
    alter table public.pacientes_responsaveis
      add constraint pacientes_responsaveis_parentesco_check
      check (parentesco is null or parentesco in (
        'Mãe',
        'Pai',
        'Madrasta',
        'Padrasto',
        'Avó',
        'Avô',
        'Irmã',
        'Irmão',
        'Tia',
        'Tio',
        'Tutor(a) legal',
        'Responsável legal',
        'Próprio paciente',
        'Outro'
      ));
  end if;
end $$;

comment on column public.pacientes_responsaveis.parentesco is
  'Lista fechada (pacientes_responsaveis_parentesco_check). NULL = não informado '
  'ou não foi possível determinar (ex.: origem trouxe "AVO", sem dizer se avó ou '
  'avô). Texto livre vindo de fora passa por public.normalizar_parentesco antes '
  'de ser gravado. A lista espelha PARENTESCOS em frontend/types/responsavel.ts — '
  'alterar um lado exige alterar o outro.';
