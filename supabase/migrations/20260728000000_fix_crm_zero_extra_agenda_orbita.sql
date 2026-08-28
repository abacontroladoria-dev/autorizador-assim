-- ITEM 2 — Saneamento único do CRM corrompido com "0" extra.
--
-- Causa: a fonte Órbita injeta, de forma intermitente, um "0" logo após o
-- prefixo "52" do CRM, gerando um número de 10 dígitos (ex.: 5201146424) no
-- lugar do correto de 9 (521146424). A esteira grava o valor verbatim e a view
-- agenda_tita_autorizacao o repassa à fila/robô. Padrão confirmado em toda a
-- base: TODO CRM de 10 dígitos começa com "520" (assinatura estável em vários
-- médicos), e o valor certo é a mesma sequência sem o "0" da 3ª posição.
--
-- Esta migration é ADITIVA e IDEMPOTENTE: só corrige linhas que ainda batem no
-- padrão ^520\d{7} (10 dígitos). Após corrigidas passam a 9 dígitos e deixam de
-- casar, então rodar de novo é no-op. Não cria tabelas, triggers nem views.
--
-- Correção contínua: a canonização também foi movida para o momento da
-- sincronização em supabase/functions/sync/index.ts (canonizarCrm), de modo que
-- novas gravações em agenda_orbita já entram normalizadas e a view apenas
-- consome o dado limpo.

-- 1) agenda_orbita.crm (dígitos) — fonte lida pela view
update public.agenda_orbita
set crm = '52' || substring(crm from 4)
where crm ~ '^520\d{7}$';

-- 2) agenda_orbita.crm_numero (algumas linhas também vieram corrompidas)
update public.agenda_orbita
set crm_numero = '52' || substring(crm_numero from 4)
where crm_numero ~ '^520\d{7}$';

-- 3) agenda_orbita.crm_formatado ("<numero>/<uf>")
update public.agenda_orbita
set crm_formatado = '52' || substring(crm_formatado from 4)
where crm_formatado ~ '^520\d{7}(/|$)';

-- 4) fila_autorizacoes.crm — corrige o histórico e destrava reprocessos
--    (WHERE limita apenas às linhas corrompidas; concluídas ficam consistentes)
update public.fila_autorizacoes
set crm = '52' || substring(crm from 4)
where crm ~ '^520\d{7}$';
