-- Matrícula auto-gerada, à prova de corrida.
--
-- GAPS SÃO ESPERADOS E ACEITOS. nextval() é não-transacional de propósito — é
-- justamente o que torna a geração livre de lock. Se a transação que inseriu o
-- paciente der rollback (erro de validação, RLS negando o INSERT, aba fechada no
-- meio), o número consumido NÃO volta e fica um buraco na sequência. A
-- alternativa (max(matricula)+1 sob lock de tabela) serializaria todo cadastro e
-- ainda assim falharia sob concorrência. Buraco na numeração é contábil, não
-- clínico: nada no Pulsar deriva significado de matrículas serem contíguas.

create sequence if not exists public.pacientes_matricula_seq
  as integer
  start with 1
  minvalue 1
  no maxvalue
  owned by public.pacientes.matricula;

-- Números QUEIMADOS da base legada. Nasce VAZIA de propósito: o usuário insere
-- depois a lista de matrículas já usadas fora do Pulsar, e proxima_matricula()
-- passa a pulá-las. Inserir aqui é seguro a qualquer momento, inclusive depois
-- de a sequence já ter passado do número — o UNIQUE de pacientes.matricula
-- (20260826100000) é o backstop.
create table if not exists public.pacientes_matriculas_reservadas (
  matricula integer primary key,
  motivo    text,
  criado_em timestamptz not null default now()
);

comment on table public.pacientes_matriculas_reservadas is
  'Matrículas que proxima_matricula() deve PULAR — tipicamente a numeração da base legada, importada à mão. Vazia por padrão. Não referencia pacientes: o número pode estar queimado sem existir paciente correspondente no Pulsar.';

-- Exibição centralizada, para o zero-padding não ser reimplementado em cada
-- tela e relatório com largura diferente — foi assim que a normalização de nome
-- divergiu antes neste projeto.
create or replace function public.matricula_formatada(p_matricula integer)
returns text
language sql
immutable
as $$
  select case when p_matricula is null then null
              else lpad(p_matricula::text, 5, '0') end;
$$;

comment on function public.matricula_formatada(integer) is
  'Zero-padding de 5 dígitos (1 -> 00001). Largura MÍNIMA: acima de 99999 devolve o número inteiro, sem truncar.';

-- SECURITY DEFINER: a função lê `pacientes` e `pacientes_matriculas_reservadas`.
-- Sob RLS o chamador poderia não enxergar uma linha e "achar livre" um número
-- ocupado. Definer garante que a checagem enxerga a tabela inteira.
create or replace function public.proxima_matricula()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_matricula  integer;
  v_tentativas integer := 0;
begin
  loop
    v_matricula  := nextval('public.pacientes_matricula_seq')::integer;
    v_tentativas := v_tentativas + 1;

    exit when not exists (
                select 1 from public.pacientes_matriculas_reservadas r
                where r.matricula = v_matricula)
         and not exists (
                select 1 from public.pacientes p
                where p.matricula = v_matricula);

    -- Guarda contra loop infinito: se alguém reservar um bloco gigantesco por
    -- engano, falhar alto é melhor do que travar a conexão.
    if v_tentativas > 100000 then
      raise exception 'proxima_matricula: 100000 candidatas consecutivas reservadas/ocupadas a partir de %. Confira public.pacientes_matriculas_reservadas.', v_matricula;
    end if;
  end loop;

  return v_matricula;
end;
$$;

comment on function public.proxima_matricula() is
  'Próxima matrícula livre: nextval em loop, pulando o que está em pacientes_matriculas_reservadas ou já gravado em pacientes.matricula. Livre de corrida porque nextval é atômico; o UNIQUE de pacientes.matricula é o backstop final. Gera gaps em rollback — comportamento aceito, ver cabeçalho de 20260826100100.';

-- Mesmo padrão de usuario_tem_permissao (20260818210000): a função nasce com
-- EXECUTE para PUBLIC e anon é membro de PUBLIC — o revoke é o que fecha a rota
-- /rest/v1/rpc.
revoke all on function public.proxima_matricula() from public, anon;
grant execute on function public.proxima_matricula() to authenticated;
revoke all on function public.matricula_formatada(integer) from public, anon;
grant execute on function public.matricula_formatada(integer) to authenticated;

create or replace function public.set_paciente_matricula()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.matricula := public.proxima_matricula();
  return new;
end;
$$;

-- A cláusula WHEN é a parte importante, por DOIS motivos:
--   1. origem_cadastro = 'tita' fica com matricula NULL (decisão do usuário: a
--      numeração legada desses pacientes entra depois, via reservadas/import);
--   2. o sync faz INSERT ... ON CONFLICT (tita_paciente_id) DO UPDATE, e um
--      BEFORE INSERT roda ANTES da detecção de conflito. Sem o WHEN, cada
--      resync queimaria uma matrícula por paciente que JÁ EXISTE.
-- `new.matricula is null` deixa um import consciente fornecer o número.
drop trigger if exists trg_pacientes_matricula on public.pacientes;
create trigger trg_pacientes_matricula
  before insert on public.pacientes
  for each row
  when (new.origem_cadastro = 'pulsar' and new.matricula is null)
  execute function public.set_paciente_matricula();

-- ===== RLS da tabela de reservadas =====
alter table public.pacientes_matriculas_reservadas enable row level security;

-- Remoção por catálogo e não por nome (convenção de 20260818210000): não há
-- nome antigo a adivinhar, e uma policy permissiva sobrevivente anularia o
-- fechamento em silêncio, já que RLS é OR entre policies.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pacientes_matriculas_reservadas'
  loop
    execute format('drop policy %I on public.pacientes_matriculas_reservadas', pol.policyname);
  end loop;
end $$;

create policy "pacientes_matriculas_reservadas_all" on public.pacientes_matriculas_reservadas
  for all to authenticated
  using (public.usuario_tem_permissao('cadastros_pacientes'))
  with check (public.usuario_tem_permissao('cadastros_pacientes'));

revoke all on public.pacientes_matriculas_reservadas from public;
revoke all on public.pacientes_matriculas_reservadas from anon;
revoke all on public.pacientes_matriculas_reservadas from authenticated;
grant select, insert, update, delete on public.pacientes_matriculas_reservadas to authenticated;

-- SEM `force row level security` nesta tabela — deliberado, e é a única do
-- conjunto que abre essa exceção.
--
-- FORCE faz a RLS valer também para o DONO da tabela. proxima_matricula() é
-- SECURITY DEFINER justamente para enxergar todos os números queimados,
-- inclusive os que o usuário chamador não poderia ler; com FORCE, essa leitura
-- voltaria a passar pela policy e a garantia de unicidade dependeria de quem
-- está chamando. Um número "invisível" seria considerado livre, e o erro só
-- apareceria depois, como violação do UNIQUE de pacientes.matricula.
--
-- A tabela não fica exposta: RLS segue ENABLED, a policy acima é a única, e os
-- grants a public/anon foram revogados. FORCE aqui só mudaria o comportamento
-- do dono — que é exatamente quem precisa enxergar tudo.
