-- FASE 2 — security_invoker nas views (2026-08-17)
-- REESCRITO com a saída real do diagnóstico de produção. O gerador que estava
-- aqui antes cumpriu o papel; agora os lotes estão fixos e conferidos à mão.
--
-- Confirmado no BLOCO 1: as 17 views são DEFINER e TODAS com anon_pode_ler=true.
-- A Fase 1 (revoke anon) é o que mata a exposição. Esta fase é defesa em
-- profundidade + deixar o lint verde.
--
-- CORREÇÃO DE LEITURA: o veredito automático marcou `fila_autorizacoes` e
-- `autorizacoes_assim` como "restritiva", e está errado. Lendo as policies:
--   fila_autorizacoes  -> 7 policies permissivas, e uma delas é literalmente
--                         `true`, mais `(auth.role() = 'authenticated')` e
--                         `(auth.uid() IS NOT NULL)`. Policies permissivas se
--                         somam em OR, então a tabela está escancarada pra
--                         qualquer autenticado.
--   autorizacoes_assim -> `(auth.role() = 'authenticated')`, mesma coisa.
-- Ou seja: flipar view sobre essas duas NÃO muda nada pra quem está logado.
--
-- (À parte: aquela policy `true` em fila_autorizacoes é o C7 da auditoria de
-- 2026-07-06 — os `USING(true)` que sobreviveram ao hardening. Não é assunto
-- desta fase, mas continua de pé e devia entrar na lista.)
--
-- As restritivas DE VERDADE são só quatro:
--   controle_terapeutico  -> roles terapeutico/terapeuta/admin/diretoria
--   maquinas              -> própria máquina, ou admin
--   csv_reposicao_faltas  -> remuneracao_has_role(admin, diretoria)
--   cco.occurrences       -> admin/diretoria/recepcao (view morta, ver Fase 1)


-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 1 — policies nas 3 tabelas cegas (corrige bug ao vivo, e destrava 4 views)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `config_regras_terapias`, `terapias_controle` e `paciente_medico_vigente` têm
-- RLS LIGADA e NENHUMA policy. Com grant pra authenticated e zero policy, o
-- resultado é 0 linhas — a RLS nega tudo, menos pro dono da tabela. Confirmado
-- nas duas pontas: pg_policies em produção não devolveu nada, e não existe
-- `create policy` pra nenhuma das três em migration nenhuma.
--
-- BUG AO VIVO que isso causa hoje, independente de views:
-- components/home/FluxoOperacional/index.tsx:104-111 lê
-- `config_regras_terapias` pelo client do browser (authenticated) pra montar a
-- blacklist de terapias, e faz `blacklistData ?? []`. Como a leitura volta
-- vazia, a blacklist é sempre um Set vazio e o filtro da linha 113-116 não
-- exclui terapia nenhuma. O card Fluxo Operacional conta escola/casa desde
-- 2026-06-11 (migration 20260611000006 populou a blacklist e deu o grant, mas
-- nunca criou a policy). Falha calada: sem erro, sem log, número só errado.

begin;

-- Config/regra de negócio, não é dado de paciente: leitura pra qualquer logado.
drop policy if exists config_regras_terapias_select_authenticated on public.config_regras_terapias;
create policy config_regras_terapias_select_authenticated
  on public.config_regras_terapias for select to authenticated using (true);

drop policy if exists terapias_controle_select_authenticated on public.terapias_controle;
create policy terapias_controle_select_authenticated
  on public.terapias_controle for select to authenticated using (true);

-- Vínculo paciente-médico. É dado de paciente, mas o critério aqui é coerência
-- com agenda_tita, que já é `using (true)` pra authenticated desde
-- 20260525000000 — nome de paciente e agenda inteira já são legíveis por
-- qualquer logado. Deixar esta tabela mais fechada que a agenda não protegeria
-- nada e só quebraria agenda_tita_autorizacao_v2.
drop policy if exists paciente_medico_vigente_select_authenticated on public.paciente_medico_vigente;
create policy paciente_medico_vigente_select_authenticated
  on public.paciente_medico_vigente for select to authenticated using (true);

-- Estas 3 também estavam abertas pro anon por grant explícito
-- (20260520005510 e 20260611000006). Fecha.
revoke all on public.config_regras_terapias   from anon;
revoke all on public.terapias_controle        from anon;
revoke all on public.paciente_medico_vigente  from anon;

commit;

-- Depois deste passo, recarregue a home e confira que o Fluxo Operacional
-- mudou de número — é a blacklist voltando a funcionar. Se NÃO mudar, a
-- blacklist estava vazia por outro motivo e vale investigar antes de seguir.


-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 2 — LOTE 1: flip seguro, bases todas com policy permissiva ampla
-- ═════════════════════════════════════════════════════════════════════════════
-- Estas são as 5 que o gerador aprovou sozinho. Bases: agenda_tita,
-- agenda_orbita, grade_profissionais_tita, acomp_auditoria — todas `using(true)`.

begin;
alter view public.agenda_tita_autorizacao          set (security_invoker = true);
alter view public.vw_acomp_auditoria               set (security_invoker = true);
alter view public.vw_modal_substituicao_terapeutas set (security_invoker = true);
alter view public.vw_profissionais_disponiveis     set (security_invoker = true);
alter view public.vw_terapeutas_semana             set (security_invoker = true);
commit;

-- Por que flipar `agenda_tita_autorizacao` (que alimenta outras 5 views) não
-- derruba as de cima: as outras seguem DEFINER, então elas leem a inner view
-- como o DONO delas (postgres). Dono de tabela ignora RLS a menos que exista
-- FORCE ROW LEVEL SECURITY. Confirme que não existe:
--
--   select relname, relrowsecurity, relforcerowsecurity
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and relforcerowsecurity;
--
-- Se essa query voltar vazia (esperado), o flip de baixo pra cima é seguro e
-- incremental. Se voltar alguma linha, pare e me avise.
--
-- VALIDAR agora, logado como usuário NÃO-admin (seu login de admin passa por
-- is_admin() e não testa nada):
--   [ ] /central-terapeutas carrega  (vw_modal_substituicao_terapeutas, vw_terapeutas_semana)
--   [ ] modal de substituição lista terapeutas  (vw_profissionais_disponiveis)
--   [ ] /agenda carrega  (agenda_tita_autorizacao, via agenda.service.ts)


-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 3 — LOTE 2: seguro pela releitura das policies (fila/autorizacoes_assim)
-- ═════════════════════════════════════════════════════════════════════════════
-- Só rode depois de validar o LOTE 1. Ordem importa: de baixo pra cima, porque
-- vw_central_autorizacoes depende de vw_match_autorizacoes_assim.

begin;
alter view public.vw_faltas_pacientes          set (security_invoker = true);
alter view public.vw_match_autorizacoes_assim  set (security_invoker = true);
alter view public.vw_central_autorizacoes      set (security_invoker = true);
commit;

-- VALIDAR como não-admin:
--   [ ] /solicitar carrega a lista do dia   (vw_central_autorizacoes)
--   [ ] card Fluxo Operacional na home      (vw_central_autorizacoes)
--   [ ] faltas / reposição onde usa vw_faltas_pacientes


-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 4 — depois do PASSO 1, estas destravam. Rode só após validar o LOTE 2.
-- ═════════════════════════════════════════════════════════════════════════════
-- Ficavam bloqueadas apenas por config_regras_terapias / paciente_medico_vigente,
-- que ganharam policy no PASSO 1. Ordem de baixo pra cima:
--   vw_auditoria_autorizacoes_assim alimenta vw_kpis_auditoria_assim.

begin;
alter view public.agenda_tita_autorizacao_v2       set (security_invoker = true);
alter view public.vw_blocos_autorizaveis_assim     set (security_invoker = true);
alter view public.vw_auditoria_autorizacoes_assim  set (security_invoker = true);
alter view public.vw_kpis_auditoria_assim          set (security_invoker = true);
commit;

-- VALIDAR como não-admin:
--   [ ] /auditoria-assim: KPIs com número (não zero) e tabela populada
--   [ ] blocos autorizáveis aparecem em /solicitar
--   [ ] agenda_tita_autorizacao_v2 onde é usada (agenda.service.ts)


-- ═════════════════════════════════════════════════════════════════════════════
-- PASSO 5 — RESOLVIDO EM 2026-08-17. Ver o bloco APLICADO no fim do arquivo.
-- ═════════════════════════════════════════════════════════════════════════════
-- As 4 views abaixo dependem de tabela com policy genuinamente restritiva.
-- Flipar aqui MUDA O QUE CADA PAPEL VÊ. Pode ser exatamente o certo — ou pode
-- esvaziar tela pra metade da equipe. Precisa da sua decisão, não do meu palpite.
--
-- vw_controle_terapeutico  e  vw_central_terapeutica
--   base: controle_terapeutico, restrita a terapeutico/terapeuta/admin/diretoria.
--   Efeito: usuário `recepcao` ou `autorizacao` para de ver esses dados. Se o
--   join for INNER, não é coluna vazia — a LINHA desaparece. /central-pacientes
--   e /central-terapeutas usam vw_central_terapeutica.
--   Pergunta: recepção deve ver controle terapêutico? Se sim, a policy da tabela
--   é que está errada (falta o papel), não a view.
--
-- vw_central_pacientes
--   bases restritivas: controle_terapeutico (acima) + maquinas
--   (`auth.uid() = user_id` ou admin).
--   Efeito de `maquinas`: "Solicitado por" fica em branco pra todo mundo que não
--   for admin, porque a linha da máquina é de outro usuário. Isso derruba na
--   prática o que a 20260730000000 construiu (criado_por via maquinas).
--   Provável saída: policy de SELECT em `maquinas` liberando leitura do
--   mapeamento máquina->usuário pra authenticated (não é dado sensível: é nome
--   de estação), mantendo a escrita fechada.
--
-- vw_reposicao_faltas
--   base: csv_reposicao_faltas, restrita a admin/diretoria via
--   remuneracao_has_role(). Aqui a restrição parece INTENCIONAL (dado de
--   remuneração). Flipar provavelmente é correto e o efeito desejado é que
--   quem não é admin/diretoria pare de ver. Mas hooks/useReposicaoFaltas.ts
--   consome isso — confirme quem usa a tela antes.
--
-- occurrences
--   Não flipe: dropar. Ver Fase 1. É ponte morta pro schema cco.


-- ═════════════════════════════════════════════════════════════════════════════
-- APLICADO EM PRODUÇÃO — 2026-08-17. 11 das 17 (ver PENDENTE no fim do bloco).
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Método de validação (vale reusar): flipar e comparar a MESMA view lida como
-- dono (postgres ignora RLS por ser dono, sem FORCE em nenhuma tabela — checado)
-- contra lida como usuário real. Igual = a RLS não subtraiu nada.
--
-- Duas armadilhas descobertas medindo:
--   1. `set local role authenticated` SEM JWT deixa auth.role() NULL, então a
--      policy `auth.role() = 'authenticated'` de autorizacoes_assim reprova e o
--      probe dá FALSO NEGATIVO. Corrigido com
--      `set local request.jwt.claims = '{"role":"authenticated","sub":"<uuid>"}'`.
--   2. Comparar duas medições em INSTANTES diferentes não vale em tabela viva: o
--      robô escreve no meio (vimos match_assim ir de 100 -> 105). Direção positiva
--      já descarta RLS (policy só subtrai), mas para rigor use o mesmo snapshot
--      ou aceite só igualdade exata medida em janela curta.
--   3. O SQL Editor devolve só o resultado do ÚLTIMO statement — dono e usuário
--      precisam de execuções separadas.
--
-- Passo 1 (policies nas 3 cegas): aplicado. config_regras_terapias passou de
--   0 para 12 linhas visíveis ao app; terapias_controle 19; paciente_medico_vigente 230.
--   Anon revogado nas 3 (confirmado com 42501).
--
-- Passo 2 (5 views), dono = usuário em todas:
--   agenda_tita_autorizacao 1000* | vw_acomp_auditoria 0 (tabela vazia, sem teste
--   de regressão) | vw_modal_substituicao_terapeutas 1000* |
--   vw_profissionais_disponiveis 1000* | vw_terapeutas_semana 172
--   (* amostra saturada no teto de 1000; detecta queda a zero, não perda parcial)
--
-- Passo 3 (3 views), contagem exata, dono == usuário rp:
--   vw_faltas_pacientes 5043 | vw_match_autorizacoes_assim 105 | vw_central_autorizacoes 36930
--
-- Passo 4 (4 views): aplicado na SEGUNDA tentativa. A primeira não pegou, e as
--   contagens colhidas na hora (51671 / 25494 / 30443 / 1, iguais dos dois lados)
--   NÃO validaram nada: com a view ainda definer, ler como usuário também ignora a
--   RLS, então a igualdade era tautologia. Só foi descoberto ao conferir pg_class
--   no fim do dia — 6 views apareceram como DEFINER quando eu já dava 16 por feitas.
--   LIÇÃO DE MÉTODO: ler `reloptions` no MESMO script do ALTER (select depois do
--   commit, que é o statement que o editor devolve), senão um ALTER não executado
--   se disfarça de teste aprovado.
--   Revalidado com a view já invoker: agenda_tita_autorizacao_v2 51671 exato.
--
-- Passo 5a (2 no-ops): vw_central_pacientes e vw_controle_terapeutico.
--   vw_central_pacientes NÃO é lida por ninguém como dado — a RPC
--   listar_central_pacientes a usa só como `RETURNS SETOF`, isto é, tipo de
--   retorno. Por isso o flip é inerte ali (e por isso a view não pode ser
--   dropada). RPC segue respondendo: 116 linhas. vw_controle_terapeutico não tem
--   consumidor em .ts/.tsx, edge function ou robô.
--
-- Passo 5b (2 que exigiam decisão):
--
--   vw_reposicao_faltas — *** NÃO APLICADO ***, segue DEFINER. O diagnóstico e a
--   decisão continuam valendo: não era escolha, era correção. /cronograma/reposicao
--   exige a permissão `reposicao_faltas`, que só admin e diretoria têm (o papel
--   `cronograma` perdeu em 2026-07-24, ver comentário em
--   frontend/lib/permissions/routes.ts:62-65). Mas proxy.ts é gate de NAVEGAÇÃO:
--   um `rp` não abria a tela e ainda assim lia as 31.717 linhas de remuneração
--   consultando a view direto com a chave do browser, porque definer ignora RLS.
--
--   vw_central_terapeutica — flipada APÓS ampliar a policy, por decisão do usuário
--   de preservar o que a equipe já vê. O cruzamento que motivou:
--     /central-pacientes   = permissão `gestao`             -> admin, diretoria, recepcao
--     /central-terapeutas  = permissão `escala_terapeutica` -> admin, diretoria, rp, terapeutico
--   e a policy de controle_terapeutico só contemplava terapeutico/terapeuta/admin/
--   diretoria. `recepcao` e `rp` perderiam as colunas (sem perder linha — é LEFT
--   JOIN na linha 68). Policy nova ADITIVA (permissivas somam em OR, então não há
--   risco de estreitar o que existia):
--
--     create policy controle_terapeutico_select_gestao_escala
--       on public.controle_terapeutico for select to authenticated
--       using (exists (select 1 from public.usuarios u
--                       where u.id = auth.uid() and u.ativo = true
--                         and u.role = any (array['recepcao','rp'])));
--
--   Validado: controle_terapeutico 23079 para rp e para recepcao (= dono), e
--   vw_central_terapeutica 39794 nos dois (= dono). O segundo número também prova
--   a policy de terapias_controle do Passo 1, porque ali o join é INNER, não LEFT.
--
-- Também revogado: execute on function listar_central_pacientes(date) from anon.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PENDENTE (estado conferido em pg_class ao fim de 2026-08-17)
-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 1 está 100%: `anon_pode_ler = false` nas 17. A exposição não autenticada,
-- que era o risco real, está fechada — o que falta abaixo é defesa em
-- profundidade e o lint.
--
-- 16 das 17 invoker, conferidas em reloptions. Revalidação por contagem, já com a
-- view invoker (portanto evidência real, não tautologia): agenda_tita_autorizacao_v2
-- 51671, vw_blocos_autorizaveis_assim 25494, vw_auditoria_autorizacoes_assim 30443
-- — todas exatas contra a leitura sem filtro. Só vw_kpis_auditoria_assim (alvo 1)
-- ficou sem confirmação, e é a de menor risco: agrega sobre a
-- vw_auditoria_autorizacoes_assim, cujas bases já foram provadas.
--
-- vw_reposicao_faltas VALIDADA: dono 6354 == diretoria 6354, e rp 0. Atenção ao
-- comparar: 31717 é a contagem da TABELA csv_reposicao_faltas, não da view — a
-- view agrega. Confundi as duas e cravei um alvo errado no meio da validação.
-- A policy é remuneracao_has_role(['admin','diretoria']), função do papel e não da
-- linha: ou libera tudo ou nada, então nunca produziria um número intermediário.
--
-- Query de estado final — rode SEMPRE depois de qualquer ALTER, antes de medir:
--
--   select c.relname,
--          coalesce((select option_value from pg_options_to_table(c.reloptions)
--                     where option_name = 'security_invoker'), '(DEFINER)') as security_invoker,
--          has_table_privilege('anon', c.oid, 'SELECT') as anon_pode_ler
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'v'
--    order by security_invoker, c.relname;
--
-- E `occurrences`, a 17ª: não flipar — dropar, aguardando confirmação.
