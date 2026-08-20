-- Rodar no SQL Editor do projeto remoto (wmugemamnqxjfpxrlwes).
-- Identico a supabase/migrations/20260820160000_glosa_aprende_so_texto_completo.sql
--
-- URGENTE-ish: corrige o trigger criado por 20260820150000, que aprendeu um
-- texto CORTADO. Medido em producao horas depois daquele bloco entrar:
--
--   1013 | CADASTRO DO BENEFICIARIO COM PROBLEMAS | manual
--   1601 | REINCIDENCIA NO ATEN                   | recibo   <-- cortado
--
-- A premissa errada era que linha em status='glosa' carrega o texto do recibo.
-- O sync do relatorio tambem carimba status_assim nessas linhas, e o que ele
-- traz e o texto truncado em 25 caracteres pela ASSIM. Sem esta correcao, o
-- primeiro relatorio sincronizado de cada codigo envenena o de-para com a
-- versao cortada — e cortado no de-para e pior que ausente, porque passa a
-- impressao de resolvido.
--
-- Aplica a regra "so aprende texto com mais de 25 caracteres" e apaga
-- retroativamente o que nao teria sido aprendido por ela (so linhas de origem
-- 'recibo'; o que uma pessoa escreveu a mao nao se apaga por heuristica).
--
-- Testado no Postgres local: sete cenarios — truncado de 25ch, forma cancelada
-- de 18ch, completo com codigo, completo sem codigo, linha que nao e glosa,
-- substituicao por texto mais longo e tentativa de rebaixar.

begin;

create or replace function public.aprender_codigo_glosa()
returns trigger
language plpgsql
security definer
as $$
declare
  -- Onde a ASSIM corta o texto do relatório. Medido na tabela inteira em
  -- 2026-08-20: todos os motivos vindos de lá têm exatamente este comprimento.
  c_corte_assim constant integer := 25;
  v_texto     text;
  v_codigo    text;
  v_descricao text;
begin
  -- Blindagem: aprender vocabulário JAMAIS pode derrubar a conclusão de uma
  -- tarefa do robô. Qualquer erro aqui é engolido e o UPDATE segue — a linha da
  -- fila é o dado que importa, o de-para é conveniência.
  begin
    if new.status is distinct from 'glosa' or new.status_assim is null then
      return new;
    end if;

    v_texto := btrim(new.status_assim);

    -- O filtro que faltava. Sem ele, o primeiro relatório sincronizado de cada
    -- código envenena o de-para com a versão cortada.
    if length(v_texto) <= c_corte_assim then
      return new;
    end if;

    -- Só a forma "1013-TEXTO". Sem código não há chave de de-para.
    if v_texto !~ '^\s*\d{3,5}\s*-' then
      return new;
    end if;

    v_codigo    := btrim(split_part(v_texto, '-', 1));
    v_descricao := nullif(btrim(regexp_replace(v_texto, '^\s*\d{3,5}\s*-\s*', '')), '');

    if v_descricao is null then
      return new;
    end if;

    insert into public.glosa_codigos as g (codigo, descricao, origem, atualizado_em)
    values (v_codigo, v_descricao, 'recibo', now())
    on conflict (codigo) do update
       set descricao     = excluded.descricao,
           origem        = excluded.origem,
           atualizado_em = now()
     -- Segundo guarda, agora só para o caso de dois textos completos de
     -- comprimentos diferentes: fica o mais longo.
     where length(excluded.descricao) > length(g.descricao);
  exception when others then
    return new;
  end;

  return new;
end;
$$;

alter function public.aprender_codigo_glosa() set search_path = public, pg_temp;

-- Limpeza retroativa: o que o trigger aprendeu antes da regra existir e que não
-- teria sido aprendido depois dela.
delete from public.glosa_codigos
 where origem = 'recibo'
   and length(codigo) + 1 + length(descricao) <= 25;

commit;

-- =============================================================================
-- Conferencia: o vocabulario depois da limpeza. Esperado: so o 1013 manual.
-- Qualquer linha 'recibo' que sobre deve ter descricao visivelmente completa.
-- =============================================================================
select codigo, descricao, origem,
       length(codigo) + 1 + length(descricao) as tam_original
  from public.glosa_codigos
 order by codigo;

-- =============================================================================
-- Livro-caixa
-- =============================================================================
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260820160000', 'glosa_aprende_so_texto_completo')
on conflict (version) do nothing;
