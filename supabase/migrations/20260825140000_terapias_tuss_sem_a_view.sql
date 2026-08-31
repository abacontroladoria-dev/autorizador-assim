-- listar_terapias_tuss para de ler uma view em que ninguém tem grant.
--
-- O DEFEITO
-- A função nasceu (20260825130000) lendo `public.agenda_tita_autorizacao` e é
-- SECURITY INVOKER. Só que essa VIEW não tem GRANT para papel nenhum — o baseline
-- concede select em `agenda_tita` (a tabela) para anon/authenticated/service_role,
-- e na view só existe grant para o `agenda_tita_autorizacao_backup_20260508`.
-- Medido contra produção: leitura direta da view devolve
--
--   {"code":"42501","message":"permission denied for view agenda_tita_autorizacao"}
--
-- O resto do sistema não tropeça nisso porque nunca lê a view DIRETAMENTE: ela é
-- referenciada de dentro de `vw_central_pacientes` e de RPCs, e uma view lê suas
-- dependências com o privilégio do PRÓPRIO dono, não do chamador. Quem faz select
-- na view é que precisa de grant — e era o que a função fazia. O dropdown de
-- terapias da página de avulsas viria vazio, com erro no console.
--
-- A CORREÇÃO
-- Ler `public.agenda_tita` (que TEM grant e tem policy de select para
-- `authenticated`, 20260525000000) e chamar `public.tuss_da_sessao()` diretamente
-- — exatamente o que `fn_blocos_assim` faz (20260824020000:111-128), e pelo mesmo
-- motivo. O mapa de TUSS continua vindo de UM lugar só; o que sai de cena é a
-- dependência de grant na view, não o mapa.
--
-- Os filtros são os mesmos da view: `ativo = true` (ler `agenda_tita` sem isso
-- traz terapia duplicada), os dois nomes não-pessoa, e TUSS não nulo.
--
-- A janela vai de 90 para 180 dias, igual à de `listar_pacientes_assim`: duas
-- listas da mesma tela discordarem sobre o que é "recente" é uma inconsistência
-- gratuita.
--
-- SEM filtro de convênio, de propósito. O mapa de TUSS é o mesmo para todos os
-- convênios, e restringir a '%assim%' esconderia da tela uma terapia que a ASSIM
-- ainda não viu nesta janela mas para a qual se quer justamente uma avulsa.

CREATE OR REPLACE FUNCTION public.listar_terapias_tuss()
RETURNS TABLE (terapia text, codigo_tuss text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
-- Declarado DENTRO da função: `create or replace` descarta o proconfig posto por
-- ALTER FUNCTION, calado (reference_create_or_replace_perde_proconfig).
SET statement_timeout = '10s'
AS $$
  SELECT DISTINCT
         at.terapia_exibicao_nome,
         public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome)
  FROM public.agenda_tita at
  WHERE at.data_atendimento >= current_date - 180
    AND at.ativo = true
    AND at.paciente_nome <> ALL (ARRAY['Horário Administrativo', 'Notificação Prévia'])
    AND public.tuss_da_sessao(at.terapia_exibicao_nome, at.terapia_id, at.terapia_nome) IS NOT NULL
  ORDER BY 1
$$;

COMMENT ON FUNCTION public.listar_terapias_tuss() IS
  'Pares terapia -> TUSS para a página de autorizações avulsas, de agenda_tita + tuss_da_sessao(). NÃO lê agenda_tita_autorizacao: aquela view não tem GRANT para papel nenhum, e leitura direta dela devolve 42501. Nunca re-inlinar o CASE do TUSS no cliente.';

-- ---------------------------------------------------------------------------
-- Grants: revogar de `anon` EXPLICITAMENTE
-- ---------------------------------------------------------------------------
-- `REVOKE ... FROM PUBLIC` não basta neste projeto. Há `ALTER DEFAULT PRIVILEGES`
-- no schema `public` concedendo EXECUTE a anon/authenticated em toda função nova
-- (documentado em 20260818090000_insumos_rpcs.sql:468), e revogar de PUBLIC não
-- remove uma concessão DIRETA a `anon`. Medido: com a anon key, as duas funções
-- criadas em 20260825130000 executavam.
--
-- Não havia exposição de dado — as duas são SECURITY INVOKER, então a RLS e os
-- grants das tabelas barravam o anon de qualquer forma (`listar_pacientes_assim`
-- devolvia zero linhas, e esta aqui batia no 42501 da view). Mas "não vaza porque
-- outra camada segurou" não é o mesmo que "não é alcançável", e uma dessas funções
-- devolve nome e carteirinha de paciente: se algum dia virar SECURITY DEFINER, a
-- porta já estaria aberta. Fechar agora custa duas linhas.
REVOKE EXECUTE ON FUNCTION public.listar_terapias_tuss()   FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_pacientes_assim() FROM anon;

GRANT EXECUTE ON FUNCTION public.listar_terapias_tuss()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_pacientes_assim() TO authenticated;
