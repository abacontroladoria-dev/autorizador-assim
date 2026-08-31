-- ─────────────────────────────────────────────────────────────────────────────
-- O de-para de glosa só aprende texto que NÃO tem cara de truncado.
--
-- O QUE ACONTECEU (produção, poucas horas depois de 20260820150000 entrar):
--
--   codigo | descricao                              | origem
--   -------+----------------------------------------+--------
--   1013   | CADASTRO DO BENEFICIARIO COM PROBLEMAS | manual
--   1601   | REINCIDENCIA NO ATEN                   | recibo   <-- cortado
--
-- O 1601 entrou pelo trigger, com o texto cortado em 25 caracteres. A premissa
-- de 20260820150000 era que linha em `status='glosa'` carrega o texto do recibo,
-- que é completo. É falso: o sync do relatório também carimba `status_assim`
-- nessas linhas, e o que ele traz é o texto truncado pela ASSIM. Medido: TODAS
-- as linhas 'glosa' hoje em produção têm status_assim com 25 caracteres.
--
-- O guarda de comprimento que já existia só age no ON CONFLICT — protege o
-- código que JÁ está no de-para, não o que chega pela primeira vez. E é a
-- primeira vez que importa: um código aprendido cortado fica cortado, e ainda
-- passa a impressão de já ter sido resolvido.
--
-- A REGRA NOVA: só aprende quando o texto tem MAIS de 25 caracteres — o
-- comprimento exato em que a ASSIM corta. Um motivo completo real passa disso
-- ("1013-CADASTRO DO BENEFICIARIO COM PROBLEMAS" tem 43); o truncado tem
-- exatamente 25, e a forma cancelada ("1601-REINCIDENCI *") tem 18. Motivo
-- curto de verdade fica de fora, e isso é deliberado: não há como distinguir um
-- texto curto legítimo de um cortado, e um de-para com texto duvidoso é pior
-- que um de-para vazio — o vazio mostra o truncado e deixa claro que falta
-- alguém escrever; o duvidoso mente com cara de resolvido.
--
-- A limpeza retroativa usa a mesma regra, reconstruindo o texto que o trigger
-- viu (codigo || '-' || descricao): apaga exatamente o que não teria sido
-- aprendido hoje. Só mexe em linha 'recibo' — o que uma pessoa escreveu à mão
-- não se apaga por heurística.
-- ─────────────────────────────────────────────────────────────────────────────

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
