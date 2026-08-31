-- APLICAR 2 — Responsáveis: parentesco validado + backfill do legado
-- Gerado em 2026-08-31 a partir das migrations 20260828170000 e 20260828170100.
--
-- Cole INTEIRO no SQL Editor do Supabase. As duas migrations vão numa
-- transação só: se o backfill falhar, o CHECK não fica aplicado pela metade.
--
-- O SQL Editor NÃO mostra RAISE NOTICE, então os relatórios das migrations não
-- aparecem. Por isso o bloco de CONFERÊNCIA no fim, depois do COMMIT: aquele sai
-- como tabela na tela.
--
-- NÃO inclui 20260828170200 (drop de pacientes.telefone) de propósito: aquela só
-- pode ser aplicada DEPOIS do deploy do frontend desta branch.

BEGIN;

-- ### 20260828170000_parentesco_lista_validada.sql ###
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


-- ### 20260828170100_backfill_responsaveis_do_legado.sql ###
-- Traz o responsável legado do TiTa para o modelo relacional.
--
-- O problema que isto resolve: public.responsaveis + public.pacientes_responsaveis
-- (20260826100200) só é populado quando alguém ABRE o paciente e edita a seção
-- "Filiação e responsáveis". As colunas pacientes.responsavel_* seguem sendo
-- alimentadas pelo sync do TiTa (supabase/functions/sync_tita_agenda/index.ts),
-- então na prática o legado está cheio e o relacional está vazio — e a tela nova
-- mostra "não informado" para paciente cujo telefone o sistema tem.
--
-- Idempotente por construção: só toca paciente SEM vínculo 'filiacao_1'. Quem já
-- foi editado à mão na tela nova é a verdade e não é sobrescrito. Reaplicar esta
-- migration não duplica nada.
--
-- NÃO cria vínculo 'financeiro', embora pacientes.responsavel_financeiro exista.
-- Medido em 2026-08-28: a coluna é `true` em 368 dos 370 pacientes não fictícios
-- — é o padrão que o TiTa grava, não uma escolha de quem cadastrou. Materializar
-- isso daria 368 vínculos que apenas repetem a filiação e fariam o campo
-- "Responsável financeiro" da tela parecer preenchido de propósito. O campo fica
-- vazio, para a clínica preencher quando o pagador for outra pessoa.
--
-- Depende de 20260828170000 (public.normalizar_parentesco + o CHECK da lista).

do $$
declare
  c                  record;
  v_resp_id          bigint;
  n_criados          integer := 0;
  n_reaproveitados   integer := 0;
  n_vinculos         integer := 0;
  n_sem_parentesco   integer := 0;
begin
  for c in
    select
      p.id_paciente,
      nullif(trim(p.responsavel_nome), '')  as nome,
      -- Só CPF com 11 dígitos vira chave de reaproveitamento. O resto é sujeira
      -- de origem e casar por prefixo criaria vínculo com a pessoa errada —
      -- mesma regra do backfill do TiTa (20260817190100, linhas 131/137).
      case
        when regexp_replace(coalesce(p.responsavel_cpf, ''), '\D', '', 'g') ~ '^\d{11}$'
        then regexp_replace(p.responsavel_cpf, '\D', '', 'g')
      end                                    as cpf,
      nullif(trim(p.responsavel_telefone), '') as celular,
      -- Endereços de preenchimento medidos na base em 2026-08-28 (22 e 3
      -- ocorrências). São a forma que o operador achou de satisfazer um campo
      -- obrigatório, não um contato: copiá-los daria a 25 responsáveis um e-mail
      -- que ninguém lê. O e-mail da própria clínica, que também aparece
      -- repetido, FICA — aquele ao menos é uma caixa que existe.
      case
        when lower(trim(coalesce(p.responsavel_email, ''))) in (
          'emailnaoinformado@gmail.com',
          'pendente-na-base-de-dados-anterior@gmail.com'
        ) then null
        else nullif(trim(p.responsavel_email), '')
      end                                      as email,
      public.normalizar_parentesco(p.responsavel_parentesco) as parentesco
    from public.pacientes p
    where p.ficticio = false
      -- "Não informado" é como o TiTa preenche campo vazio; não é um nome.
      and nullif(trim(coalesce(p.responsavel_nome, '')), '') is not null
      and lower(unaccent(trim(p.responsavel_nome))) <> 'nao informado'
      and not exists (
        select 1 from public.pacientes_responsaveis pr
        where pr.paciente_id = p.id_paciente
          and pr.tipo = 'filiacao_1'
      )
    order by p.id_paciente
  loop
    v_resp_id := null;

    -- Reaproveitamento: primeiro por CPF, que é a chave forte. As inserções
    -- acontecem DENTRO do laço, então o irmão processado depois já encontra o
    -- responsável criado para o primeiro — é isso que evita duplicar a mesma
    -- pessoa uma vez por filho matriculado.
    if c.cpf is not null then
      select r.id into v_resp_id
      from public.responsaveis r
      where regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g') = c.cpf
      order by r.id
      limit 1;
    else
      -- Sem CPF, o par (nome normalizado, celular) é o mais longe que dá para ir
      -- sem arriscar fundir duas pessoas homônimas em uma só. Nome igual com
      -- telefone diferente permanece sendo duas linhas, de propósito.
      select r.id into v_resp_id
      from public.responsaveis r
      where public.normalizar_nome_paciente(r.nome) = public.normalizar_nome_paciente(c.nome)
        and coalesce(nullif(trim(r.celular), ''), '') = coalesce(c.celular, '')
      order by r.id
      limit 1;
    end if;

    if v_resp_id is null then
      insert into public.responsaveis (nome, cpf, celular, email, nome_usuario_responsavel)
      values (c.nome, c.cpf, c.celular, c.email, 'Backfill do legado TiTa')
      returning id into v_resp_id;
      n_criados := n_criados + 1;
    else
      n_reaproveitados := n_reaproveitados + 1;
    end if;

    if c.parentesco is null then
      n_sem_parentesco := n_sem_parentesco + 1;
    end if;

    insert into public.pacientes_responsaveis
      (paciente_id, responsavel_id, tipo, parentesco, nome_usuario_responsavel)
    values
      (c.id_paciente, v_resp_id, 'filiacao_1', c.parentesco, 'Backfill do legado TiTa')
    on conflict (paciente_id, tipo) do nothing;
    n_vinculos := n_vinculos + 1;
  end loop;

  raise notice '--- Backfill de responsáveis a partir do legado ---';
  raise notice 'Vínculos filiacao_1 criados ...: %', n_vinculos;
  raise notice 'Responsáveis novos ............: %', n_criados;
  raise notice 'Responsáveis reaproveitados ...: % (irmãos / já cadastrados)', n_reaproveitados;
  raise notice 'Sem parentesco determinável ...: % (revisar na tela)', n_sem_parentesco;
end $$;


COMMIT;

-- ===== CONFERÊNCIA (sai como tabela na tela) =====
select
  (select count(*) from public.responsaveis)                                              as responsaveis,
  (select count(*) from public.pacientes_responsaveis where tipo = 'filiacao_1')          as vinculos_filiacao_1,
  (select count(*) from public.pacientes_responsaveis where parentesco is null)           as sem_parentesco_revisar,
  (select count(*) from public.pacientes p where p.ficticio = false
     and not exists (select 1 from public.pacientes_responsaveis pr
                     where pr.paciente_id = p.id_paciente and pr.tipo = 'filiacao_1'))    as pacientes_ainda_sem_filiacao,
  (select count(*) from public.pacientes where ficticio = false)                          as pacientes_nao_ficticios;

-- Distribuição do parentesco migrado — confira se bate com o legado
-- (esperado a partir da medição de 2026-08-28: Outro 219, Mãe 136, Pai 10, null 3).
select coalesce(parentesco, '(não determinado)') as parentesco, count(*) as qtd
from public.pacientes_responsaveis
group by 1 order by 2 desc;
