# Checklist de Segurança Pré-Redeploy

Use este checklist antes de qualquer merge pra `main`/redeploy de produção
que envolva mudanças de banco (migrations novas) ou de acesso/permissões.
Baseado no processo real feito em 2026-07-23/24 (ver `PLANO_REDEPLOY_SEGURO.md`
daquela vez, se ainda existir, pra um exemplo completo).

## 1. Arquivos que não podem ir pro git

- [ ] `git status` — nenhum arquivo untracked com dado real (dumps SQL,
      planilhas de paciente/receita, exports de relatório)?
- [ ] Nenhum `.env`/segredo hardcoded (`grep -rIn "service_role\|SUPABASE_SERVICE\|password\s*="`)?
- [ ] `.gitignore` cobre os padrões de arquivo de dado real do projeto
      (`*.xlsx`, `*.xls`, dumps `.sql` soltos na raiz)?

## 2. RLS (Row Level Security) — a proteção real, não a tela

Lembrete: a tela (`frontend/lib/permissions/routes.ts`) só esconde menu.
Quem protege de verdade é o RLS de cada tabela no Postgres.

- [ ] Rodar `node scripts/check-rls.js` — toda tabela criada tem
      `enable row level security`? (isso já é automático via
      `.github/workflows/check-rls.yml` em todo PR que mexe em migrations)
- [ ] Pra cada tabela nova/alterada: a *policy* restringe por role de forma
      coerente com quem deveria acessar (não só "RLS ligado", mas
      `using (true)` é tão ruim quanto RLS desligado — o script não pega isso,
      só revisão manual)?
- [ ] Rodar `/security-review` no diff completo antes do push final.

## 3. Migrations e produção

- [ ] `supabase migration list` — confirmar quais migrations estão
      realmente pendentes (local vs remote) antes de assumir que "vai
      aplicar no próximo deploy" — pode já estar em produção sem você saber.
- [ ] Backup antes de aplicar em produção: `supabase db dump -f schema.sql`
      e `supabase db dump --data-only -f data.sql` (precisa do Docker
      rodando). Salvar fora do repo.
- [ ] Snapshot das policies das tabelas afetadas antes/depois
      (`select * from pg_policies where tablename in (...)`) pra rollback
      rápido se precisar.
- [ ] Aplicar com `supabase db push --linked --include-all` se houver
      migrations fora de ordem.
- [ ] Confirmar depois: `supabase migration list` sincronizado + query em
      `pg_policies` batendo com o esperado.

## 4. Permissões e acesso

- [ ] Alguma mudança nesta branch altera quem pode editar permissões de
      outros usuários? Se sim, isso é uma decisão de negócio — documentar
      explicitamente quem aprovou.
- [ ] Snapshot de quem tem role `admin`/`diretoria` hoje
      (`select email, role from usuarios where role in ('admin','diretoria')`)
      — confirmar que só quem precisa desse poder tem.
- [ ] Mudança em `usuarios_permissoes` fica registrada no `audit_logs`?
      (trigger já existe desde 2026-07-24, ver `20260724130000_audit_usuarios_permissoes.sql`)

## 5. Build e app

- [ ] `npx tsc --noEmit` limpo.
- [ ] `npm run build` limpo, sem import morto de arquivo deletado.
- [ ] Edge Functions sem autenticação: têm rate limiting?
      (ver `edge_rate_limits`, tabela genérica reutilizável desde 2026-07-24)

## 6. Pós-deploy

- [ ] Smoke test com conta real de cada role afetado pela mudança.
- [ ] Monitorar logs (Coolify/Supabase) por erros 500 nas rotas novas por
      um período curto antes de considerar encerrado.

---

## Itens de sustentabilidade (não bloqueiam redeploy, revisar periodicamente)

- **MFA obrigatório para `admin`/`diretoria`** — ainda não enforçado. Checado
  em 2026-07-24: **nenhuma** conta `admin`/`diretoria` tem MFA cadastrado
  hoje, então NÃO dá pra exigir `aal2` nas policies agora (trancaria todo
  mundo fora). Ordem correta: (1) pedir que cada conta `admin`/`diretoria`
  cadastre um autenticador TOTP (já disponível, `[auth.mfa.totp]` no
  `config.toml`), (2) só depois de confirmar 100% de adesão, adicionar
  `auth.jwt()->>'aal' = 'aal2'` nas policies mais sensíveis
  (`usuarios`, `usuarios_permissoes`).
- **Chave `service_role` hardcoded em `pg_cron`** — ✅ Corrigido em
  2026-07-24 (migration `20260724180000_migrar_cron_secrets_para_vault.sql`):
  os 2 jobs afetados (`sync-reposicao-faltas`, `sync-grade-csv-daily`) agora
  buscam a chave via `vault.decrypted_secrets` (secret `cron_service_role_key`)
  em vez de literal no `cron.job.command`. O VALOR da chave não mudou (só
  como ela é referenciada) — rotação de fato da chave continua pendente,
  ver item abaixo.
- **Rotação da `SUPABASE_SERVICE_ROLE_KEY`** — ainda não feita. Precisa ser
  coordenada (gera nova chave no dashboard Supabase, atualiza Coolify e
  qualquer outro consumidor, depois atualiza o secret no Vault com
  `vault.update_secret`). Fora do escopo de uma sessão de código — decisão
  e execução compartilhada com quem administra o Coolify.
- **Ambiente de staging separado** (banco + app) antes de aplicar migration
  direto em produção — ainda não existe. Envolve criar um novo projeto
  Supabase (custo adicional possível) + novo app no Coolify apontando pra
  esse projeto. Decisão de infraestrutura, não implementado.
- **Backup automático do Supabase** — ✅ Confirmado ativo em 2026-07-24:
  backups físicos diários (`walg_enabled: true`), 8 dias de histórico
  verificados. PITR (recuperação minuto a minuto) está desligado — upgrade
  opcional, não é um gap.

## ⚠️ Pendente — `csv_grades_profissionais` aberta pra qualquer authenticated

Achado em 2026-07-24 junto com a correção de `csv_reposicao_faltas` (que
tinha o mesmo problema + acesso `anon`, já corrigido em
`20260724190000_remove_acesso_anon_csv_reposicao_faltas.sql`).
`csv_grades_profissionais` tem as mesmas colunas sensíveis
(`paciente_nome`, `paciente_id`, `profissional_nome`, `profissional_cpf`)
e uma policy `for select to authenticated using (true)` — ou seja,
qualquer usuário logado, de qualquer setor (recepção, terapêutico,
faturamento etc.), consegue ler nome de paciente e **CPF de profissional**
de todo mundo.

Diferente de `csv_reposicao_faltas` (usada só por uma feature), esta
tabela é consumida por várias telas (agenda, ocupação, indicadores,
faturamento). Antes de restringir por role é preciso:
1. Mapear todas as telas/hooks que fazem `.from('csv_grades_profissionais')`
   e o papel de quem usa cada uma.
2. Decidir se dá pra restringir a tabela inteira por role, ou se o certo é
   criar uma *view* sem a coluna `profissional_cpf` pra maioria dos papéis
   (provavelmente ninguém no frontend precisa do CPF — ele existe pra
   integração com a TiTa) e manter a tabela crua só pra quem realmente
   precisa.
3. Testar cada tela afetada antes de aplicar em produção — mudança mais
   arriscada que as outras porque toca uma tabela central usada por muita
   coisa.

## Achado extra fora do escopo de segurança (2026-07-24)

- Cron `cco-conciliation-engine` (Conciliação ASSIM, agenda a cada 10 min)
  está **falhando 100% das execuções** com
  `ERROR: unrecognized configuration parameter "app.supabase_url"` — a GUC
  que essa função espera nunca foi configurada no banco. Não é falha de
  segurança (não expõe nada), é bug operacional: a conciliação automática
  simplesmente não roda. Não corrigido nesta sessão (fora do escopo pedido);
  investigar `cron.job_run_details where jobid = 18` pra confirmar histórico.
