-- Cadastra a maquina do robo-laudos (container Coolify) em public.maquinas,
-- no mesmo esquema de identidade por maquina do robo-autorizador (ver
-- 20260813100000_robo_identidade_por_maquina.sql e 20260813100200_robo_rpcs.sql).
--
-- Rode em DUAS ETAPAS no SQL Editor do Supabase.

-- ---------------------------------------------------------------------------
-- ETAPA 1 — gerar o token em claro. Aparece SO AGORA, nunca mais.
-- ---------------------------------------------------------------------------
select encode(gen_random_bytes(32), 'hex') as token_claro;

-- Copie o valor de "token_claro" acima. Ele vai para o Coolify como
-- MACHINE_TOKEN (Secret) do recurso robo-laudos-orbita.

-- ---------------------------------------------------------------------------
-- ETAPA 2 — colar o token copiado no lugar de SEU_TOKEN_AQUI abaixo e rodar.
-- Só o hash SHA-256 fica gravado; o valor em claro não é armazenado.
-- ---------------------------------------------------------------------------
insert into public.maquinas (id, nome, ativa, hostname, token_hash, token_criado_em)
values (
  'robo-laudos',
  'Robo de Laudos do Orbita (Coolify)',
  true,
  'coolify',
  encode(sha256(convert_to('SEU_TOKEN_AQUI', 'UTF8')), 'hex'),
  now()
)
on conflict (id) do update
  set token_hash        = excluded.token_hash,
      token_criado_em   = excluded.token_criado_em,
      token_revogado_em = null,
      ativa             = true;

-- ---------------------------------------------------------------------------
-- Conferencia — deve devolver 1 linha, ativa=true, token_revogado_em nulo.
-- ---------------------------------------------------------------------------
select id, nome, ativa, hostname, token_criado_em, token_revogado_em
  from public.maquinas
 where id = 'robo-laudos';
