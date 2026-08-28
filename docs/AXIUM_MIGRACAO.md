# Migração do AXIUM para o Pulsar

Porte nativo do AXIUM (`github.com/GabrielSalotto/AXIUM`, clonado em
`projeto_automacao/AXIUM`, 1 commit) para dentro do Pulsar: NestJS + Prisma +
Postgres próprio + SPA React/Vite → Next 16 + Supabase.

Decisão tomada em 2026-08-17: migração completa, mas pacientes e convênios
saem do Pulsar em vez do cadastro próprio do AXIUM.

---

## O achado que muda a premissa

**O Pulsar não tinha tabela `pacientes` nem `convenios`.** Verificado em
`types/supabase.ts` (schema gerado, 150+ relações) — nenhuma das duas existia.

> **Resolvido em 2026-08-17 (fase 1, parte a).** `public.pacientes` existe, e o
> caminho escolhido foi promover `reboot_pacientes` a canônica por RENAME em vez
> de criar uma segunda tabela ao lado — decisão do usuário: *uma* identidade de
> paciente, não duas. Ver `supabase/migrations/20260817190000_pacientes_canonica.sql`
> e `20260817190100_backfill_pacientes_do_tita.sql`. Ainda **não aplicadas em
> produção** (validadas contra o Postgres local em transação revertida).

O que existe hoje como fonte de paciente:

| Objeto | Natureza | Carrega |
|---|---|---|
| `agenda_tita` | 1 linha por **agendamento**, sincronizada do TiTa | `paciente_id`, `paciente_nome`, `cpf`, `data_nascimento`, `responsavel_nome/email/telefone`, `convenio_id`, `convenio_nome`, `numero_carteirinha`, `clinica_id/nome` |
| `reboot_pacientes` | registro legado, chave `id_paciente` numérica | nome, nascimento, telefone, ativo |
| `paciente_classificacao` | classificação solta | `paciente_nome`, `convenio_tipo` |
| `vw_central_pacientes` | view operacional | derivada da fila/agenda |

O `Paciente` do AXIUM tem 20 campos. A interseção com o Pulsar cobre
identidade: nome, nascimento, CPF, contato do responsável, convênio,
carteirinha. **Não cobre nada de cadastro:** endereço completo
(CEP/logradouro/número/bairro/cidade/UF), sexo, e-mail próprio,
`responsavelFinanceiroId` (paciente → paciente), consentimento LGPD, status,
tags, observações.

Isso é bloqueante para `Contrato` e `Mensalidade` — o núcleo financeiro do
AXIUM. Contrato exige `responsavelFinanceiroId` obrigatório e
`emitirNfNoResponsavel`; emitir NF exige endereço e CPF do responsável.
**O conceito de responsável financeiro como entidade não existe no Pulsar** —
`agenda_tita` guarda só nome/e-mail/telefone soltos, sem CPF, sem endereço,
sem identidade própria.

### Rota

Não dá para "apontar para a tabela de pacientes do Pulsar": ela precisa ser
criada. O desenho:

```
public.pacientes  (nova, no Pulsar)
  ├── identidade  ← preenchida e refrescada pelo sync do TiTa
  │     tita_paciente_id (chave estável), nome, cpf, data_nascimento
  ├── cadastro    ← editável nas telas portadas do AXIUM
  │     endereco, sexo, email, responsavel_financeiro_id, lgpd, status, tags
  └── convênio    ← derivado, não digitado
```

O AXIUM já previu o vínculo: `Paciente.idPulsar` existe no schema
(`prisma/schema.prisma:299`).

Duas regras que o histórico do projeto já pagou para aprender e que valem aqui:

- Ao refrescar identidade a partir de `agenda_tita`, escolher a linha mais
  recente por **`data_atendimento desc`**, nunca por `updated_at`
  (ver `docs`/memória do drift de CPF/nascimento).
- Convênio é dado **por agendamento** do TiTa, não do paciente. `convenios`
  vira catálogo derivado de `DISTINCT (convenio_id, convenio_nome)`, e a
  carteirinha vigente por paciente segue a mesma regra da linha mais recente.

---

## Mapa de destino

| AXIUM | Destino no Pulsar | Veredito |
|---|---|---|
| `src/auth/**` (bcrypt, JWT access+refresh, Passport, selecionar-unidade) | Supabase Auth, já em uso | **morre** (~15 arquivos) |
| `Papel` / `Permissao` / `PapelPermissao` / `UsuarioPermissaoExcecao` | `usuarios.role` + `usuarios_permissoes` + `lib/permissions/routes.ts` | **converge** — mesmo motor (default do papel, override por usuário, revogação vence) |
| `Escopo` (PROPRIO/UNIDADE/VINCULADAS/CONSOLIDADO) | não existe no Pulsar | **decisão pendente**: adicionar ou colapsar |
| `Empresa` + `empresaId` + FORCE RLS via `set_config('app.current_empresa')` | RLS por `auth.uid()` sobre tabela de vínculo | **reescreve** — ver abaixo |
| `Paciente` / `Convenio` / `CarteirinhaConvenio` | `public.pacientes` nova + catálogo derivado | **reescreve** |
| `Contrato` / `Mensalidade` | migrations Supabase | **porta**, depois de pacientes |
| `src/compras/shared/**` (compatibilidade, precificação, score ponderado, status) | `frontend/lib/insumos/` | **porta como está** — TS puro, já com testes vitest |
| `src/compras/*.service.ts` (Nest, Prisma) | route handlers em `frontend/app/api/compras/` | **reescreve** (Prisma → supabase-js) |
| `src/compras/worker/**` (Playwright + Mercado Livre) | processo separado, molde do `robo-autorizador` | **porta**, fora do Next |
| `frontend/src/lib/**` (statusFlow, analytics, comprasCatalogos, format) | `frontend/lib/insumos/` | **porta como está** |
| `frontend/src/pages/**` (8) + `components/compras/**` (12) | `frontend/app/(dashboard)/insumos/` | **JSX sobrevive, `.module.css` morre** (Tailwind 4 + shadcn) |
| `components/ui/**` (Button, Badge, KpiCard, BarList, ChipsInput…) | shadcn/radix já instalado | **descarta**, usa o do Pulsar |
| `src/conta-azul/**`, `src/integracoes/mercado-livre*` | route handlers + segredos no Vault | **porta**, por último |
| `EstoquePage` | — | é stub ("chega depois de Cotações e Compras") |

### Por que o RLS do AXIUM não sobrevive

O isolamento do AXIUM depende de `set_config('app.current_empresa', ..., true)`
**dentro de uma transação** (`prisma/rls.sql` + `PrismaService.forTenant`). O
PostgREST não expõe transação por request — não há onde rodar o `set_config`.
As policies precisam ser reescritas no padrão Supabase: ler `auth.uid()` e
resolver a unidade por join na tabela de vínculo.

O Pulsar hoje também não tem fronteira de tenancy: `clinica_nome` é filtro de
tela (`services/agenda.service.ts`), não isolamento. Decidir se `empresa_id`
entra como fronteira real ou como coluna de recorte.

---

## Fases

Ordem por dependência, não por tamanho.

**1. Pacientes e convênios.** Sem isso, nada financeiro do AXIUM roda.

- [x] **1a. Tabela canônica.** `public.pacientes` por rename de
  `reboot_pacientes` (preserva a PK `id_paciente`, a sequence, a FK de
  `reboot_agendamentos` e o trigger). Chave estável em `tita_paciente_id`,
  nullable — hoje o paciente nasce no TiTa e é espelhado; depois nasce aqui.
  Ganha endereço, sexo, e-mail, responsável com CPF/parentesco/financeiro,
  auto-FK `responsavel_financeiro_id`, flag `ficticio` e `nome_normalizado`
  mantido por trigger (`normalizar_nome_paciente()`, mapa único — não
  re-inlinar). `20260817190000`.
- [x] **1b. Backfill sem chamada externa.** De `agenda_tita` + do
  `raw_json.favorecido.familiares[0]` que o sync já recebe e descarta.
  Recência **por campo** (`array_agg ... FILTER (WHERE ... IS NOT NULL)`
  ordenado por `data_atendimento DESC`), não por linha — senão uma linha
  `origem='tita_csv'`, que vem com cpf/nascimento nulos e `raw_json` de stub,
  sobrescreveria dado bom por ser a mais recente. `20260817190100`.
- [ ] **1c. Aplicar em produção.** As duas migrations acima. Pelo SQL Editor,
  registrando no livro-caixa — `db push` empurraria o pendente inteiro.
- [ ] **1d. Tela `/cadastros/pacientes`.** A permissão `cadastros_pacientes` e a
  rota já estão seedadas desde `20260812150100`; o hook `usePacientes` e o
  service `services/pacientes.service.ts` já apontam para a tabela canônica.
  Falta a página.
- [ ] **1e. Sync de cadastro.** Edge Function para
  `POST /integracao/csv_situacao_favorecidos` — endpoint do TiTa **nunca
  chamado pelo Pulsar**, que devolve id, nome, cpf, endereço completo
  (changelog 2.11.0), plano de saúde, familiar + e-mail e situação
  Ativo/Inativo. É o que alcança paciente sem sessão na janela do cron
  (hoje−10 → fim do mês seguinte), que o backfill não cobre.
- [ ] **1f. `convenios` como catálogo derivado** de
  `DISTINCT (convenio_id, convenio_nome)`; carteirinha vigente pela mesma regra
  da linha mais recente.
- [ ] **1g. Estender `sync_tita_agenda`** para manter `pacientes` atualizada e
  parar de descartar `familiares[0].cpf/endereco/resp_financeiro/parentesco`.
  Atenção: só `familiares[0]` e `vinc_fav_clinica[0]` são lidos — paciente com
  dois convênios perde o segundo em silêncio (limitação herdada).

> **Nome do papel.** O acesso foi pedido como "setor financeiro", mas o CHECK de
> `usuarios.role` não tem `financeiro` — o setor financeiro do dia a dia é o papel
> **`faturamento`**, e foi nele que a permissão entrou. Um papel novo e separado
> seria outra mudança: mexe no CHECK, na tela de administração e nos roleDefaults.
>
> Não há item no Sidebar ainda: `/insumos` não existe e o menu apontaria para 404.
> O código de permissão e o mapeamento de rota já estão prontos.

**2. Acesso.** Mapear as permissões do AXIUM (`compras.ver`, `compras.aprovar`,
`compras.comprar`, `compras.confirmar-entrega`, `compras.cotar-manual`,
`compras.alterar-status`, `compras.solicitar`, `compras.editar`) para
`roleDefaults` em `lib/permissions/routes.ts` e liberar as rotas no `proxy.ts`.
Resolver a questão do `Escopo`.

**3. Compras — dados e lógica.** Feita na branch `feat/insumos-axium`.

- [x] **3a. Schema.** `20260817200000_insumos_schema.sql`: as 8 tabelas de
  compras + `empresas` + `usuarios_empresas`, RLS no padrão Pulsar. Enums do
  Prisma viraram `text` + CHECK (convenção de `usuarios_role_check`), colunas
  em snake_case. Validada no Postgres local em transação revertida: 10 tabelas,
  RLS ligada, 2 policies cada, idempotente. **Não aplicada em produção.**
- [x] **3b. Lógica pura.** `src/compras/shared/**` → `frontend/lib/insumos/`
  (compatibilidade, precificação, score ponderado, status, item padrão) com os
  testes vitest juntos — 13 passando, `tsc` e `eslint` limpos. Duas alterações
  no porte, ambas para matar lista literal duplicada: `status-solicitacao.ts`
  não importa mais de `@prisma/client` e `precificacao.ts` deriva seus dois
  aliases de `tipos.ts`, que é a lista única espelhando os CHECK.
- [ ] **3c. Aplicar em produção.** Pelo SQL Editor, com registro no livro-caixa.

> **Tenancy — premissa corrigida pelo usuário em 2026-08-17.** `empresaId` não
> virou `unidade text`: empresa aqui é **pessoa jurídica**, e a ferramenta vai
> operar com pelo menos três (só se usou Universo ABA até hoje). Por isso
> `empresas` é tabela com FK real, e não recorte por texto.
> `central.organizations` não serve — é a org do produto Central/Connect.
>
> O bloco de compras **não referencia paciente** em lugar nenhum (conferido no
> `schema.prisma`): quem depende de `public.pacientes` é o financeiro
> (`Contrato`/`Mensalidade`), da fase 7.

**4. Compras — API.** Route handlers sob `frontend/app/api/insumos/`, no padrão
do módulo `central` (extrair contexto → parse do DTO → service → mapeamento de
erro). 10 arquivos de rota cobrindo 14 endpoints.

- [x] **4a. Operações atômicas.** `20260818090000_insumos_rpcs.sql`: 7 funções
  no Postgres + `log_auditoria_insumos` (append-only). **Esta é a parte que não
  dava para portar direto:** o AXIUM escrevia em várias tabelas dentro de
  `prisma.forTenant(async tx => …)`, e o PostgREST não tem transação por
  request. Sem isso, falha no meio deixa solicitação sem job de cotação (nunca
  cotada, e ninguém vê), aprovação sem troca de status, ou status sem histórico
  — e o `retomar` depende do histórico para saber para onde voltar.
  `SECURITY INVOKER` de propósito: a RLS continua valendo dentro da função.
- [x] **4b. Camada TS.** `lib/insumos/{auth,erros}.ts`,
  `modules/insumos/{dto,services}/`, e as rotas. `tsc`, `eslint` e os 13 testes
  limpos.
- [ ] **4c. Validar a migration.** As de 17/08 foram validadas no Postgres
  local em transação revertida; a `20260818090000` **não** — o engine do Docker
  estava em erro na hora. Rodar antes de aplicar.
- [x] **4d. Gate de permissão.** Fechado em 2026-08-18. Código `insumos`,
  concedido a `faturamento`, `admin` e `diretoria` (definição do usuário).
  A checagem vive dentro de `extrairAtor`, não em cada rota: o matcher do
  `proxy.ts` exclui `/api`, e uma rota que esquecesse a checagem abriria um
  endpoint — assim, a que esquecer não compila (não tem `supabase`).
  `resolverPermissoes` foi extraída para `lib/permissions/resolver.ts` e o
  `proxy.ts` passou a usar a mesma função, para não haver duas implementações
  da regra. Migration `20260818100000_permissao_insumos.sql`.
  Ainda **não** existe o equivalente ao escopo CONSOLIDADO do AXIUM: quem
  enxerga insumos alcança `POST /[id]/status`. Se incomodar, o caminho é um
  código próprio (`insumos_status`), não um `if` de papel na rota.
- [ ] **4e. Link público de solicitação** (`GET`/`POST /compras/link-publico` e
  a criação sem login). Rota pública precisa de gate no `proxy.ts` e de revisão
  própria — precedente é o `/tv`. Deixado de fora por ser superfície de
  segurança distinta.
- [ ] **4f. `GET /compras/visao-geral`** (o `DashboardService`, 16 KB de
  agregação). Não portado.

> **Duas simplificações que o porte permitiu — não são omissões.** Sumiu o loop
> por `unidadesVisiveis` em `listar`/`buscarPorId`: a RLS de `20260817200000` já
> filtra por `insumos_empresas_do_usuario()`, então um SELECT direto devolve só
> o permitido, de todas as empresas de uma vez. E a validação de status vive no
> service **e** na RPC: no service para dar erro claro antes de tocar o banco,
> na RPC porque é a que vale contra chamada direta à API.

**5. Compras — telas.** NADA portado ainda: não existe nenhum `.tsx` de insumos
no Pulsar, e `app/(dashboard)/insumos/` não existe — é por isso que o Sidebar
segue sem item. Inventário real do AXIUM (contagem conferida em 2026-08-18):

São 8 páginas, mas só **5 portam**:

- `SolicitacaoDetalhePage` (270 linhas) — a tela central: cotações, histórico,
  aprovação e compra;
- `SolicitacoesListPage` (217) — lista com chips de status;
- `NovaSolicitacaoPage` (21) — só a casca do `SolicitacaoForm`;
- `LogisticaOverviewPage` (85) — **bloqueada**: depende do `visao-geral` (4f);
- `SolicitacaoPublicaPage` (46) — **bloqueada**: depende do link público (4e).

Mais 12 componentes em `components/compras/` (~1.260 linhas), os maiores sendo
`SolicitacaoForm` (300), `SolicitacaoExternaForm` (245), `RegistrarCompraForm`
(175) e `CotacaoManualForm` (166) — todos já casam com os DTOs de
`modules/insumos/dto/`.

Morrem no caminho: `LoginPage` (68) e `SelecionarUnidadePage` (49), porque o
Pulsar já tem Supabase Auth e a empresa ativa vira o header `x-empresa-id` que o
`extrairAtor` lê; `AppLayout`, porque o shell e o Sidebar são do Pulsar; os ~13
`components/ui/**`, porque shadcn/radix já está instalado; e os 17
`.module.css`, porque aqui é Tailwind 4. `EstoquePage` são 10 linhas de aviso
("chega depois de Cotações e Compras") — não existe controle de estoque no
AXIUM, o que existe é o fluxo de compras.

**Trabalho mecânico que toca todos os arquivos:** o AXIUM usa React Router
(`BrowserRouter`, rotas `/logistica/*`); aqui é App Router. Cada página vira um
`page.tsx` em pasta, e `useNavigate`/`useParams` viram `useRouter`/`params`.
O `/logistica` de lá corresponde ao `/insumos` já registrado na permissão.

Ordem sugerida, a que dá algo navegável mais rápido: `SolicitacoesListPage` →
`NovaSolicitacaoPage` + `SolicitacaoForm` → `SolicitacaoDetalhePage` com os
componentes de cotação/aprovação/compra. O dashboard e o link público ficam para
depois, junto com as partes de API que faltam.

**6. Worker de cotação.** Playwright + Mercado Livre como processo próprio,
consumindo `cotacao_jobs` por RPC com token por máquina (padrão `robo_*` que
já existe).

**7. Contratos e mensalidades.** Depende inteiramente da fase 1.

**8. Integrações.** Conta Azul e Mercado Livre; `token-crypto.service.ts` sai
e os segredos vão para o Vault, como o token do cron já faz.

---

## Riscos registrados

- **Repo público.** O Pulsar é público. Nada de chave do AXIUM (Conta Azul,
  Mercado Livre, `JWT_SECRET`) pode entrar em arquivo versionado.
- **`db push` empurra o pendente inteiro.** Migrations novas vão para o SQL
  Editor e são registradas no livro-caixa, não aplicadas por push.
- **Duas fontes de verdade durante a transição.** Enquanto o AXIUM original
  existir com banco próprio, qualquer escrita nele diverge em silêncio.
