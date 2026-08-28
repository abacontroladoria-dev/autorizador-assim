-- ============================================================================
-- fila_autorizacoes.criado_por — trigger + backfill via machine_id
-- ----------------------------------------------------------------------------
-- Problema: criado_por ficava NULL em ~22 mil registros. O login/frontend só
-- preenchia no INSERT novo e mal encostava (12 de 22029), e os caminhos de
-- UPDATE (falta/conclusão manual) e o robô não gravavam nada. Resultado: a
-- Ficha Operacional / "Solicitado por" ficava em branco para quase tudo.
--
-- Solução: o machine_id está SEMPRE presente, e a tabela maquinas mapeia cada
-- estação ao usuário (maquinas.user_id -> usuarios.nome), dando o nome real da
-- atendente de forma DINÂMICA (sem hardcode — trocar a atendente de estação é
-- só atualizar maquinas.user_id). Um trigger BEFORE INSERT/UPDATE preenche
-- criado_por quando nulo, cobrindo todos os writers; um backfill conserta o
-- histórico. O fix de login no frontend continua como reforço para machine_id
-- 'WEB' (estações sem cadastro em maquinas).
-- ============================================================================

-- ── Função do trigger (SECURITY DEFINER: lê maquinas/usuarios sob RLS) ───────
create or replace function public.fn_set_criado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.criado_por is null and new.machine_id is not null then
    select u.nome
      into new.criado_por
    from public.maquinas m
    join public.usuarios u on u.id = m.user_id
    where m.id = new.machine_id
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_criado_por on public.fila_autorizacoes;
create trigger trg_set_criado_por
  before insert or update on public.fila_autorizacoes
  for each row
  execute function public.fn_set_criado_por();

-- ── PREVIEW do backfill (rode antes, se quiser conferir; não escreve) ────────
-- select count(*) as linhas_a_preencher
-- from public.fila_autorizacoes f
-- join public.maquinas m on m.id = f.machine_id
-- join public.usuarios u on u.id = m.user_id
-- where f.criado_por is null and u.nome is not null;

-- ── Backfill do histórico (fill-when-null) ───────────────────────────────────
update public.fila_autorizacoes f
set criado_por = u.nome
from public.maquinas m
join public.usuarios u on u.id = m.user_id
where f.machine_id = m.id
  and f.criado_por is null
  and u.nome is not null;
