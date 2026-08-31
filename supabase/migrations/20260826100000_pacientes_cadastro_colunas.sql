-- Tela /cadastros/pacientes — ESTRUTURA. Só as colunas aqui; matrícula,
-- responsáveis, ficha médica, storage e RLS vêm nas migrations seguintes.
--
-- A permissão `cadastros_pacientes` e a rota /cadastros/pacientes já existiam em
-- frontend/lib/permissions/routes.ts desde antes desta frente — o que faltava
-- era a tela e as colunas que ela precisa.
--
-- Nenhuma coluna nasce NOT NULL sem DEFAULT: `pacientes` tem linhas espelhadas
-- do TiTa que não têm esses dados e não podem fazer o próximo resync falhar.

alter table public.pacientes
  add column if not exists matricula            integer,
  add column if not exists tem_nome_civil       boolean,
  add column if not exists nome_civil           text,
  add column if not exists cor_raca             text,
  add column if not exists estado_civil         text,
  add column if not exists rg                   text,
  add column if not exists rg_orgao_emissor     text,
  add column if not exists rg_uf                text,
  add column if not exists rg_data_emissao      date,
  add column if not exists telefone_residencial text,
  add column if not exists falecido             boolean not null default false,
  -- NÃO é `foto_url`: o bucket `pacientes-fotos` é privado (20260826100400),
  -- então toda URL é ASSINADA e EXPIRA. Guardar URL assinada em coluna produz
  -- link morto em horas. Aqui vai o PATH do objeto; a URL é gerada no cliente.
  add column if not exists foto_path            text;

do $$
begin
  -- UNIQUE de constraint, não índice parcial: no Postgres o unique já permite N
  -- NULLs (e a maioria das linhas fica NULL, ver comentário de matricula), e é
  -- ele o backstop de corrida de proxima_matricula() em 20260826100100.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pacientes'::regclass
                   and conname = 'pacientes_matricula_key') then
    alter table public.pacientes
      add constraint pacientes_matricula_key unique (matricula);
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pacientes'::regclass
                   and conname = 'pacientes_matricula_positiva_check') then
    alter table public.pacientes
      add constraint pacientes_matricula_positiva_check
      check (matricula is null or matricula > 0);
  end if;

  -- Vocabulário IBGE (PNAD), em snake_case sem acento: a coluna é chave de
  -- agrupamento, não rótulo de tela — o label bonito é do frontend.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pacientes'::regclass
                   and conname = 'pacientes_cor_raca_check') then
    alter table public.pacientes
      add constraint pacientes_cor_raca_check
      check (cor_raca is null or cor_raca in
        ('branca', 'preta', 'parda', 'amarela', 'indigena', 'nao_declarada'));
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pacientes'::regclass
                   and conname = 'pacientes_estado_civil_check') then
    alter table public.pacientes
      add constraint pacientes_estado_civil_check
      check (estado_civil is null or estado_civil in
        ('solteiro', 'casado', 'divorciado', 'viuvo', 'separado', 'uniao_estavel'));
  end if;

  -- UF como CHECK de formato e não char(2): char(2) faz padding com espaço à
  -- direita, e comparação de string com padding já mordeu este projeto antes.
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.pacientes'::regclass
                   and conname = 'pacientes_rg_uf_check') then
    alter table public.pacientes
      add constraint pacientes_rg_uf_check
      check (rg_uf is null or rg_uf ~ '^[A-Z]{2}$');
  end if;
end $$;

-- Índice parcial: falecido é raro, e o filtro padrão da listagem é o contrário
-- (não-falecidos). Indexar só o lado raro mantém o índice pequeno.
create index if not exists idx_pacientes_falecido
  on public.pacientes (falecido) where falecido;

comment on column public.pacientes.matricula is
  'Número interno do paciente, auto-gerado apenas para origem_cadastro = ''pulsar'' (ver 20260826100100). Exibido com zero-padding de 5 dígitos via matricula_formatada(). NULL nas linhas espelhadas do TiTa — decisão explícita do usuário: numerar retroativamente colidiria com a numeração da base legada, que ainda vai ser importada em pacientes_matriculas_reservadas.';
comment on column public.pacientes.tem_nome_civil is
  'true quando o paciente usa nome social e o nome civil difere. `nome` continua sendo o NOME DE TRATAMENTO (o que aparece na agenda, no TiTa e nos relatórios) — esta coluna não muda o significado de `nome`.';
comment on column public.pacientes.nome_civil is
  'Nome de registro civil, preenchido só quando tem_nome_civil. Deve ser limpo pela tela quando o checkbox é desmarcado, para não ficar dado fantasma invisível.';
comment on column public.pacientes.falecido is
  'Marca de óbito. Deliberadamente INDEPENDENTE de `ativo`: um paciente pode estar inativo por alta e continuar vivo. A distinção importa para comunicação — nunca disparar cobrança ou aviso para falecido.';
comment on column public.pacientes.foto_path is
  'Path do objeto no bucket privado `pacientes-fotos`, no formato {id_paciente}/{arquivo}.{ext}. NUNCA guardar URL assinada aqui: ela expira.';
comment on column public.pacientes.rg_uf is
  'UF do órgão emissor do RG, duas maiúsculas.';

-- ===== Deprecação declarada das colunas legadas de responsável =====
-- NÃO são dropadas, e dropar quebraria duas coisas de uma vez:
--   1. o backfill do TiTa (20260817190100, linhas 120-186) escreve nelas a
--      partir de raw_json.favorecido.familiares[0];
--   2. frontend/services/pacientes.service.ts as lista NOMINALMENTE no array
--      COLUNAS — sumir com qualquer uma faz o PostgREST devolver 400 na
--      LISTAGEM INTEIRA de pacientes, não só no campo.
-- A verdade digitada passa a viver em public.responsaveis +
-- public.pacientes_responsaveis (20260826100200).
comment on column public.pacientes.responsavel_nome is
  'DEPRECADA para escrita manual. Espelho somente-leitura de raw_json.favorecido.familiares[0] do TiTa. A verdade digitada na tela /cadastros/pacientes está em public.responsaveis + public.pacientes_responsaveis (20260826100200). Em caso de divergência, o relacional vence na exibição.';
comment on column public.pacientes.responsavel_cpf        is 'DEPRECADA — ver comentário de responsavel_nome.';
comment on column public.pacientes.responsavel_email      is 'DEPRECADA — ver comentário de responsavel_nome.';
comment on column public.pacientes.responsavel_telefone   is 'DEPRECADA — ver comentário de responsavel_nome.';
comment on column public.pacientes.responsavel_parentesco is 'DEPRECADA — ver comentário de responsavel_nome.';
comment on column public.pacientes.responsavel_financeiro is
  'DEPRECADA — o responsável financeiro passa a ser a linha com tipo = ''financeiro'' em public.pacientes_responsaveis.';
