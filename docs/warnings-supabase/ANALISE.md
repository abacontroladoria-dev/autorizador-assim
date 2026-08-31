# Análise dos WARNINGS do Supabase Advisors

Data: 2026-08-17 · Branch: `analise/warnings-supabase` · Fonte: [warnings.md](warnings.md) (208 linhas)
**Status: diagnóstico rodado em produção.** Os números abaixo são medidos, não inferidos do repo.

Sequência: os **ERRORS** já foram resolvidos (17 views DEFINER, RLS de `usuarios`, blacklist do Fluxo Operacional). Nenhuma correção de WARNING foi aplicada ainda.

---

## 1. O que tem, em números

| # | Advisor | Qtd | Natureza |
|---|---------|-----|----------|
| 1 | `function_search_path_mutable` | 77 | Higiene / hardening |
| 2 | `anon_security_definer_function_executable` | 55 | **Exposição real** |
| 3 | `authenticated_security_definer_function_executable` | 48 | Subconjunto de #2 |
| 4 | `rls_policy_always_true` | 24 | Autorização interna |
| 5 | `extension_in_public` | 3 | Higiene, com acoplamento |
| 6 | `auth_leaked_password_protection` | 1 | 1 clique no painel |

**208 warnings, mas não 208 problemas.** #2 e #3 são a mesma lista vista por dois papéis, e quase tudo nelas vem de uma causa-raiz única.

---

## 2. Causa-raiz de #2 e #3: o `GRANT ... TO PUBLIC` implícito — **confirmada**

No PostgreSQL toda função nasce com `EXECUTE` para `PUBLIC`. Como `anon` e `authenticated` são membros de PUBLIC, conceder explicitamente a `service_role` **não tira nada de ninguém**.

Medição: **47 das 55** funções têm `execute_para_public = true`. As 8 que não têm são exatamente `email_por_username` e as 7 `robo_*` — as únicas do banco onde alguém escreveu `REVOKE ... FROM PUBLIC`.

Duas provas, agora com número:

**Prova A — o revoke que não pegou.** [20260701000001:71](../../supabase/migrations/20260701000001_extend_usuarios_central.sql#L71) revoga `custom_access_token_hook` de `authenticated, anon`. Medido hoje: `execute_para_public = true`, `anon_pode = true`, `auth_pode = true`. Revogar o papel não remove o grant de PUBLIC.

**Prova B — o revoke que pegou.** As `robo_*` fazem `REVOKE FROM PUBLIC, authenticated` + `GRANT TO anon`. Medido: `execute_para_public = false`, `anon_pode = true`, `auth_pode = false`. São as 7 linhas de diferença entre #2 e #3. **É o padrão a copiar.** (`robo_autenticar` está ainda mais fechada — nem anon alcança.)

### ✅ A armadilha que eu temia é pequena — mas existe

Achei que muitas funções dependessem só do PUBLIC e quebrariam caladas num revoke. O bloco 1b do diagnóstico mediu: **são 4**, todas no schema `central`.

```
central.ca_current_role()
central.current_organization_id()
central.claim_message_grouping_batch(uuid, integer, interval)
central.claim_send_queue_batch(uuid, integer, interval)
```
(+ `central.update_conversation_last_message_at()`, gatilho, mesmo estado)

Todo o resto já tem `service_role` explícito na ACL. **A Fase 2 é muito mais segura do que a estimativa inicial** — desde que essas 4 recebam `GRANT` antes do `REVOKE`.

### ⚠️ A armadilha que os dados revelaram: funções usadas dentro de policies RLS

Expressão de policy é avaliada com as permissões de quem consulta. Se `authenticated` perder `EXECUTE` numa função citada em policy, **a tabela inteira passa a dar permission denied** para usuário logado. As afetadas:

`public.is_admin()`, `public.is_diretoria()`, `public.fn_usuario_role()`, `public.get_user_unit()`, `public.remuneracao_has_role(text[])`, `public.fn_alerta_pode_ver(uuid)`, `central.ca_current_role()`, `central.current_organization_id()`.

Nessas oito, tirar `anon` — **nunca** `authenticated`.

---

## 3. As 55 funções, classificadas (com o medido)

| Grupo | Qtd | O que fazer | Risco |
|---|---|---|---|
| **A** — só service_role/cron | 20 | revoke de PUBLIC, anon, authenticated | baixo (service_role já explícito) |
| **B** — schema `central` (CRM) | 9 | grant service_role → revoke; 2 mantêm authenticated | médio (4 sem grant) |
| **C** — usuário logado, anon deve cair | 10 | revoke de PUBLIC e anon; **manter** authenticated | baixo |
| **D** — gatilhos, não expostos pelo PostgREST | 8 | revoke; some da lista sem mudar nada | nenhum |
| **E** — anon é intencional | 8 | **não mexer** | — |

### Grupo A (20) · prioridade alta
`upsert_atendimentos(jsonb)`, `upsert_occurrences(jsonb)`, `update_dashboard_snapshot()`, `refresh_dashboard_kpis()`, `fn_sync_grade_csv_em_lotes()`, `fn_sync_grade_execucao_em_lotes(int)`, `detect_r1..r7`, `detect_sessions_without_authorization()`, `count_test_data()`, `test_occurrences_view()`, `fn_alertas_avaliar_assim(date)`, `fn_orbita_sync_targets()`.

Chamadas por Edge Function com `service_role` ([cco-sync-tita-sessions:349](../../supabase/functions/cco-sync-tita-sessions/index.ts#L349), [cco-conciliation-engine:161](../../supabase/functions/cco-conciliation-engine/index.ts#L161), [sync:164](../../supabase/functions/sync/index.ts#L164)) ou por cron.

O pior caso segue sendo `upsert_atendimentos` / `upsert_occurrences`: **escrita de dado clínico com a anon key, sem login**.

*(As primas `batch_auto_resolve_occurrences`, `count_cco_records`, `get_cco_stats` e `sample_cco_data` são DEFINER e **não** aparecem no advisor — já tiveram o revoke de PUBLIC. Prova de que o padrão certo já foi aplicado em parte do CCO.)*

### Grupo B — `central` (9) · prioridade alta
`claim_message_grouping_batch`, `claim_send_queue_batch`, `cleanup_processed_queues`, `get_or_create_conversation_state`, `update_contact_ai_memory`, `update_conversation_state`, `ca_current_role`, `current_organization_id`, `update_conversation_last_message_at`.

Seis delas recebem `p_organization_id uuid` **como argumento** sendo `SECURITY DEFINER`: o isolamento entre organizações depende só de quem chama passar o id certo. Com execução anônima, é leitura e escrita cross-tenant sem autenticação. **Pergunta em aberto:** essas funções validam `p_organization_id` contra `central.current_organization_id()` internamente? Se não validam, o revoke é metade da correção — a outra metade é validar dentro da função.

**Quem chama as `claim_*` do Pulsar? Ninguém que eu tenha achado neste repo.** Uma varredura ampla aponta `whatsapp-sender` chamando `claim_send_queue_batch`, mas é pista falsa: [nina-api-oficial](../../nina-api-oficial/supabase/functions/whatsapp-sender/index.ts#L43) é **outro projeto Supabase** (`mlttucjfmqnzbctwysks`) e a função de lá é `public.claim_send_queue_batch(p_limit integer)` — nome igual, schema, assinatura e banco diferentes. A `central.claim_send_queue_batch(uuid, integer, interval)` do Pulsar é de um schema que entrou em produção há poucos dias e cujo worker talvez ainda não exista aqui. O `GRANT ... TO service_role` do script cobre o caso de existir; se aparecer um worker usando anon key, ele quebra — vale confirmar antes de commitar.

### Grupo C (10) · prioridade média
`get_dashboard_kpis()`, `get_cco_atendimentos(date,date)`, `fn_alerta_criar/comentar/status/pode_ver`, `fn_usuario_role()`, `get_user_unit()`, `is_admin()`, `is_diretoria()`, `remuneracao_has_role(text[])`.

`get_dashboard_kpis()` tem `GRANT ... TO anon` **deliberado** na migration e é DEFINER: KPI operacional legível sem login. Provável resíduo de quando a `/tv` lia direto, antes de passar por `/api/tv/*` com service_role. Precisa de `REVOKE ... FROM anon` explícito, o revoke de PUBLIC sozinho não resolve.

### Grupo D (8) · prioridade baixa
`handle_new_user`, `sync_user_activation`, `log_usuario_changes`, `log_usuario_permissao_changes`, `log_authorization_access`, `audit_rls_access_attempt`, `fn_set_criado_por`, `central.update_conversation_last_message_at`, + `rls_auto_enable` (event trigger).

O PostgREST não publica função que retorna `trigger`; não existe rota `/rpc/...` para elas. Ruído do advisor. O `EXECUTE` de gatilho é conferido no `CREATE TRIGGER`, não a cada disparo, então revogar é seguro — mas vale um INSERT de teste em `usuarios` depois.

### Grupo E (8) · não mexer
`email_por_username(text)` — usada em [login/page.tsx:30](../../frontend/app/login/page.tsx#L30) antes de existir sessão, fix do commit `d44d143`. Já está com `execute_para_public = false`; aparece no advisor só pelo grant nominal a anon, que é intencional.
As 7 `robo_*` — token por máquina, já corretas.

`custom_access_token_hook(jsonb)` fica à parte: só `supabase_auth_admin` precisa, o revoke de 2026-07-01 nunca teve efeito. Completar — mas **testar o login logo em seguida**, porque será a primeira vez que esse revoke de fato vale.

---

## 4. `function_search_path_mutable` (77)

Correção mecânica (`ALTER FUNCTION ... SET search_path = ...`), com uma armadilha **medida**:

**Só `pg_net` importa.** A varredura por dependência de extensão achou 9 funções, todas de `pg_net`, nenhuma de `unaccent` ou `http`:

```
fn_sync_grade_csv_em_lotes        search_path=public
fn_sync_grade_execucao_em_lotes   search_path=public
fn_sync_tita_grade                search_path=public
fn_sync_tita_grade_hoje           (NENHUM)
fn_sync_tita_hoje                 (NENHUM)
fn_sync_tita_operacional          (NENHUM)
fn_sync_tita_planejamento         (NENHUM)
fn_sync_tita_reconciliacao        (NENHUM)
fn_sync_tita_semana               (NENHUM)
```

Ou seja: **mover `pg_net` para `extensions` quebra as 9 rotinas de sync do TiTa** — as 3 com `search_path=public` quebram de imediato e para sempre; as 6 sem search_path quebram porque o cron roda com `"$user", public`. Se a decisão for mover, o path de todas as 9 tem que virar `public, extensions, pg_temp` **na mesma transação**.

Duas notas menores:
- Nenhum corpo de função referencia `unaccent()` ou `http_*()`. Antes de concluir que dá para dropar essas duas extensões, conferir views, índices e comandos de `cron.schedule` — o corpo da função não é o único lugar onde elas podem estar.
- Funções que atravessam schema precisam do schema no path. O banco já tem `search_path=central, public` e `public, central` em 12 funções do CRM; um `ALTER` cego em massa regride essas.

Também vale conferir quantas das 77 estão numa migration que *deveria* ter aplicado o `SET` e não aplicou — padrão "migration ausente do livro-caixa = código nunca executado".

---

## 5. `rls_policy_always_true` (24) e um achado maior ao lado

As 24 são todas para `authenticated`. **Não é exposição anônima**: é ausência de autorização *entre* papéis do app — qualquer logado (recepção, terapeuta, auditoria) escreve nessas tabelas.

| Tabela | Comandos com `true` |
|---|---|
| `acomp_conf`, `acomp_pac_bundles`, `acomp_prof_map` | INSERT, UPDATE, DELETE |
| `agenda_orbita`, `auditoria_glosa_motivos`, `autorizacoes`, `paciente_classificacao` | INSERT, UPDATE |
| `chamada_paciente`, `fila_autorizacoes_logs` | **ALL** |
| `controle_terapeutico` | INSERT |
| `sync_controle` | UPDATE |
| `logs` | INSERT ×3 (policies duplicadas) |

*(`csv_grades_profissionais` também tem `ALL true`, mas para `service_role` — o advisor ignora, e com razão: service_role passa por cima de RLS de qualquer jeito.)*

### 🔴 CONFIRMADO — o modelo de papéis da `fila_autorizacoes` nunca teve efeito

Policies permissivas se somam com **OR**: basta uma ampla para anular todas as finas. O bloco 6 mediu o texto de cada uma. Não é mais hipótese.

**`fila_autorizacoes` — o caso grave.** Existe esta policy:

```
"Usuarios autenticados podem acessar"   cmd = ALL   roles = {public}
   USING (auth.role() = 'authenticated')   WITH CHECK (auth.role() = 'authenticated')
```

`ALL` cobre SELECT, INSERT, UPDATE **e DELETE**. Como ela é permissiva e o qual é satisfeito por qualquer JWT válido, **todo usuário logado tem acesso total à fila** — e as sete policies granulares ao lado dela são decorativas:

| Policy | O que pretendia | Efeito real |
|---|---|---|
| `fila_autorizacoes_recepcao_no_delete` (`USING false`) | ninguém deleta | **anulada** — qualquer logado deleta |
| `fila_autorizacoes_recepcao_insert` | só `recepcao` insere | **anulada** |
| `fila_autorizacoes_autorizacao_update` | só `autorizacao`/`diretoria` | **anulada** |
| `fila_autorizacoes_recepcao_update` | só `recepcao` | **anulada** |
| `fila_autorizacoes_autorizacao` / `_recepcao_select` / `_terapeutico_select` | leitura por setor | **anuladas** (e `select_fila` = `true` já as anularia sozinha) |

A guarda `USING false` contra DELETE é ilusão pura: `false OR (auth.role() = 'authenticated')` = verdadeiro. Qualquer conta logada pode apagar linha da fila de autorizações.

**`autorizacoes`** — mesmo padrão, duas perdas concretas:
- `"select autorizacoes authenticated"` (`true`) anula `autorizacoes_recepcao_unit`, que restringia leitura por unidade (`dep IS NOT NULL` + `recepcao`/`diretoria`).
- `"insert autorizacoes authenticated"` (`WITH CHECK true`) anula `"insert autorizacao"` (`usuario_id = auth.uid()`) — **a garantia de autoria não existe**: dá para inserir em nome de outro usuário.
- O DELETE, esse funciona: `false OR admin` = admin. É o único par bem-formado do conjunto.

**`controle_terapeutico`** — `controle_terapeutico_insert_authenticated` (`WITH CHECK true`) anula `controle_terapeutico_therapeutic_insert`, que limitava a `terapeutico`/`terapeuta`/`admin`. Os SELECT/UPDATE/DELETE dessa tabela estão corretos.

**`agenda_terapias`** — três policies de SELECT (`true`, `true`, `auth.uid() IS NOT NULL`). Leitura aberta a logado provavelmente é o desejado; aqui é só limpeza: sobram 2.

**`usuarios` — bem-formada, sem policy ampla.** SELECT é `is_admin() OR auth.uid() = id OR is_diretoria()`; UPDATE é `is_admin() OR is_diretoria() OR auth.uid() = id`. É a única do lote onde a soma por OR é intencional e correta — resultado do trabalho dos ERRORS. Nada a fazer.

### ⚠️ Consequência direta para a Fase 3

As policies de `usuarios` chamam `is_admin()` e `is_diretoria()` — confirma, agora medido, que essas funções **não podem** perder `EXECUTE` de `authenticated`.

E aparece um detalhe novo: seis policies têm `roles = {public}`, não `{authenticated}` — incluindo as três de `usuarios`. Como `public` inclui `anon`, uma consulta anônima a `usuarios` **avalia** `is_admin()`. Hoje isso devolve `false` e zero linhas; depois do revoke de `anon`, devolveria `permission denied for function is_admin`. Troca de erro, não de exposição, mas quebra diferente.

Correção limpa e sem mudança de comportamento: retargetar essas policies para `authenticated` antes do revoke (o qual delas já exclui `anon` de qualquer forma). Está no bloco "FASE 3-PRÉ" do script.

### Quem quebra se as policies amplas caírem — medido

Bloco 7: 28 usuários ativos, 24 cobertos pelas granulares, **4 descobertos**.

| role | ativos | Quebra? |
|---|---|---|
| `rp` | 2 | 🔴 **sim, comprovado** |
| `cronograma` | 1 | ⚠️ provavelmente não — verificar |
| `disponibilidade_terapeuta` | 1 | ✅ não |

**`rp` quebra e dá para apontar a linha.** [presencaReal.ts:75](../../frontend/lib/remuneracao/presencaReal.ts#L75) faz `.from("fila_autorizacoes").select(...)` — leitura **direta na tabela**, com o `getSupabaseClient()` do navegador, ou seja no papel `authenticated`. É o índice de presença de `useRemuneracao`, que sustenta `/relacionamento-prestador/rp` — rota que o papel `rp` tem em [routes.ts](../../frontend/lib/permissions/routes.ts). Nenhuma policy granular da `fila_autorizacoes` cita `rp`. Derrubar as amplas hoje derruba a folha de pagamento dos 2 usuários de RP.

**E falha CALADO — corrigindo o que escrevi antes.** Eu disse que esse `select` lançaria erro. Está errado: aquele `throw` só dispara em `error`, e **RLS não gera erro, filtra linhas**. Sem policy para `rp`, a consulta volta com sucesso e zero linhas.

O efeito é o pior possível. O próprio arquivo documenta a consequência: *"sessão que não está no índice cai no fallback presente"*. Índice vazio ⇒ **toda falta vira presença ⇒ a folha paga sessão que não aconteceu, em silêncio.** É exatamente a classe de bug que o comentário em [presencaReal.ts:93](../../frontend/lib/remuneracao/presencaReal.ts#L93) registra ter custado caro antes, reintroduzida em escala total e sem sintoma na tela.

**`cronograma` provavelmente está fora.** O que lê `fila_autorizacoes` no módulo é a Previsão de Receitas (`faturamentoProjecao.ts`) e a Reposição de Faltas — e ambas saíram desse papel em 2026-07-24, restritas a admin/diretoria. Sobrou só menção em comentário. Vale confirmar `ocupacao_clinica` e `cronograma_por_paciente/por_profissional` antes de concluir.

**`disponibilidade_terapeuta` está fora por desenho** — [routes.ts:7](../../frontend/lib/permissions/routes.ts#L7) diz que o papel não entra no mapa, tem fluxo dedicado em rota própria. Não aparece em nenhum leitor de `fila_autorizacoes`.

### Dois leitores em TODA tela, sem gate de papel

[Sidebar.tsx:285](../../frontend/components/Sidebar.tsx#L285) conta `fila_autorizacoes` (`processando` e `erro`) a cada 30 s, em toda página do dashboard, para todo usuário logado. Sem policy, o papel descoberto vê **0** em vez do número real — cosmético, e discutivelmente até o correto.

[ModalErros](../../frontend/components/perfil/ModalErros.tsx#L62), aberto pelo menu do próprio Sidebar, é mais delicado: lê os erros e faz `UPDATE status='pendente'` para reprocessar. Sem policy de UPDATE, o `update` afeta **zero linhas sem erro** e o modal ainda dá `toast.success`. Botão que mente.

### Regra geral que sai daqui

**RLS não grita: ela some com a linha.** `SELECT` restrito devolve menos linhas com sucesso; `UPDATE`/`DELETE` restritos pelo `USING` afetam zero linhas sem erro (só o `WITH CHECK` levanta exceção). Toda tela que hoje depende da policy ampla vai degradar em silêncio, não quebrar visivelmente.

Isso eleva o custo da Fase 7: não basta decidir quem pode: é preciso **enumerar cada consumidor** de cada tabela antes do `DROP POLICY`. Feito para `fila_autorizacoes`; falta para as outras 11.

### INSERT do papel `autorizacao` — decidido

**Resposta do usuário (2026-08-17): `autorizacao` não escreve em `fila_autorizacoes`.** Logo, nenhuma policy de INSERT para esse papel; INSERT fica com `recepcao` e `admin`.

Confere com o código: o `insert` mora em [autorizacoes.service.ts:196](../../frontend/services/autorizacoes.service.ts#L196), usado pela tela de solicitação (rota de recepção). A rota do papel `autorizacao` é `/autorizacoes`.

**Ressalva de escopo:** essa mesma tela `/autorizacoes` faz dois **UPDATE** na fila — `cancelarExecucao()` (`status='cancelado'`) e `executarRobo()` (`status='pendente'`) em [autorizacoes/page.tsx:242](../../frontend/app/(dashboard)/autorizacoes/page.tsx#L242). Ou seja, `autorizacao` não insere, mas altera. A policy `fila_autorizacoes_autorizacao_update` já cobre exatamente isso e **fica como está** — a decisão acima trata só do INSERT. Se a intenção era "não escreve nada, nem alterar", esses dois botões param de funcionar (calados, conforme a regra acima) e é outra conversa.

Escritores que **não** são afetados (usam service_role e passam por cima da RLS): [release-stuck](../../frontend/app/api/automation/release-stuck/route.ts#L48) (a anon key ali só lê o cookie de sessão; o UPDATE é `supabaseService`) e as `robo_*`, que são SECURITY DEFINER.

### ✅ APLICADO EM PRODUÇÃO — 2026-08-17

As três policies amplas foram derrubadas e a `fila_autorizacoes_rp_select` criada. Desenho resultante, conferido no `pg_policies`:

| Comando | Quem pode |
|---|---|
| SELECT | `recepcao`, `terapeutico`, `autorizacao`, `diretoria`, `rp`, `admin` |
| INSERT | `recepcao`, `admin` |
| UPDATE | `recepcao`, `autorizacao`, `diretoria`, `admin` |
| DELETE | **`admin` apenas** |

O DELETE é o ganho concreto: `false OR admin` = admin. A guarda `fila_autorizacoes_recepcao_no_delete` passou a fazer o que o nome diz — até 2026-08-17 qualquer conta logada podia apagar linha da fila.

**Nota de execução:** o drop das amplas e o create da policy do `rp` foram aplicados em momentos separados, e entre um e outro a produção ficou com os 2 usuários `rp` lendo zero linhas da fila. Se alguém de RP abriu `/relacionamento-prestador/rp` nessa janela, o relatório daquela sessão tratou toda falta como presença. Vale reconferir qualquer fechamento gerado em 2026-08-17. É o argumento prático para a regra do §5: policy que dá acesso **antes** de policy que tira.

**Ainda em aberto nesta tabela:** o botão "reprocessar" do ModalErros (menu do Sidebar) agora é no-op silencioso para papel sem UPDATE, e ainda dá `toast.success`. Limitar o botão por papel ou criar policy — decisão pendente.

Este bloco inteiro não é mecânico: cada policy exige decisão de "quem pode". Vai por último e por tabela. As três `acomp_*` são a menor superfície e o melhor lugar para estrear o padrão. Os 3 INSERT idênticos de `logs` são limpeza pura: −2 warnings, zero mudança de comportamento.

---

## 6. `extension_in_public` (3) e `auth_leaked_password_protection` (1)

- **Extensões**: `pg_net`, `unaccent`, `http`. Contra o que eu supus antes, as funções da extensão **não** entram nos 77 — o advisor as ignora. Então mover não zera nada além dos 3 warnings, e custa as 9 funções de sync (§4). Recomendação: **aceitar os 3 warnings** ou tratar `pg_net` como último item do projeto.
- **Leaked password protection**: toggle em Auth → Policies. Só afeta cadastro/troca de senha, não o login por username. Fazer e esquecer.

---

## 7. Ordem sugerida

| Fase | Escopo | Warnings | Estado |
|---|---|---|---|
| 0 | Diagnóstico | 0 | ✅ feito |
| 6 | Investigar policies sobrepostas (§5) | 0 | ✅ feito — virou achado maior que o advisor |
| 7a | RLS da `fila_autorizacoes` | 2 | ✅ **em produção 2026-08-17** |
| 2+3 | Grupos A/B/C/D + hook + retarget de policies | ~103 | ✅ **em produção 2026-08-17** (ver ressalva abaixo) |
| 4 | `search_path` nas 77 | 77 | ✅ **em produção 2026-08-17** |
| 1 | Toggle leaked password | 1 | pendente — 1 clique |
| 5 | Duplicatas de policy em `logs` | 2 | pendente — limpeza pura |
| 7b | RLS `always_true`, outras 11 tabelas | 22 | pendente — decisão de produto, uma a uma |
| 8 | Mover `pg_net` (opcional) | 3 | não recomendado — quebra 9 syncs |

**Placar: 208 → 52.** Dos 52 que restam, **24 são exposição deliberada** e vão ficar: 16 funções que `authenticated` precisa executar (`remuneracao_has_role` sozinha é citada por policies de 24 tabelas) e as 8 do Grupo E abertas a `anon` de propósito. O teto realista é ~24, não zero.

### Fase 2+3 — o que foi medido depois de aplicar

Conferência pós-aplicação: **de 55 funções abertas a `anon`, restaram 8** — `email_por_username` e as 7 `robo_*`, exatamente o Grupo E. Nenhum helper de policy perdeu `authenticated` (`remuneracao_has_role`, que vale 24 tabelas, intacta).

**Ressalva:** os 4 `grant ... to service_role` do bloco 0 não executaram junto com o resto — o ACL das quatro funções do `central` ficou sem `service_role` depois do commit. Foram aplicados em separado. Mesmo padrão do incidente da `fila_autorizacoes`: a parte de cima do arquivo ficou de fora e a de baixo aplicou. **Lição operacional: conferir se há seleção ativa no editor antes de rodar, e sempre validar o estado depois — o script "rodou" nas duas vezes sem erro.**

## 8. Artefatos

- [`20260817_diagnostico_warnings.sql`](../../supabase/snippets/20260817_diagnostico_warnings.sql) — somente leitura, já rodado
- [`20260817_warnings_fase2_3_revokes.sql`](../../supabase/snippets/20260817_warnings_fase2_3_revokes.sql) — Fases 2 e 3, com grants na ordem certa, rollback e conferência final
- [`20260817_rls_fila_autorizacoes.sql`](../../supabase/snippets/20260817_rls_fila_autorizacoes.sql) — Fase 7 parcial: cria a policy do `rp` e derruba as 3 amplas da fila, com os 6 testes de app obrigatórios
- [`20260817_diagnostico_info_rls_sem_policy.sql`](../../supabase/snippets/20260817_diagnostico_info_rls_sem_policy.sql) — §9, somente leitura, já rodado
- [`20260817_info_rls_limpeza.sql`](../../supabase/snippets/20260817_info_rls_limpeza.sql) — §9, aplicação: trava de segurança, DROP das 9 mortas, `COMMENT` nas 5 que ficam

---

## 9. Os 18 INFO `rls_enabled_no_policy` — o problema é o oposto

RLS ligada **sem policy nenhuma** nega tudo para `anon` e `authenticated`; `service_role` e `SECURITY DEFINER` passam por cima. Não há exposição neste grupo — é o inverso dos warnings. O advisor marca INFO porque o estado é ambíguo: pode ser "fechado de propósito" ou "esqueci a policy".

O risco é o de sempre: **RLS não grita, ela some com a linha.** Uma tela que leia uma dessas tabelas pelo cliente do navegador mostra "nenhum resultado" e ninguém percebe.

### Por que as 18 estão assim

Não foi esquecimento. Existe um **event trigger** `rls_auto_enable()` ([`remote_schema.sql:1322-1339`](../../supabase/migrations/20260518131652_remote_schema.sql#L1322-L1339)) que liga RLS em todo `CREATE TABLE` do schema `public` — inclusive `CREATE TABLE AS`, que é como os cinco backups nasceram. O banco fecha sozinho; a *policy* é que é o ato deliberado. O INFO 0008 é o efeito colateral desse default, e o default é bom.

### Classificação, com o medido em 2026-08-17

| Grupo | Tabelas | Medição | Veredito |
|---|---|---|---|
| 1 — backups | `agenda_tita_autorizacao_backup_20260508`, `backup_fila_null_terapia`, `fila_autorizacoes_backup_titaid`, `fila_bkp_titaid_faltas_jun`, `vw_central_pacientes_backup_20260508` | 6.910 linhas, ~2,4 MB, escrita entre 07/05 e 03/07, **zero dependentes** | **DROP** |
| 2 — fechado certo | `robo_config`, `robo_pacotes`, `edge_rate_limits`, `sync_status`, `dashboard_kpis_cache` | Todas vivas — `dashboard_kpis_cache` com 4.784 updates, o último às 17:01 de hoje | **Manter.** `COMMENT` só |
| 3 — guias-digitais | `guia_terapias`, `terapeutas`, `guias_processadas` | Origens com **0 linhas e 0 inserts na vida inteira**; `guias_processadas` parada em 13/05 | Decisão de produto |
| 4 — entulho | `controle_disponibilidade_terapeutas`, `terapeuta_eventos`, `tita_grade_profissionais`, `pre_auditoria_snapshot` | 0 linhas, 0 inserts, nenhum consumidor | **DROP** |
| 4 — exceção | `crm_inconsistencias` | 79 linhas, todas de 20/05 00:18, nada desde; **nenhum job em `cron.job`** | **Manter.** Relatório manual |

Os contadores de `pg_stat_user_tables` valem para a vida inteira das tabelas: as criadas em 08/05 ainda exibem seus inserts (775, 1.611, …), logo não houve `pg_stat_reset` desde então.

`vw_central_pacientes_backup_20260508` é **tabela**, apesar do prefixo `vw_` — é um snapshot congelado da view, não a view.

### Grupo 2: a ausência de policy É a proteção

Medido no repositório: `robo_config`/`robo_pacotes` só são lidos de dentro das `robo_*` `SECURITY DEFINER` ([`20260813100200_robo_rpcs.sql:114`](../../supabase/migrations/20260813100200_robo_rpcs.sql#L114), `:320`, `:367`); `edge_rate_limits` só pela `auth-lookup-username` com `supabaseAdmin`; `sync_status` só pelas Edge Functions de sync; `dashboard_kpis_cache` via `get_dashboard_kpis()`. Criar policy aqui seria abrir acesso que hoje não existe. O `COMMENT` é para o próximo que olhar o advisor não "consertar" isso. **O INFO continua aberto de propósito — este grupo nunca deve fechar.**

### Grupo 3: a feature nunca funcionou, e não é culpa da RLS

Minha hipótese inicial era que a RLS estava bloqueando uma tela viva. **A medição desmentiu isso**, e de um jeito mais útil: `guia_terapias` e `terapeutas` têm **0 linhas e 0 inserts na vida inteira da tabela**. `guias_processadas` tem 14 linhas para 24 inserts e parou em **13/05**.

Logo, `/guias-digitais` rodou em maio já com as tabelas de origem vazias. **O carimbo do terapeuta nunca existiu** — todo PDF que passou por ali saiu com o verso em branco, e isso independe de RLS. A tela continua no menu (`canAccess("/guias-digitais")`), oferecendo uma função que não tem como funcionar.

Existe, ainda assim, um **bug latente** no caminho. `/guias-digitais` chama a Edge Function `processar-guias` ([`page.tsx:53`](../../frontend/app/(dashboard)/guias-digitais/page.tsx#L53)), e ela monta o cliente com a service_role key **mas injeta o JWT do usuário no header `Authorization`** ([`index.ts:55-57`](../../supabase/functions/processar-guias/index.ts#L55-L57)):

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false },
})
```

O PostgREST resolve o papel pelo **JWT**, não pela apikey. Então as três queries de `processar-guias` correm como `authenticated`, e a RLS vale para elas — o `INSERT` em `guias_processadas` sequer confere o retorno ([`index.ts:353`](../../supabase/functions/processar-guias/index.ts#L353)). Hoje isso não quebra nada, porque não há o que ler. Passa a quebrar **no instante em que alguém popular `terapeutas`**.

Existe uma rota Next equivalente, [`/api/guias-digitais/processar`](../../frontend/app/api/guias-digitais/processar/route.ts), que faz o mesmo com `supabaseService` e não teria o problema — mas está morta, ninguém chama. `MIGRATION_STATUS.md:151` a marca como "safe to remove": quem sobreviveu foi a versão com o defeito.

Duas saídas, e **nenhuma é criar policy**:

- **(a) matar a feature** — tirar `/guias-digitais` do menu e dropar as 3 tabelas;
- **(b) fazer funcionar** — popular `terapeutas`/`guia_terapias` **e** corrigir a Edge Function para usar um cliente service_role de verdade (sem o `Authorization` do usuário), mantendo o `verifyAuthenticatedUser` que ela já faz.

Criar policy em `terapeutas` abriria `carimbo_digital` — assinatura de profissional — para qualquer usuário logado.

### `crm_inconsistencias`: relatório manual, fica

Não existe job em `cron.job` para ela — a função `executar_relatorio_crm_inconsistente` está exposta como RPC ([`types/supabase.ts:5346`](../../types/supabase.ts#L5346)) mas ninguém a chama, nem cron nem frontend. É um relatório manual de qualidade de dado sobre o número de CRM do médico, e o pipeline de canonização de CRM (`fn_set_crm_uf`, `trg_canonizar_crm_agenda_orbita`, `ajustar_crm_fila`) segue vivo. Dropar o último artefato de auditoria desse pipeline para fechar um INFO é mau negócio: 32 kB, 79 linhas, nenhum risco. Tratada como o Grupo 2 — documentar e deixar.

### O que não fazer

Fechar os 18 criando policy em cada tabela seria trocar 18 INFO por 18 superfícies novas de acesso. O Grupo 1 e as 4 vazias do Grupo 4 fecharam **por remoção**; o Grupo 2 e `crm_inconsistencias` ficam abertos de propósito; só o Grupo 3 ainda depende de decisão, e é decisão de produto, não de RLS.

### Placar dos INFO: 18 → 9

**Aplicado em produção 2026-08-17**, migration [`20260817180000_limpeza_info_rls_sem_policy.sql`](../../supabase/migrations/20260817180000_limpeza_info_rls_sem_policy.sql). Estado conferido **fora da transação** — o `select` de conferência que vive dentro do `begin/commit` devolve o mesmo resultado com `rollback`, então não prova nada sozinho.

Dos 9 que restam, 6 são deliberados e devem continuar abertos (as 5 do Grupo 2 + `crm_inconsistencias`). Os 3 do Grupo 3 são o único trabalho real que sobra, e é decidir o destino de `/guias-digitais`.
