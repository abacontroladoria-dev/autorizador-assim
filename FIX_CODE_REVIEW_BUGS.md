# Corrigir bugs do code review — feature "Relacionamento Prestador"

## Contexto

Projeto: `c:\Users\Maquina001\sistema-pulsar` (Next.js 16 App Router, TypeScript strict, Supabase). Frontend em `frontend/`.

Uma migração de calculadora standalone para uma nova área do Pulsar ("Relacionamento Prestador", rotas em `frontend/app/(dashboard)/relacionamento-prestador/`) foi concluída em 10 passos incrementais. Duas rodadas de `/code-review` (skill do Claude Code) foram feitas sobre o código: uma durante os Passos 1-6 (lib/remuneracao, hooks), outra sobre os Passos 7-10 (CardRemun, ConfigTab e subcomponentes, PDF/documento). Este arquivo lista **todos os bugs confirmados que ainda não foram corrigidos**. Um item (regressão de fonte no `InteractivePieChart.tsx` compartilhado) já foi corrigido antes deste handoff — não precisa tocar nele.

## Regras de execução

- Trabalhe **um item por vez**. Mostre um resumo do que vai mudar antes de editar.
- Depois de cada correção, rode:
  ```
  cd frontend
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```
  Todos devem terminar verdes antes de seguir pro próximo item.
- Não expanda escopo além do que está descrito — são correções pontuais, não refatorações.
- Alguns desses bugs tocam tabelas com PII (salários/contratos, `remuneracao_contratos_antigos`/`_atuais`). Não exponha esses dados em logs/prints ao corrigir.
- Se precisar de uma migration SQL nova, **não a aplique você mesmo** — o usuário aplica manualmente via SQL Editor do Supabase (projeto não está `supabase link`ado nesta máquina). Gere o arquivo em `supabase/migrations/` com timestamp `20260707HHMMSS_*.sql` e peça para o usuário rodar.

---

## Itens pendentes (ordem sugerida: corretude → segurança → eficiência/limpeza)

### 1. `resolverPARow` trata `valorPA: 0` explícito como "não informado"

**Arquivo:** `frontend/lib/remuneracao/calculo.ts:125` e `:135`

```ts
const valor = c.valorPA || taxaPorFuncao(c.funcao, { ccPA, taxasPA })
```

**Problema:** um contrato com `valorPA` explicitamente igual a 0 (ex.: "sem PA por sessão, compensado em outro contrato") é indistinguível de "não cadastrado" — o `||` cai no fallback da taxa padrão da função, pagando um valor que o contrato diz que não deveria existir.

**Já parcialmente corrigido:** o tipo `ContratoAtualItem.valorPA` já foi mudado para `number | undefined`, e `contratosAtuaisDoCadastro` (mesmo arquivo, ~linha 88-98) já preserva a distinção 0-explícito vs. não-informado usando `!= null` em vez de `||`. **Falta só** trocar as duas linhas acima (125 e 135) de `c.valorPA || taxaPorFuncao(...)` para `c.valorPA != null ? c.valorPA : taxaPorFuncao(...)`.

**Verificação:** não há teste automatizado para `resolverPARow` ainda (é código sem cobertura, herdado da calculadora original). Validar manualmente: criar um cadastro de contrato atual com `valorPA: 0` e confirmar que o PA calculado para esse profissional é R$0, não a taxa padrão da especialidade.

---

### 2. `ConfigTab.tsx` viola a Regra dos Hooks (`useState` depois de `return` condicional)

**Arquivo:** `frontend/components/cronograma/remuneracao/ConfigTab.tsx:107`

```tsx
// linhas ~63-83: dois `return` condicionais (configLoading, configError/!config)
if (configLoading) { return (...) }
if (configError || !config) { return (...) }

// linha 107 — DEPOIS dos returns:
const [activeTab, setActiveTab] = useState("geral")
```

**Problema:** no primeiro render (com `configLoading=true`), o componente retorna antes desse `useState` ser chamado. Quando o config termina de carregar e o componente re-renderiza passando dos returns, o número de hooks chamados nessa instância do componente muda entre renders — viola a Regra dos Hooks. React lança "Rendered more hooks during update than during the previous render" e a tela quebra exatamente no momento em que os dados terminam de carregar.

**Correção:** mover todas as declarações de `useState`/hooks para o topo do componente, **antes** de qualquer `if (...) return`. Aplicar o mesmo princípio a `activeTab` e a qualquer outro hook que hoje esteja depois dos early returns nesse arquivo (revisar o arquivo todo, não só a linha 107).

**Verificação:** abrir `/relacionamento-prestador/config` em produção/dev (não só com dados já em cache) e confirmar que a transição loading→carregado não lança erro no console nem tela branca.

---

### 3. Import de CSV não trata separador de milhar do formato brasileiro (`,`/`.`)

**Arquivos:**
- `frontend/components/cronograma/remuneracao/config/ContratosAntigosConfig.tsx:43`
  ```ts
  salario: row["Salário"] ? Number(row["Salário"].replace(",", ".")) : null,
  ```
- `frontend/components/cronograma/remuneracao/config/ContratosAtuaisConfig.tsx:64`
  ```ts
  valorPA: valor ? Number(valor.replace(",", ".")) : 0,
  ```

**Problema:** `.replace(",", ".")` só troca a vírgula decimal e ignora o ponto de milhar. Um salário formatado como `"3.500,00"` (comum em export BR para valores ≥ R$1.000) vira `"3.500.00"` → `Number(...)` retorna `NaN` → ao serializar para o Supabase (`JSON.stringify`), `NaN` se transforma em `null` silenciosamente. Resultado: salários/PA de profissionais com valores altos são gravados como `null`/`0` sem nenhum erro.

**Correção:** escrever um parser numérico BR robusto (remover pontos de milhar antes de trocar a vírgula decimal), por exemplo:
```ts
function parseNumeroBR(v: string | undefined | null): number | null {
  if (!v) return null
  const limpo = String(v).trim().replace(/\./g, "").replace(",", ".")
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}
```
Usar esse helper nos dois arquivos (considerar colocar em `frontend/lib/remuneracao/formatacao.ts` para reuso). Depois de parsear, se o resultado for `null` para uma linha que tinha um valor não-vazio no CSV, **não** silenciar — ver item 4 (não reportar sucesso se uma linha falhar).

**Verificação:** testar upload de um CSV com um salário `"3.500,00"` e confirmar que é gravado como `3500`, não `null`.

---

### 4. Falhas de importação de CSV são engolidas — usuário vê "sucesso" mesmo com linhas que falharam

**Arquivos:**
- `frontend/components/cronograma/remuneracao/config/CapacidadeConfig.tsx:53` — `await upsertCapacidade(record)`
- `frontend/components/cronograma/remuneracao/config/ContratosAntigosConfig.tsx:47` — `await upsertContratoAntigo(record)`
- `frontend/components/cronograma/remuneracao/config/ContratosAtuaisConfig.tsx:72` — `await upsertContratoAtual(record)`

**Problema:** os três `upsert*` retornam `boolean` (`!error`), mas nenhum dos três loops de importação verifica esse retorno. Ao final, a tela mostra `alert("Importação concluída!")` (ou similar) incondicionalmente, mesmo que algumas linhas tenham falhado ao salvar (erro de rede, conflito de chave, dado malformado).

**Correção:** em cada um dos 3 arquivos, acumular os resultados do loop (ex.: `const falhas: string[] = []`), e ao final:
```ts
if (falhas.length > 0) {
  alert(`Importação concluída com ${falhas.length} erro(s). Linhas com falha: ${falhas.join(", ")}`)
} else {
  alert("Importação concluída com sucesso!")
}
```
Usar o nome do profissional (ou índice da linha) para identificar a linha com falha na mensagem.

**Verificação:** simular uma falha (ex.: desconectar rede momentaneamente, ou forçar um erro no service) durante um upload e confirmar que o aviso reflete a falha real, não "sucesso" genérico.

---

### 5. Import de CPF/CNPJ sem validação de formato

**Arquivo:** `frontend/components/cronograma/remuneracao/config/ContratosAtuaisConfig.tsx:49-50`

```ts
cpf: row["CPF"] || null,
cnpj: row["CNPJ"] || null,
```

**Problema:** nenhuma validação de formato/dígito antes de gravar como PII na tabela `remuneracao_contratos_atuais` (protegida por RLS). Um desalinhamento de colunas no CSV (comum quando o export do cliente reordena/omite uma coluna) pode gravar um telefone, texto qualquer, ou dado de outro profissional no campo `cpf`/`cnpj`, e a UI trata qualquer valor não-vazio como "preenchido" (ver linha 143, `const doc = c.cpf || c.cnpj`).

**Correção:** adicionar validação mínima antes de aceitar o valor — normalizar (remover pontuação) e checar contagem de dígitos (CPF = 11 dígitos, CNPJ = 14 dígitos). Se não bater, tratar como inválido (não gravar, ou gravar com um flag de "pendente de revisão") e reportar a linha como falha (reaproveitar o mecanismo do item 4). Não precisa implementar validação de dígito verificador completa — checagem de tamanho/formato já resolve o caso de desalinhamento de coluna.

**Verificação:** testar upload com uma linha de CPF/CNPJ vazio, uma com valor válido, e uma com valor claramente errado (ex.: "21987654321" que é celular, 11 dígitos mas começa com DDD — se quiser ir além do tamanho, considerar checksum; caso contrário documentar a limitação).

---

### 6. `useRemuneracaoConfig()` chamado de forma redundante em várias abas

**Arquivos (todos chamam `useRemuneracaoConfig()` de forma independente, sem cache):**
- `frontend/components/cronograma/remuneracao/config/FeriadosConfig.tsx:11`
- `frontend/components/cronograma/remuneracao/ConfigTab.tsx:32`
- `frontend/components/cronograma/remuneracao/RemunIndividualTab.tsx:30`
- `frontend/components/cronograma/remuneracao/RemunRPTab.tsx:20`
- `frontend/hooks/useRemuneracao.ts:16` e `:70` (dentro de `useAnaliseFutura` e `useRemunRP`)

**Problema:** `frontend/hooks/useRemuneracaoConfig.ts` não tem cache/memoização — cada chamada dispara uma nova query Supabase contra a linha única de `remuneracao_config`. Como várias abas/componentes chamam o hook de forma independente (algumas já dentro de um contexto que também o chama via `useRemunRP`), a mesma configuração é buscada várias vezes por navegação, e a tela pode mostrar brevemente valores de fallback enquanto a segunda cópia carrega.

**Correção (escolher uma):**
- **Opção simples:** adicionar cache in-memory básico dentro de `useRemuneracaoConfig.ts` (um singleton de promise/estado no módulo, ou um pequeno SWR-like: se já buscou nos últimos N segundos, reusa).
- **Opção mais correta:** os componentes que já estão dentro da árvore de `RemuneracaoRPContext` (`RemunRPTab`, `RemunIndividualTab`, e qualquer coisa dentro do layout de `/relacionamento-prestador`) devem ler `config` do contexto em vez de chamar `useRemuneracaoConfig()` de novo. Verificar se o contexto (`frontend/contexts/RemuneracaoRPContext.tsx`) já expõe `config` — se sim, trocar as chamadas duplicadas por `useRemuneracaoRPContext().config`. `ConfigTab.tsx` e `FeriadosConfig.tsx` podem não estar dentro desse contexto (são a própria tela de configuração) — nesse caso, cache no hook (opção simples) é a solução, ou um contexto próprio de config compartilhado entre `ConfigTab` e seus subcomponentes (`FeriadosConfig`, `CapacidadeConfig`, etc.) para eles não rebuscarem a cada troca de sub-aba.

**Verificação:** abrir o DevTools → Network, navegar entre as abas de Relacionamento Prestador, e confirmar que o número de requests a `remuneracao_config` cai.

---

### 7. `KpiStatCard` (novo) usa cores fixas só para tema claro

**Arquivo:** `frontend/components/cronograma/remuneracao/CardRemun.tsx` — componente `KpiStatCard` (linha ~254-309) e usos (linha ~658+, ex. `bgLight="#f0fdf4"`)

**Problema:** o componente existente `frontend/components/home/KpiCard.tsx` já é dark-mode aware (usa CSS vars como `--kpi-icon-bg`, `--kpi-card-border`). O novo `KpiStatCard` local do `CardRemun.tsx` hardcoda cores hex de fundo claro (`bgLight`, `iconBg`) sem equivalente para tema escuro — no dark mode, esses cards vão aparecer com fundo claro "lavado", inconsistente com o resto do app.

**Correção:** duas opções:
- **Preferível:** substituir `KpiStatCard` por `KpiCard.tsx` existente (ver a interface de props dele e adaptar as chamadas em `CardRemun.tsx` para usar o componente compartilhado).
- **Se `KpiCard.tsx` não cobrir o layout necessário:** adicionar suporte a dark mode ao `KpiStatCard` local, usando classes Tailwind com variantes `dark:` em vez de hex fixo (ex.: `bg-emerald-50 dark:bg-emerald-950/30`), seguindo o padrão já usado em outras partes do Pulsar (ver `AGENTS.md`/páginas existentes para o padrão de cores semânticas claro/escuro).

**Verificação:** alternar entre tema claro e escuro na aba Rem. Mês - Total/Individual e confirmar que os KPIs mantêm contraste adequado nos dois temas.

---

### 8. `upsertContratoAntigo`/`upsertContratoAtual` engolem erro do Supabase sem logar

**Arquivo:** `frontend/services/remuneracao.service.ts` — funções `upsertContratoAtual` (linha ~65-68) e `upsertContratoAntigo` (linha ~78-81)

```ts
export async function upsertContratoAtual(record: any) {
  // ...
  return !error   // <- sem console.error(error) antes
}
```

**Problema:** outras funções do mesmo arquivo (`getCapacidades`, `getContratosAtuais`, `getContratosAntigos`, `getHistoricoSnapshots`, `saveHistoricoSnapshot`) fazem `console.error('Erro ...', error)` antes de retornar — só essas duas de escrita de contrato não logam. Uma falha de upsert (negação de RLS, erro de tipo, conflito) fica sem nenhum rastro no console, dificultando debug em produção.

**Correção:** adicionar `if (error) console.error('Erro ao salvar contrato atual:', error)` / `'...contrato antigo:'` antes do `return !error`, no mesmo padrão das outras funções do arquivo. Não logar o `record` inteiro (contém PII/salário) — só o objeto `error` do Supabase.

**Verificação:** forçar um erro (ex.: campo obrigatório faltando) e confirmar que aparece no console do navegador.

---

## Itens já corrigidos (não repetir)

- ~~`InteractivePieChart.tsx` — regressão de tamanho de fonte na página existente de Ocupação de Profissionais~~ — corrigido: fallback de fonte agora só aplica auto-scaling quando `centerFontSize` é passado explicitamente; chamadores existentes (sem essa prop) mantêm os valores fixos originais (11/13/8.5px, legenda 10px).

## Itens conhecidos mas de menor prioridade (mencionar ao usuário, não corrigir sem pedir)

Da primeira rodada de code review (Passos 1-6), ainda pendentes e **não incluídos na lista acima** — perguntar ao usuário se quer incluir no mesmo lote:
- `coordsAtivos` (PE) vem da grade do próprio mês da aba RP em vez da Análise Futura, sem aviso na tela (`frontend/hooks/useRemuneracao.ts`, função `useRemunRP`).
- `calcularPEProporcional` perdeu campos de auditoria por paciente (`observacao`, `arredondouFimMes`, `trocaCoordenador`, `conflitoSemana`, contadores zero/proporcional/integral) que existiam na calculadora original (`frontend/lib/remuneracao/calculo.ts`, tipo `PEDetalheItem` e função `calcularPEProporcional`).
- Bloco "Agenda" e "Substituição" duplicados em `calcularRemuneracaoReal` (`frontend/lib/remuneracao/calculo.ts`, ~linhas 625-665).
- Defaults de PE em `RemuneracaoRealConfig` nunca alcançados — único call site sempre passa os 3 campos explicitamente (`frontend/lib/remuneracao/calculo.ts` ~linha 560).
- `paInfo.valor ?? fallbackPA` morto — tipo garante que `valor` nunca é nulo (`frontend/lib/remuneracao/calculo.ts`, ~linhas 636 e 656).
- "Presença sempre Sim" só documentada num banner de UI (`RemunRPTab.tsx`), não como campo no tipo `ProfRemunReal` — risco de esquecer o aviso ao implementar reuso em outras telas.
- Paginação sequencial em `buscarGradeParaAnalise` (`frontend/lib/remuneracao/gradeRemuneracao.ts`) — 3-5 round-trips seriais em vez de paralelos. Baixo impacto no volume mensal esperado.
- Scan O(n×m) dentro do loop de `calcularPEProporcional`. Baixo impacto no volume mensal esperado.
