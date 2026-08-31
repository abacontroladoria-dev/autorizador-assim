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
