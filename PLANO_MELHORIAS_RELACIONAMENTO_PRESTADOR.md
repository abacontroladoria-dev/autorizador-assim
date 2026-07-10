# Plano de melhorias — relacionamento-prestador (Rem. Mês)

Consolida uma revisão de código e UX das quatro telas do sidebar `relacionamento-prestador`:
**Rem. Mês - Previsão** (`analise/`), **Rem. Mês - Total** (`rp/`), **Rem. Mês - Individual** (`individual/`) e **Config**.

Feita por 4 agentes em paralelo (Previsão, Total/Individual, Config, Cálculos) em 2026-07-08, lendo o código-fonte completo — sem screenshots, sem rodar a UI. Cada achado tem `arquivo:linha`. **Confirme os itens de linha antes de aplicar caso o arquivo já tenha mudado.**

Contexto do produto: app Next.js + Tailwind + Supabase, uso em localhost (sem necessidade de login) e depois publicado na web. Dark mode é prioridade do usuário. **O usuário já melhorou muita coisa — não regredir o que já está bom (seção 0).**

---

## STATUS DE EXECUÇÃO (atualizado 2026-07-09, working tree ainda não commitado)

Uma sessão de execução já resolveu a maior parte deste plano. Confirmado via `git diff` linha a linha (não apenas relato):

- **✅ A. Cálculos** — A.1 a A.9 confirmados corrigidos no diff atual de `calculo.ts`/`dashboardRP.ts` (idFavorecido propagado, fallback de PA por tabela, diária/ETA só em dia não cancelado — decisão de negócio já tomada nesse sentido, valorRecuperavel via resolverPARow, linha do ETA no card X%, especialidade vazia agrupada em "Sem especialidade", ocupação unificada num único motor, diasMes por grupo no PE, contrato múltiplo sem match tratado). A.10 (higiene): `PE_NOVA_REGRA_INICIO` removido; os demais itens de higiene (duas fórmulas de semana, import duplicado do `finalizarBaseOcup`, arredondamento de centavos) **não confirmados** — só cosmético/latente, baixa prioridade.
- **✅ B. Alinhamento "Dias trabalhados"** — `table-fixed` + `colgroup` aplicados nas tabelas do `AnaliseFuturaTab.tsx`. Tratar como resolvido; vale um `/verify` visual rápido antes de fechar.
- **✅ C.1 Config (dark mode)** — todos os `B.navy` inline substituídos por `text-foreground`; `FeriadosConfig.tsx` migrado para `border-border`/`bg-transparent`/tokens; caixa de erro do `ConfigTab` com `dark:text-red-300`.
- **✅ C.2 Total/Individual (dark mode)** — `StatusChip` extraído e aplicado em `CardRemun.tsx` (badges de classe, presença, PE/CC, avatar); tons com par light/dark explícito.
- **✅ C.3 Previsão (dark mode)** — `corTopo` não usa mais `B.navy` (trocado por slate neutro).
- **✅ D.1 Previsão — contraste do botão Exportar** — trocado para `bg-emerald-700`/`dark:bg-emerald-600` (passa AA). Persistência de filtro em URL/storage, `aria-label` da busca/select e alvos de toque **ainda não confirmados** — tratar como abertos.
- **✅ D.2 Total — busca "não fazia nada"** — corrigida: agora filtra por sessão (`profTemBusca`) e a lista de profissionais reage à busca mesmo com cards recolhidos. Bônus: barra "Filtros ativos" com chips removíveis para busca/inconsistência/especialidade/PE foi adicionada (resolve também o item "sem indicador consolidado").
- **✅ E.1 RLS diretoria** — migração `20260708153000_remuneracao_config_capacidades_write_diretoria.sql` criada, estendendo escrita de `remuneracao_config`/`remuneracao_capacidades` para diretoria (mesmo padrão da `20260708151500`). **Ainda não aplicada ao banco** — só existe como arquivo de migração local.
- **✅ E.2 Auto-save perdendo edição** — `useAutoSaveRow` agora faz flush no unmount; 3 bugs de lint pré-existentes corrigidos de passagem (refs mutados no render, setState em effect). Typecheck/lint/147 testes passando (confirmado pelo usuário).

### Ainda abertos (não tocados, confirmados pelo diff atual)

- **D.3 Individual — dropdown custom**: sem fechar em Escape/clique-fora, sem `role="listbox"`/navegação por setas.
- **D.4 Config**: os dois paradigmas de salvamento (auto-save vs. botão+alert) continuam coexistindo — nenhuma unificação feita.
- **E.3 Responsividade do CardRemun**: `grid-cols-[minmax(220px,1fr)_110px_90px_90px_100px]` (linha ~595) e o bloco de donuts `shrink-0` (linha ~654) ainda sem breakpoint/wrap — ainda estoura em telas estreitas.
- **E.4 Ramo morto `!modoRP`**: ~29 ocorrências de `modoRP` ainda em `CardRemun.tsx`; nada foi removido. Botão "Ocultar sessões" com rótulo enganoso (recolhe o card todo) — não verificado se foi corrigido.
- **E.5, E.6, E.7, E.8, E.9, E.10**: sem evidência de alteração — tratar como abertos (aviso de Presença antes do upload, duplicação `PeBloco`/bloco de sessões, export sem coluna de PE, acessibilidade residual de Config/InfoTooltip, SVGs manuais vs. Lucide, `alert()` nativo).
- **C.2/C.3 itens `[Média]`/`[Baixa]` remanescentes**: os dois achados `[Alta]` de `CardRemun` (`:686` texto verde ilegível, `:850-861` coluna Totais clara) precisam de confirmação — o `StatusChip` pode já ter resolvido por decorrência, mas não foi verificado diretamente nessas linhas. Os itens de contraste `B.amber` sobre fundo escuro e o botão CTA `B.navy` da Individual também não foram confirmados.

---

## 0. O que já está bom — não regredir

- Dark mode implementado via classe `.dark` no root + tokens shadcn (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`) + um sistema de shims em `frontend/app/globals.css:395-558` que sobrescreve classes Tailwind cruas (`.dark .bg-white`, `.dark .text-slate-700` etc.) automaticamente. **Classes Tailwind normais já funcionam no dark sem esforço extra** — o problema é só `style={{}}` com hex inline, que nenhum CSS alcança.
- `AnaliseFuturaTab.tsx` (Previsão) está com dark mode quase 100% migrado para tokens — é a referência de qualidade a copiar para as outras telas.
- `RemuneracaoRPDashboard.tsx`, `ContratosPendentesPanel.tsx`, `PeCoordenadoresPanel.tsx`, `InteractivePieChart.tsx`, `OcupacaoDonut.tsx` — dark-ready, com `aria-pressed`, animações respeitando `prefers-reduced-motion`, memoização correta.
- `useAutoSaveRow` — debounce por linha, evita save concorrente, não descarta digitação em andamento (exceto o bug pontual do item E.2).
- `SaveStatusBadge` — largura fixa, todos os estados com variante dark.
- Tabelas de Config (Capacidade, Contratos Atuais, Contratos Antigos) — vocabulário consistente entre si, busca com contador "X de Y", `aria-pressed` nos filtros.
- `tabular-nums` aplicado de forma consistente em quase todos os valores monetários do módulo.
- Export XLSX da Previsão fiel ao motor de cálculo na maior parte dos campos.
- Migrações novas (`20260708150000` e `20260708151500`) corretas e coerentes entre si (SELECT depois WRITE para diretoria, mesmo helper, padrão `DROP POLICY IF EXISTS`).

---

## A. Cálculos — prioridade máxima (afeta valor monetário exibido)

1. **[Alta]** `frontend/lib/remuneracao/calculo.ts:632,634,672,673,681` — `calcularRemuneracaoReal` chama `isFakePatient(r.paciente)` / `isEtaAdminPatient(r.paciente)` **sem** passar `r.idFavorecido`, diferente de `calcularAnaliseFutura` (linhas 311-314, que passa o ID). Resultado: um paciente fictício identificado só pelo ID (não pelo nome) entra no cálculo do **Total** mas é excluído da **Previsão** → valor a maior no Total e divergência entre as duas telas para o mesmo prestador/mês.
   - Correção: passar `r.idFavorecido` nas 5 chamadas do bloco `calcularRemuneracaoReal`.

2. **[Alta]** `calculo.ts:74-78,80-85,125-133` — `taxaPorFuncao` retorna `0` para qualquer função fora de "AC"/"PS"; `normalizarFuncaoContrato` só reconhece essas duas. Quando o prestador tem **contrato único** com função diferente (ex.: "Fonoaudiologia") e sem `valorPA` preenchido, esse contrato **prevalece sobre a tabela de taxas padrão** e zera o PA de todas as sessões, mesmo havendo uma taxa cadastrada para a especialidade.
   - Correção: em `resolverPARow`, se o contrato único não tiver `valorPA` definido, cair no fallback da tabela `taxasPA` em vez de retornar 0.

3. **[Alta]** `calculo.ts:685-689,744-747` — diária (PPD) e datas de ETA são somadas para **toda** linha com profissional na agenda, antes da classificação (cancelado/não evoluído/substituído). Um dia com todas as sessões canceladas ainda soma a diária inteira.
   - **Decisão de negócio necessária antes de corrigir**: confirmar com a diretoria se a diária é "por dia agendado" ou "por dia efetivamente trabalhado". Se for a segunda, mover a contagem de `diasPorEsp`/`etaAdminDatas` para depois da classificação de cada sessão.

4. **[Média]** `calculo.ts:704` — `valorRecuperavel` (pendências) usa a tabela padrão `taxasPA`, enquanto o valor confirmado usa `resolverPARow` (contrato). Se o PA do contrato diverge da tabela, o "potencial a recuperar" fica inconsistente com o critério usado no confirmado.

5. **[Média]** `AnaliseFuturaTab.tsx:233` vs `calculo.ts:440` — no card "X% presença", a linha do bônus ETA só aparece quando `is100`, mas `totalX` já inclui `mensalETA100` integralmente. Quem soma PA + PPD + PE manualmente no card X% não bate com o total exibido quando há ETA. É só exibição (o total está certo) — adicionar a linha do ETA também no detalhamento de X%.

6. **[Média]** `dashboardRP.ts:26` — `add()` descarta sessões sem especialidade preenchida. Se uma sessão tiver PA > 0 (possível via bug do item A.2) mas especialidade vazia, ela entra no card do prestador mas não no "Total do mês" do dashboard.

7. **[Média]** `calculo.ts:295,346` calculam o dia da semana a partir da coluna `Data`; `ocupacaoProf.ts:474-476` usa a coluna `Dia da Semana` da view porque a data pode não bater com o dia real. Se a base tiver essa inconsistência, PA mensal e o donut de ocupação podem discordar sobre em qual dia cai a sessão (afeta desconto de feriado).

8. **[Média]** `calculo.ts:934` — quando um relatório de PE atravessa dois meses, `diasMes` é calculado a partir do primeiro mês da primeira data e aplicado a todos os pares, distorcendo os valores proporcionais do segundo mês.

9. **[Média]** `calculo.ts:134-163` — com dois ou mais contratos vigentes e nenhum casando com a função da linha do relatório (nem um contrato "sem função"), o cálculo ignora os valores cadastrados e usa a taxa padrão pela função do relatório, ainda marcando `cadastroContratoPendente: true` mesmo havendo cadastro.

10. **[Baixa — higiene]**:
    - `calculo.ts:806` — `PE_NOVA_REGRA_INICIO` declarada e nunca usada.
    - `calculo.ts:76` — fallback hardcoded `?? 30` para PS quando a config não tem a chave.
    - `calculo.ts:755` (semana civil domingo-based) vs `calculo.ts:847-853` (ISO) — duas fórmulas de semana no mesmo arquivo; inócuo hoje, frágil na virada de ano.
    - `exportAnaliseFutura.ts:5` importa `finalizarBaseOcup` de `lib/remuneracao/ocupacao.ts`, enquanto a UI usa `lib/cronograma/ocupacaoProf.ts` — números iguais hoje, textos (`baseTexto/baseCompacta`) diferentes; risco de divergência futura.
    - Acúmulo monetário em float sem arredondar centavos a cada soma — diferença de até R$ 0,01 entre total agregado e soma dos valores exibidos (aceitável, mas documentar).

---

## B. Alinhamento "Dias trabalhados" (Previsão) — causa raiz da reclamação original

Arquivo: `frontend/components/cronograma/remuneracao/AnaliseFuturaTab.tsx`

1. **[Alta]** `:310-327` — a sub-tabela de PPD tem 3 colunas (Dia / Ocorr. / valor) dentro do mesmo card da tabela principal de 6 colunas (`:264-302`), sem que as larguras sejam compartilhadas. É a origem provável do desalinhamento visual.
2. **[Média]** `:264` + `:455-457` — cada terapia renderiza sua própria `<table class="w-full">` com layout automático; blocos empilhados (terapias diferentes) calculam larguras de coluna independentes, então a mesma coluna (ex.: "Sess/mês") não fica alinhada entre um bloco e o próximo.
3. **[Baixa/Média]** `:295-299` — a linha de PE do CC usa `colSpan={3}` com texto longo, alargando as 3 primeiras colunas só naquele bloco específico.
4. **[Baixa]** `:279-288` — colunas de contagem centralizadas sem `tabular-nums`; o indicador de feriado "−N" fica dentro da célula centralizada, tirando o número do eixo.

**Correção recomendada**: unificar as tabelas de um mesmo card num único `<table>` (principal + PPD) OU aplicar `table-fixed` com larguras de coluna definidas via `colgroup`/classes `w-*` idênticas em todos os blocos da tela.

---

## C. Dark mode — por tela

### C.1 Config
- **[Alta]** `B.navy` (`#222847`) inline em títulos de seção — ilegível no escuro:
  `ConfigTab.tsx:119,169,243`, `CapacidadeConfig.tsx:155`, `ContratosAtuaisConfig.tsx:265`, `ContratosAntigosConfig.tsx:165`, `FeriadosConfig.tsx:67`.
- **[Alta]** `FeriadosConfig.tsx:89,93,97` — inputs/select sem nenhuma cor definida (`className="w-full border rounded-lg px-3 py-2 text-sm"`), única seção "crua" do Config.
- **[Alta]** `ConfigTab.tsx:75` — caixa de erro `border-red-200 bg-red-50 text-red-800` sem variantes dark.
- **[Média]** `FeriadosConfig.tsx:123` — chips de tipo (`bg-purple-100 text-purple-700` / `bg-orange-100 text-orange-700`) sem `dark:`.
- **[Média]** Vários `text-slate-500` sem `dark:text-slate-400` par: `ConfigTab.tsx:122,247`, `FeriadosConfig.tsx:68,88,92,96,110,127`, `CapacidadeConfig.tsx:185`, `ContratosAtuaisConfig.tsx:311`, `ContratosAntigosConfig.tsx:217`.
- **[Baixa]** `FeriadosConfig.tsx:111` — `text-slate-300` no ícone fica mais claro que o texto no dark (hierarquia invertida).

### C.2 Total/Individual (concentrado em `CardRemun.tsx`)
- **[Alta]** `:686` — `style={{ borderColor: "#bbf7d0", color: "#15803d" }}` sobre card `bg-emerald-950/30` no dark: verde-700 quase invisível sobre verde-escuro. Pior achado do módulo.
- **[Alta]** `:850-861` — coluna "Totais" do bloco CC/PE com gradiente inline claro fixo (`#faf5ff → #f5f3ff`) e `text-purple-400` sem shim — ruim nos dois temas.
- **[Média]** Padrão "pill clara + texto escuro" inline repetido ~10x: `:70-78` (`BADGE_COLORS`), `:141-146,158-172` (chips de presença), `:509` (avatar), `:554` (badge de inconsistência), `:704` (aviso presença), `:816-831` (banner "PE não calculado"), `:835-840` (headers `PeBloco`), `:893-896` (headers de blocos de sessões), `:755` (borda `#e9d5ff`).
- **[Média]** Texto `B.amber` (`#b45309`, feito para fundo claro) usado sobre `bg-card` escuro em `:545,581,642` e `PeLinha:205` — contraste ~3:1. Mesmo padrão em `PeCoordenadoresPanel.tsx:28-30`.
- **[Média]** `RemunIndividualTab.tsx:215,237` — botão CTA com `B.navy` inline "some" no dark (só o texto flutua).
- **Correção recomendada**: extrair um componente `StatusChip` único com classes Tailwind (`bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300` etc.) para substituir os ~10 pontos de cor inline duplicada de uma vez.

### C.3 Previsão (já é a tela mais avançada)
- **[Média]** `AnaliseFuturaTab.tsx:371,375` — `corTopo` pode usar `B.navy` na faixa de gradiente do topo do card; o comentário `:76-78` já resolveu um caso análogo (`TONE_ACCENT.slate`) mas não este.
- **[Baixa]** `:662` chip de filtro ativo `bg-sky-600 text-white` sem `dark:` (funciona, mas destoa do padrão invertido usado em `:655`).
- **[Baixa]** `:511` ícone `text-green-500` sem `dark:` (aceitável visualmente).
- **[Baixa]** `InteractivePieChart.tsx:83,160` — disco central do donut (`fill-white dark:fill-card`) destoa do fundo tintado do `StatCardShell` (`bg-slate-100 dark:bg-slate-800/60`).

---

## D. Filtros — por tela

### D.1 Previsão (`AnaliseFuturaTab.tsx`)
- **[Média]** Estado de filtros (busca, especialidade, ordenação) não persiste em URL nem storage — F5 zera tudo.
- **[Média]** `:633-637` busca sem `aria-label`; `:669-678` select "+ especialidade" sem accessible name.
- **[Média]** Alvos de toque pequenos: pills `py-1` (~26px), X de remover chip 11px, input `py-1.5` — abaixo dos 44px do padrão do projeto.
- **[Baixa]** Sem "limpar tudo"; empty state de filtro (`:707-712`) não oferece botão de limpar.
- **[Baixa]** `:606` "Exibindo N" — trocar por "N de M" para deixar claro que há filtro ativo.
- **[Média — contraste]** `:697-698` botão "Exportar XLSX" branco sobre `B.green` (#3aaa5c) ≈ 2,6:1, falha AA.

### D.2 Total (`RemunRPTab.tsx`)
- **[Alta]** `:111-118` — a busca só filtra sessões **dentro de cards expandidos** (`CardRemun.tsx:461-467`). Com todos os cards recolhidos (estado padrão), digitar na busca não muda nada visível — parece quebrada.
- **[Média]** Quatro filtros combináveis (busca, inconsistência, especialidade, PE) sem indicador consolidado de "filtros ativos" nem "limpar tudo"; filtro de PE fica invisível quando o painel colapsável está fechado.
- **[Baixa]** Mensagem de vazio prioriza um filtro só quando há dois ativos.

### D.3 Individual (`RemunIndividualTab.tsx`)
- **[Média]** Dropdown custom (`:148-184`) não fecha com Escape/clique-fora, sem navegação por setas, itens `role="option"` órfãos (sem `role="listbox"` no container).
- **[Baixa]** `<label>` (`:127`) sem `htmlFor` apontando pro select; sem contagem de profissionais no dropdown.

### D.4 Config
- Já relativamente bom (busca + contador "X de Y" + `aria-pressed` nas 3 tabelas). Ponto fraco: dois paradigmas de salvamento (auto-save com badge vs. botão + `alert()`) confundem sobre qual aba precisa de "Salvar" manual.

---

## E. Outros achados (não visuais)

1. **[Alta]** Lacuna de RLS: `remuneracao_config` e `remuneracao_capacidades` continuam com escrita restrita a rp/admin (`20260706000005_remuneracao_rls_helper.sql:20-23,56-59`), enquanto as migrações novas já liberaram `remuneracao_contratos_atuais/antigos` para `diretoria`. Hoje, um usuário diretoria que edita as abas "Variáveis & Taxas", "Feriados" ou "Capacidade" recebe um erro genérico de salvamento sem entender por quê.
   - Resolver: ou ampliar a escrita dessas duas tabelas para diretoria (mesmo padrão da migração `20260708151500`), ou tornar essas 3 abas somente-leitura para o perfil diretoria na UI.
   - Nota: comentário da migração `20260708150000:6-7` ficou desatualizado (diz que a escrita "continua restrita a rp/admin", contradito 15 min depois pela `20260708151500`).

2. **[Alta]** `useAutoSaveRow.ts:59-62` — cleanup do timer no unmount **sem flush**. Se o usuário editar um campo e em menos de 800ms trocar de aba interna ou filtrar a linha para fora da lista, a edição é descartada silenciosamente (badge ainda mostra "editando…").

3. **[Alta — responsividade]** `CardRemun.tsx:565` grid com `minmax(220px,1fr)_110px_90px_90px_100px` (~630px mínimo) sem breakpoint/overflow; `:620-650` painel de donuts com bloco `shrink-0` de ~490px fixos. Estoura em telas menores que ~1000-1280px.

4. **[Média]** `CardRemun.tsx:877-885` — botão "▲ Ocultar sessões" na verdade recolhe o card inteiro (rótulo enganoso); o ramo `!modoRP` inteiro (~120 linhas: avatar, botões PDF/Word, `remPeriodo`, props `onGerarPDF/onGerarWord/dadosPorProf`) está morto — o único chamador sempre usa `modoRP={true}`.

5. **[Média]** `RemunRPTab.tsx:96-98` — aviso sobre Presença Recep. aparece mesmo antes de qualquer upload (antes do empty state).

6. **[Média]** `PeBloco` (`CardRemun.tsx:227-251`) e o bloco de sessões (`:903-929`) implementam o mesmo padrão (header colapsável + contagem + total + chevron) duas vezes — unificável num componente.

7. **[Média]** `exportAnaliseFutura.ts` aba "Detalhe por terapia" (linhas 110-131) não tem coluna de PE — somar `Total_100` das terapias de um profissional não bate com `Valor_100` da aba "Resumo" quando há CC.

8. **[Baixa]** Vários pontos de acessibilidade em Config: inputs de tabela sem `aria-label` (só placeholder/title em alguns), labels da aba Geral sem `htmlFor`/`id`, `InfoTooltip` só por hover (inacessível por teclado) — presente em Config e não usado (código morto) em `AnaliseFuturaTab.tsx:24-38`.
9. **[Baixa]** SVGs desenhados à mão em `CardRemun.tsx:762-765,819-822` quando Lucide já tem os ícones equivalentes (`Users`, `Lock`).
10. **[Baixa]** `alert()` nativo usado em vários pontos (`ConfigTab.tsx:104`, `FeriadosConfig.tsx:33,35,40`, `exportAnaliseFutura.ts:79`) destoa do resto do app.

---

## Ordem sugerida de execução

1. **A** (cálculos) — bugs de valor monetário exibido, antes de qualquer polish visual.
2. **E.1** (RLS diretoria) — está ativamente quebrando o fluxo de um perfil de usuário.
3. **B** (alinhamento "Dias trabalhados") — pedido explícito do usuário.
4. **C** (dark mode) — começar pelos `[Alta]` (textos ilegíveis), depois considerar extrair `StatusChip` para resolver os `[Média]` de uma vez.
5. **D** (filtros) — priorizar D.2.1 (busca da aba Total "não faz nada" com cards recolhidos).
6. **E.2, E.3** (auto-save perdendo dado, responsividade do CardRemun).
7. Resto: higiene, acessibilidade, itens de decisão de produto (ex.: regra de diária cancelada, item A.3).
