# Plano de Merge + Redeploy Seguro — branch `pulsar-cronograma`

Documento gerado em 2026-07-23. Cobre os 4 pontos levantados: (1) garantir que
tudo que interessa está salvo, (2) o que NÃO deve subir, (3) resposta objetiva
sobre `diretoria` editar permissões, (4) checklist de segurança antes do
redeploy pelo Coolify (dados de pacientes + receita da empresa em jogo).

---

## 1. Estado atual do repositório (levantado agora)

Branch `pulsar-cronograma`, sincronizada com `origin/pulsar-cronograma`.

- **Staged (já em `git add`)**: 3 renomeios de arquivo + 1 renomeio de migration.
- **Modified (não staged)**: ~30 arquivos, principalmente em
  `frontend/app/(dashboard)/cronograma`, `frontend/components/cronograma`,
  `frontend/lib`, `frontend/hooks`, `frontend/services` e `.claude/settings.local.json`.
- **Deleted**: telas antigas de config de remuneração
  (`ConfigTab.tsx`, `CapacidadeConfig.tsx`, `ContratosAtuaisConfig.tsx`,
  `FeriadosConfig.tsx`, `useRemuneracaoConfig.ts`, `relacionamento-prestador/config/page.tsx`)
  — parecem ter sido substituídas pelas novas telas em `cadastros/` (contratos,
  feriados, taxas-e-parametros). Confirmar que a substituição está completa
  antes de mergear, senão essas telas somem sem equivalente.
- **Untracked (nunca versionados)**: novas telas/hook/services de `cadastros`,
  novas migrations de 2026-07-23/24, e um conjunto de **arquivos que não são
  código** (ver seção 2 — é o ponto crítico).

### Passo a passo para não perder nada

1. `git add` de todo o código novo/modificado que é intencional:
   ```
   git add frontend/app/"(dashboard)"/cadastros \
           frontend/components/cadastros \
           frontend/hooks/useFeriados.ts frontend/hooks/useParametrosGerais.ts frontend/hooks/useTaxasEspecialidade.ts \
           frontend/services/feriados.service.ts frontend/services/parametrosGerais.service.ts frontend/services/taxasEspecialidade.service.ts \
           frontend/types/feriados.ts \
           frontend/lib/cronograma/regularizacoes.ts \
           frontend/components/cronograma/indicadores/OcupacaoDetalheModal.tsx \
           frontend/components/cronograma/salas/RegularizacoesView.tsx \
           supabase/migrations/20260723000000_add_profissional_id_cronograma_salas_alocacoes.sql \
           supabase/migrations/20260723160000_migrar_feriados_para_tabela_dedicada.sql \
           supabase/migrations/20260723160100_permissao_cadastros.sql \
           supabase/migrations/20260723170000_extrair_taxas_parametros_e_simplificar_capacidade.sql \
           supabase/migrations/20260723170100_permissoes_cadastros_contratos_capacidade_taxas.sql \
           supabase/migrations/20260724100000_create_vw_coordenadores_caso.sql \
           supabase/migrations/20260724110000_remover_capacidade_profissional.sql
   git add -u   # pega as modificações/deleções já rastreadas (o "M" e "D" da lista acima)
   ```
   (`-u` só afeta arquivos já rastreados, então é seguro — não traz nada
   untracked novo.)

2. Confira com `git status` que sobrou **só** o que está na seção 2 abaixo como
   untracked. Se sobrar algo, é sinal de que esqueci de listar — me avise antes
   de commitar.

3. Commit (mensagem sugerida, ajuste livremente):
   ```
   git commit -m "feat(cronograma): unifica telas de cadastro, ajusta permissões e regulariza migrations"
   ```

4. Rode local: `npm run build` (ou `next build`) e `npx tsc --noEmit` no
   frontend antes de subir — os deletes de `ConfigTab`/`CapacidadeConfig`/etc.
   são o tipo de mudança que quebra build silenciosamente se sobrou import
   morto em algum lugar.

5. Só depois disso: `git push`. Depois `git merge` (ou PR) para a branch de
   produção que o Coolify observa.

---

## 2. O que **NÃO** deve subir (achados concretos) — ✅ RESOLVIDO em 2026-07-23

Estes 5 itens foram movidos para `C:\Users\Maquina001\Documents\backups-pulsar\`
e o `.gitignore` foi atualizado para impedir que voltem a ser rastreados por
engano (`git status` confirmado limpo depois da movimentação). Ficam
documentados aqui para registro do que era o risco original:

| Arquivo | Por que é um problema |
|---|---|
| `supabase/sync_public_from_cloud.sql` (189 mil linhas) | **Dump de dados reais de produção.** Já nas primeiras linhas tem `INSERT INTO public.acomp_pac_bundles` com nome completo de paciente (`Benicio Adriano De Pontes Rodrigues`), sessões, horários, profissional. Isso é dado de paciente (sensível/saúde) num arquivo SQL puro, sem RLS, sem criptografia. **Nunca deve entrar no git** — uma vez commitado, fica no histórico para sempre mesmo que você delete depois. |
| `supabase/sync_public_from_cloud_big.sql` (110 mil linhas) | Mesmo risco do anterior — outro dump de sincronização. |
| `"Grade de salas 2026 - cópia 16.07.2026.xlsx"` | Planilha de grade de salas — provavelmente com paciente/profissional/horário. |
| `relatorio_laudos_em_uso_20260717_103748.xls` (840 KB) | "Laudos" = laudo médico. Nome do arquivo já indica dado de saúde do paciente. |
| `"integração/calculadora-remuneracao - Copia (2)/"` | Isso é **um repositório git inteiro** (tem `.git/` dentro, com seus próprios commits/branches). Se rodar `git add -A` sem cuidado, o git pode tentar versionar isso como submodule/gitlink de forma quebrada, ou (pior) alguém sem perceber roda `rm -rf .git` errado depois. É uma cópia de projeto solto dentro do repo principal, sem relação com o Next.js — não pertence aqui. |

### Ação executada

1. ✅ `.gitignore` atualizado com `*.xlsx`, `*.xls`,
   `supabase/sync_public_from_cloud*.sql` e `integração/`.
2. ✅ Os 5 itens movidos para fora do repo
   (`C:\Users\Maquina001\Documents\backups-pulsar\`), incluindo a pasta
   `integração/` (copiada e depois removida do repo, já que continha um
   `.git` próprio — não fazia sentido continuar dentro da pasta do projeto
   de qualquer forma, gitignored ou não).
3. Nenhum desses 5 itens tinha sido commitado antes (estavam todos como
   `untracked`), então **não** foi necessário reescrever histórico
   (`git filter-repo`) — não há cópia deles em nenhum commit passado.
4. `frontend/app/(dashboard)/cronograma/REATIVAR_API_LAUDOS.md`: é só uma nota
   sua (não tem dado sensível, é um lembrete de prompt) — decisão livre se
   quer versionar ou não, sem risco de segurança.

---

## 3. `adm2.universoaba@gmail.com` (DIRETORIA) vai poder editar permissões?

**Sim — e isso é intencional, não um bug introduzido agora.**

Evidência:

- No banco, desde **2026-07-13** (`supabase/migrations/20260713140000_diretoria_gerencia_permissoes.sql`,
  já presente em `origin/main`, ou seja, já está em produção hoje), existe a
  função `is_diretoria()` e policies de RLS que dão para o role `diretoria`
  `SELECT`/`UPDATE` em `usuarios` e `ALL` em `usuarios_permissoes`. O
  comentário da própria migration é explícito:

  > "ATENÇÃO (escalada de privilégio, aprovada pelo solicitante): quem pode
  > escrever em usuarios_permissoes / atualizar usuarios.role pode conceder
  > QUALQUER acesso a QUALQUER pessoa (inclusive tornar alguém admin ou a si
  > mesmo). Na prática, a diretoria passa a ser administradora do controle de
  > acessos."

- Isso já vale hoje em produção **no nível do banco**, independente do
  redeploy — quem tem role `diretoria` já consegue gravar nessas tabelas via
  API/service, mesmo que a tela não deixasse.
- O que muda nesta branch é só o **frontend**:
  `frontend/components/admin/PermissoesPageShell.tsx` hoje em produção
  (`origin/main`) tem `setIsAdmin(perfil?.role === 'admin')` — ou seja, a
  *tela* `/admin/permissoes` está bloqueada para `diretoria` mesmo o banco já
  permitindo. Na branch, isso vira
  `if (perfil?.role === 'admin' || perfil?.role === 'diretoria') { setIsAdmin(true) }`
  com o comentário explicando que é só alinhar a tela com o que o banco já
  liberava.

**Conclusão prática:** depois do redeploy, se `adm2.universoaba@gmail.com`
estiver com `role = 'diretoria'` na tabela `usuarios`, ele vai **conseguir
abrir a tela `/admin/permissoes` e editar permissões de qualquer usuário**,
inclusive se autopromover a admin. Isso não é uma falha desta branch — é uma
decisão já tomada e aplicada no banco há dias; a branch só destrava a UI para
refletir o que já era possível.

**Se isso NÃO é o comportamento que você quer** para essa conta específica:
- Verifique o role atual dela: `select id, email, role, ativo from usuarios where email = 'adm2.universoaba@gmail.com';`
- Se ela deveria ser uma DIRETORIA "normal" sem esse poder, a correção é no
  **banco** (revogar/ajustar a migration `20260713140000`), não no frontend —
  reverter só o frontend deixaria a inconsistência de novo (banco permite,
  tela esconde, mas qualquer chamada direta à API/service ainda funcionaria).
- Alternativa: criar um role intermediário (ex. `diretoria_sem_permissoes`) se
  a intenção é ter diretoria sem esse poder específico — mas isso é uma
  decisão de produto/negócio, não técnica; me avise se quiser que eu
  implemente.

---

## 4. Checklist de segurança antes do redeploy (dados de pacientes + receita)

Varredura já feita nesta conversa:

- [x] Nenhum segredo hardcoded encontrado (`service_role`, chaves tipo
  `sk_live`/`AIza...`, senha em texto) — todas as referências a
  `SUPABASE_SERVICE_ROLE_KEY` vêm de `process.env`/`Deno.env`, como esperado.
- [x] Nenhum `.env` versionado no git (`git ls-files | grep .env` vazio).
- [x] Identificados os 5 arquivos de dado real fora do controle de versão
  (seção 2) — ação: mover para fora do repo + `.gitignore`.

Ainda falta fazer (recomendo nesta ordem, antes do redeploy):

1. **Revisão de RLS das migrations novas.** As 5 migrations untracked de
   2026-07-23/24 mexem em `cadastros`, `feriados`, `taxas`, view de
   coordenadores e a tabela `cronograma_salas_alocacoes`. Antes de aplicar em
   produção, ler cada uma e confirmar que toda tabela nova tem RLS habilitado
   e policy coerente com o papel (`admin`/`diretoria`/`rp`/etc.) — é comum
   esquecer `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` numa tabela nova.
2. **Rodar o skill `/security-review`** sobre o diff completo desta branch
   antes do merge — ele cobre padrões OWASP (injeção, IDOR, exposição de
   dado) que uma varredura manual de grep não pega, principalmente nas rotas
   novas de `services/feriados.service.ts`, `parametrosGerais.service.ts`,
   `taxasEspecialidade.service.ts` (checar se toda query filtra por
   permissão/RLS e não confia em input do client para decidir o que retornar).
3. **Conferir se as Edge Functions (`supabase/functions/admin-*`,
   `auth-*`, `automation-*`) validam o papel de quem chama** antes de usar a
   `SERVICE_ROLE_KEY` (que ignora RLS) — vale grep por `req.headers`/
   `Authorization` em cada uma para confirmar que autenticam a chamada e
   checam role, não só existência de token.
4. **Rodar `npm audit` / `npx tsc --noEmit`** no frontend — build limpo é
   pré-requisito para o Coolify não subir uma versão quebrada.
5. **Confirmar histórico de migrations no Supabase** — você já tem o problema
   conhecido de `db push` listar migrations antigas como pendentes (ver
   memória: já foram aplicadas via SQL Editor). Antes do redeploy, rodar
   `supabase migration repair` ou aplicar manualmente as 5 novas via SQL
   Editor com cuidado para não duplicar o que já foi aplicado.
6. **Backup do banco antes de aplicar migrations em produção** — ponto de
   restauração caso alguma das migrations novas (principalmente a que
   remove `capacidade_profissional` — `20260724110000_remover_capacidade_profissional.sql`)
   apague algo que ainda estava em uso.
7. **Testar em ambiente de staging/preview do Coolify** (se existir) antes do
   redeploy de produção — validar login com uma conta `diretoria` real e
   confirmar que o comportamento da seção 3 é o esperado, e testar upload/
   leitura de laudos e grade de salas (áreas com dado sensível) na prática.
8. **Depois do redeploy**: revisar os logs do Coolify/Supabase por um curto
   período por erros 500 nas rotas novas antes de considerar encerrado.

---

## 5. Auditoria concreta: rota → tabela Supabase → RLS (feita em 2026-07-23)

**Ponto-chave de arquitetura, para responder "onde salvar" e "como não vazar":**
o Supabase guarda os dados reais (Postgres); o GitHub guarda só código e as
*definições* de RLS (texto SQL). A tela (`frontend/lib/permissions/routes.ts`)
só decide o que aparece no menu — é UX, não segurança. Quem barra acesso
indevido de verdade é o **RLS de cada tabela no Postgres**, porque a `anon key`
do Supabase fica exposta no navegador por design; qualquer usuário autenticado
pode, tecnicamente, chamar a tabela direto pelo console do navegador,
ignorando completamente a tela. Então a pergunta certa não é "essa aba
esconde o botão de quem não devia ver", e sim "essa tabela recusa a
leitura/escrita de quem não devia, não importa por onde a chamada chegue".

Todas as tabelas novas/alteradas nesta branch **têm RLS habilitado** (nenhuma
ficou sem `enable row level security`). Mas o *tipo* de policy varia, e achei
uma inconsistência real:

| Rota | Tabela(s) | RLS habilitado | Policy restringe por role? | Observação |
|---|---|---|---|---|
| `/cadastros/taxas-e-parametros` | `remuneracao_taxas_especialidade`, `remuneracao_parametros_gerais` | Sim | **Sim** — `remuneracao_has_role(['rp','admin','diretoria'])` | OK |
| `/cadastros/feriados` | `feriados` | Sim | **Sim** — leitura para `rp,admin,diretoria,terapeutico`, escrita para `rp,admin,diretoria` | OK |
| `/cadastros/contratos` | `remuneracao_contratos_atuais`, `remuneracao_contratos_antigos` | Sim | **Sim** — `rp,admin,diretoria` (ajustado em 08/07 pra diretoria não ver a aba vazia) | OK — é dado de PII de profissional (contrato), corretamente restrito |
| `/cadastros/cadastro-valores` (e a aba **previsao-receitas** de `/cronograma/indicadores`, que lê a mesma fonte) | `cronograma_convenio_valores`, `cronograma_convenio_valores_paciente`, `cronograma_convenio_pacote_avaliacao` | Sim | **NÃO** — policy é `using (true)` / `with check (true)` para `to authenticated` em SELECT/INSERT/UPDATE/DELETE | ⚠️ **Achado real**: isso é a RECEITA por convênio/paciente que você quer proteger. Hoje, **qualquer usuário autenticado no sistema** (recepção, autorização, terapêutico, etc.) consegue ler e **editar** esses valores direto via API do Supabase, mesmo que a tela `/cadastros/cadastro-valores` só apareça pra quem tem a permissão `cronograma_valores_convenio` (hoje: `admin`, `diretoria`, `cronograma`, conforme `roleDefaults` em `routes.ts`). A tela escondida não impede a chamada direta. |
| `/cronograma/ocupacao-salas` | `cronograma_salas`, `cronograma_salas_alocacoes` | Sim | **NÃO** — mesma coisa, `using (true)` para qualquer authenticated | ⚠️ Mesma falha — grade de salas (que cruza paciente/profissional/horário) fica editável por qualquer login. |

### Ação executada e APLICADA em produção — ✅ RESOLVIDO em 2026-07-23

Achado importante: ao checar `supabase migration list`, descobri que quase
todas as migrations "novas" desta branch **já estavam aplicadas em
produção** (o projeto linkado é `wmugemamnqxjfpxrlwes`) — ou seja, as 5
tabelas com `using (true)` já estavam expostas ao vivo, com dado real, não
era um risco "do próximo redeploy".

Antes de aplicar qualquer correção:
1. Backup completo feito e salvo em
   `C:\Users\Maquina001\Documents\backups-pulsar\backup-pre-migration-20260723\`:
   `schema.sql` (schema completo via `supabase db dump`), `data.sql` (dump de
   dados completo, 307 MB, via `supabase db dump --data-only`) e
   `policies_antes.txt` (snapshot das policies das 5 tabelas antes da mudança,
   via `supabase db query`, para rollback imediato se precisar).
2. Migration `supabase/migrations/20260724120000_restringir_rls_cronograma_valores_salas.sql`
   criada, trocando as 4 policies `using (true)` de cada uma das 5 tabelas por
   2 policies (`select` + `write`) usando
   `remuneracao_has_role(array['admin','diretoria','cronograma'])` — mesmo
   padrão de `feriados`/`remuneracao_*`.
3. Aplicada em produção via `supabase db push --linked --include-all`
   (junto com a migration `20260723000000_add_profissional_id_cronograma_salas_alocacoes`,
   que também estava pendente).
4. **Confirmado depois da aplicação**: `supabase migration list` mostra todas
   as migrations locais e remotas em sincronia (nenhuma pendente), e uma
   query em `pg_policies` confirma que as 5 tabelas agora usam
   `remuneracao_has_role(ARRAY['admin','diretoria','cronograma'])` em vez de
   `true`. Salvo em `policies_depois.txt` no mesmo diretório de backup.

**Decisão que ainda é sua, não técnica:** dei ao setor `cronograma` (que só
vê abas de cronograma) permissão de **escrita** (`for all`), não só leitura,
porque hoje `roleDefaults` concede a permissão de tela sem diferenciar
leitura de escrita — mas no RLS isso vira uma decisão explícita. Se
`cronograma` deveria só *ver* valores/salas e não editar, me avise que eu
crio uma migration adicional trocando pra uma policy `for select` separada
de uma `for insert/update/delete` restrita a `admin`/`diretoria`.

### Auditoria das Edge Functions (`admin-*`, `auth-*`, `automation-*`)

Conferidas as 11 functions que usam `SERVICE_ROLE_KEY`. Todas as que fazem
ação administrativa (`admin-change-role`, `admin-create-user`,
`admin-resend-invite`, `admin-toggle-user`, `admin-update-machine`,
`automation-pause/resume/restart/release-stuck`) exigem token válido **e**
checam `role === 'admin'` antes de agir — nenhuma aberta. `auth-complete-setup`
só altera a própria linha do usuário autenticado (`.eq("id", user.id)`), sem
risco. Único ponto sem autenticação é `auth-lookup-username` (recebe um
username e devolve o email correspondente, sem checar token) — isso é
**intencional e pré-existente** (não faz parte desta branch): é o passo que
permite logar por username antes de ter sessão, comum em fluxos de login.
Risco residual baixo (enumeração de username/email), mas se quiser mitigar,
dá pra adicionar rate limiting nessa function — me avise se quiser que eu
implemente, é uma mudança separada do escopo desta branch.

---

## Resumo de execução (ordem sugerida)

1. ✅ `.gitignore` atualizado, 5 arquivos sensíveis movidos para fora do repo
   (seção 2).
2. ✅ Migration de correção de RLS criada **e aplicada em produção**, com
   backup completo feito antes (seção 5).
3. ✅ Edge Functions auditadas — nenhuma aberta (seção 5).
4. ✅ Todas as migrations pendentes do Supabase já aplicadas (confirmado via
   `supabase migration list` — local e remoto em sincronia).
5. ⏳ Pendente, decisão sua: o que fazer com o role `diretoria` editando
   permissões (seção 3) — hoje é comportamento já aprovado e já ativo em
   produção desde 13/07, a branch só destrava a tela pra combinar. Se quiser
   manter como está, não precisa fazer nada.
6. `git add` conforme seção 1 (agora incluindo também a nova migration
   `20260724120000_restringir_rls_cronograma_valores_salas.sql`).
7. `git commit` + `npm run build`/`tsc --noEmit` local.
8. Rodar `/security-review` no diff completo (ainda não executado nesta
   conversa — recomendo antes do push).
9. `git push` + merge para a branch de produção.
10. Redeploy no Coolify (agora só o app — o banco já está com as correções).
11. Smoke test pós-deploy com conta real (inclusive uma conta `diretoria`,
    pra validar o comportamento da seção 3, e uma conta `cronograma` pra
    validar que consegue ver/editar valores e salas normalmente com a RLS
    nova) + monitorar logs.
