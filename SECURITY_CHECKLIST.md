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

- MFA obrigatório para contas `admin`/`diretoria` — ainda não enforçado a
  nível de RLS/Auth Hook, só disponível como opt-in (TOTP configurado em
  `supabase/config.toml`, `[auth.mfa.totp]`).
- Chave `SUPABASE_SERVICE_ROLE_KEY`: confirmar rotação periódica e que só
  Edge Functions/servidor têm acesso — nunca browser. Nota: em 2026-07-24
  encontramos essa chave hardcoded em texto puro em vários jobs de
  `pg_cron` (`cron.job.command`) — ver migrations `202605*_sync_*_cron.sql`.
  Ainda não migrado pra `supabase_vault` (extensão já habilitada no projeto).
  Ao rotacionar a chave, também reescrever esses cron jobs.
- Ambiente de staging separado (banco + app) antes de aplicar migration
  direto em produção.
- Backup automático do Supabase (plano pago) — confirmar se está ativo,
  não depender só de backup manual antes de mudança pontual.
