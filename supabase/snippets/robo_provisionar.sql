-- ============================================================
-- robo-autorizador: runbook de provisionamento
--
-- Diferente dos outros arquivos desta pasta, este NAO e um pacote
-- de migrations para aplicar de uma vez. E um receituario: cada
-- bloco e rodado sozinho, quando a situacao pedir.
--
-- REGRA DESTE ARQUIVO
-- O repositorio e PUBLICO. Nada aqui pode ser commitado preenchido.
-- Os blocos 1 e 4 tem lacunas (<...>): preencha no SQL Editor,
-- execute, e NAO salve o arquivo com o valor dentro.
--
-- Depende de: 20260813_robo_seguranca_producao.sql ja aplicado.
-- ============================================================


-- ============================================================
-- 1. SENHA DA ASSIM NO VAULT              [rodar uma vez, e a cada troca]
-- ============================================================
-- O robo recebe esta senha pela RPC robo_obter_config_assim e a usa
-- so em memoria. Ela nunca e gravada no disco de nenhum PC.
--
-- CONTEXTO: a senha que estava em robo-autorizador/.env ate agora esta
-- no historico publico do git (recuperavel com
-- `git show ac7cc39:robo-autorizador/.env`). Troque a senha no portal
-- da ASSIM ANTES de cadastrar aqui — nao adianta esconder melhor uma
-- senha que ja vazou.

-- 1a. Primeira vez:
-- select vault.create_secret('<SENHA_NOVA_DA_ASSIM>', 'assim_senha');

-- 1b. Trocas seguintes (o id vem da consulta abaixo):
-- select id, name, created_at, updated_at from vault.secrets where name = 'assim_senha';
-- select vault.update_secret('<UUID_DO_SEGREDO>', '<SENHA_NOVA_DA_ASSIM>');

-- 1c. Conferir que o robo consegue ler (mostra a senha — cuidado com a tela):
-- select decrypted_secret from vault.decrypted_secrets where name = 'assim_senha';


-- ============================================================
-- 2. CADASTRAR UMA MAQUINA E GERAR O TOKEN        [uma vez por PC]
-- ============================================================
-- Gera 256 bits aleatorios, guarda so o SHA-256 e devolve o token em
-- claro UMA unica vez. Nao ha como recupera-lo depois — se perder,
-- rode o bloco 4 e gere outro.
--
-- Copie o valor da coluna `token` para o assistente do instalador
-- naquele PC. Ele o grava ja protegido por DPAPI, entao o arquivo
-- resultante nao serve em nenhuma outra maquina.
--
-- Troque 'recepcao-01' pelo identificador daquele PC. Esse mesmo valor
-- e o que aparece na central como origem da solicitacao.

/*
with novo as (
  select 'recepcao-01'::text                              as machine_id,
         encode(extensions.gen_random_bytes(32), 'hex')    as token
)
insert into public.maquinas (id, nome, ativa, token_hash, token_criado_em, created_at, updated_at)
select machine_id, machine_id, true,
       encode(sha256(convert_to(token, 'UTF8')), 'hex'), now(), now(), now()
  from novo
on conflict (id) do update
   set token_hash        = excluded.token_hash,
       token_criado_em   = now(),
       token_revogado_em = null,
       ativa             = true,
       updated_at        = now()
returning id,
          (select token from novo) as token,
          'ANOTE AGORA - nao aparece de novo' as aviso;
*/

-- ATENCAO ao rodar isto numa maquina que ja existe: o `on conflict` acima
-- TROCA o token. O robo que estiver rodando la para de autenticar no
-- proximo heartbeat, ate receber o token novo. Para so consultar antes de
-- decidir, use o bloco 3.


-- ============================================================
-- 3. INVENTARIO DA FROTA                                 [consulta]
-- ============================================================
-- Quem esta online, em que versao, e quem ainda nao migrou para token.

select id                                              as maquina,
       ativa,
       case
         when token_hash is null            then 'SEM TOKEN (ainda usa service_role)'
         when token_revogado_em is not null then 'REVOGADA em ' || token_revogado_em::date
         else 'ok'
       end                                             as credencial,
       coalesce(app_version, '?')                      as versao,
       hostname,
       last_seen,
       case
         when last_seen is null                    then 'nunca conectou'
         when last_seen > now() - interval '2 min' then 'online'
         else 'offline ha ' || date_trunc('minute', now() - last_seen)::text
       end                                             as situacao
  from public.maquinas
 order by ativa desc, last_seen desc nulls last;


-- ============================================================
-- 4. REVOGAR / PAUSAR / REINICIAR                     [operacao do dia]
-- ============================================================

-- 4a. Revogar o token (PC roubado, perdido, ou desligado da clinica).
--     Efeito imediato: a proxima chamada do robo e recusada. Reversivel
--     so gerando token novo (bloco 2).
-- update public.maquinas set token_revogado_em = now(), ativa = false
--  where id = '<machine_id>';

-- 4b. Pausar sem revogar. O robo continua batendo heartbeat e aparece
--     online, mas nao recebe tarefa. E o que o painel ja faz.
-- update public.maquinas set ativa = false where id = '<machine_id>';
-- update public.maquinas set ativa = true  where id = '<machine_id>';

-- 4c. Pedir reinicio. O robo consome a marca no proximo heartbeat, sai,
--     e o supervisor do start.bat o relanca em ~5s.
--     (Antes desta entrega isso so o matava ate o proximo logon do Windows.)
-- update public.maquinas set restart_solicitado = true where id = '<machine_id>';


-- ============================================================
-- 5. AJUSTES DE COMPORTAMENTO SEM PENDRIVE               [config viva]
-- ============================================================
-- Toda a configuracao do formulario da ASSIM mora em robo_config. Se a
-- ASSIM mudar um rotulo, uma URL ou um codigo, e um update aqui — o robo
-- pega no proximo ciclo, sem reinstalar nada em PC nenhum.

-- select * from public.robo_config where id = 1;

-- Exemplos:
-- update public.robo_config set assim_login_url = 'https://autorizador.assim.com.br/' where id = 1;
-- update public.robo_config set max_abas_abertas = 5,  aba_ttl_minutos = 45 where id = 1;
-- update public.robo_config set poll_ms_ativo = 1000, poll_ms_ocioso = 5000 where id = 1;
-- update public.robo_config set modal_timeout_ms = 900000 where id = 1;  -- 15 min


-- ============================================================
-- 6. AUTO-UPDATE                                    [liberar versao]
-- ============================================================
-- O pacote e montado e ASSINADO fora do banco, por
-- scripts/publicar-robo.mjs, que insere a linha em robo_pacotes com
-- publicado = false. Este bloco so libera para a frota.

-- select versao, publicado, created_at, notas from public.robo_pacotes order by created_at desc;

-- Liberar (uma versao por vez — o heartbeat oferece a publicada mais recente):
-- update public.robo_pacotes set publicado = true  where versao = '<versao>';

-- Voltar atras: despublicar. Quem ja atualizou nao regride sozinho, mas
-- ninguem novo pega a versao ruim.
-- update public.robo_pacotes set publicado = false where versao = '<versao>';

-- Acompanhar a adocao:
-- select coalesce(app_version,'?') as versao, count(*) as maquinas,
--        max(ultima_atualizacao) as ultima
--   from public.maquinas where token_hash is not null
--  group by 1 order by 2 desc;
