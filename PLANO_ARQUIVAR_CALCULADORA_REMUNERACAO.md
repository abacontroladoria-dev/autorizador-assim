# Plano: fechar os gaps de migração e liberar a remoção de `calculadora-remuneracao`

## Contexto

Projeto: `c:\Users\Maquina001\sistema-pulsar` (Next.js 16 App Router, TypeScript strict, Supabase). Frontend em `frontend/`. Branch de trabalho: **`reposicao-faltas`** (já sincronizada com `origin/reposicao-faltas` no GitHub, repo `abacontroladoria-dev/sistema-pulsar`).

Existe um projeto antigo em `c:\Users\Maquina001\calculadora-remuneracao` (React/Vite/JSX, remoto `abacontroladoria-dev/calculadora-remuneracao`) — a calculadora de remuneração standalone que foi progressivamente portada para dentro do sistema-pulsar, na área "Relacionamento Prestador" (rotas em `frontend/app/(dashboard)/relacionamento-prestador/`). O usuário quer poder **remover a pasta `calculadora-remuneracao` do workspace do VSCode/Claude Code** assim que a migração estiver realmente completa.

Uma auditoria completa (6 agentes em paralelo, comparando cada view/util do app antigo contra o equivalente no sistema-pulsar) já foi feita e encontrou gaps reais. Este documento é o plano de correção desses gaps, pra ser executado numa sessão nova (sem memória da conversa que gerou a auditoria).

**Branch `reinicializacao-rp` do calculadora-remuneracao**: existia um commit local (`9b10a28`, nunca publicado no GitHub) com uma melhoria real — casamento de falta de paciente por `tita_agendamento_id` antes de cair para nome+data+hora. Essa melhoria **já foi portada** para `frontend/lib/remuneracao/presencaReal.ts` (função `presencaDaSessao`) e já está commitada/pushada no sistema-pulsar. Não precisa mexer nisso de novo.

## Regras de execução

- Trabalhe **um item por vez**. Mostre um resumo do que vai mudar antes de editar, e espere confirmação antes de ir pro próximo.
- Depois de cada correção, rode (o diretório de trabalho às vezes reseta para a raiz do repo entre comandos Bash — confirme com `pwd` antes de rodar):
  ```
  cd frontend
  npx tsc --noEmit
  npx vitest run
  npm run build
  ```
  Todos devem terminar verdes antes de seguir pro próximo item.
- Não expanda escopo além do que está descrito aqui — são correções pontuais de paridade, não uma reforma.
- Tabelas com PII (salários/contratos: `remuneracao_contratos_antigos`/`_atuais`) — não exponha esses dados em logs/prints.
- Se precisar de uma migration SQL nova, **não a aplique você mesmo** — o usuário aplica manualmente via SQL Editor do Supabase (projeto não está `supabase link`ado nesta máquina). Gere o arquivo em `supabase/migrations/` com timestamp `AAAAMMDDHHMMSS_*.sql` e peça pro usuário rodar.
- Enquanto a pasta `calculadora-remuneracao` ainda existir no disco (`c:\Users\Maquina001\calculadora-remuneracao`), use-a como referência de comportamento/fórmulas — é a fonte da verdade do que a ferramenta antiga fazia. **Não a modifique.**
- Já existem migrations pendentes de rodar no Supabase de trabalho anterior (confirme com o usuário se já foram aplicadas):
  - `supabase/migrations/20260707160000_seed_contratos_antigos_resgate.sql` (resgate de 115 contratos antigos)
  - `supabase/migrations/20260707180000_create_vw_profissionais_roster.sql` (view de roster de profissionais)

---

## Itens bloqueantes (ordem sugerida — resolver antes de considerar arquivar o repo antigo)

### 1. Legenda: 100% do conteúdo ausente

**Arquivo antigo:** `c:\Users\Maquina001\calculadora-remuneracao\src\views\Legenda\index.jsx` (~200 linhas).

**Mapa do conteúdo a portar** (linhas aproximadas no arquivo antigo):
- Relatórios usados pela ferramenta + mapeamento por aba: linhas ~21-46
- Regras críticas e manutenção assistida: ~48-68
- Regras de Ocupação de Salas (capacidade de sala/profissional, ocupação física vs sessões, inconsistência): ~70-98
- Regras de Ocupação de Profissionais: ~100-107
- **As três modalidades de pagamento** (PA, PE, PPD) com valores/regras: ~109-137
- **ETA — modelo de 3 frentes** (PPD/PA/Bônus semanal): ~139-155
- **Classificação das sessões** (8 categorias: evolução normal, substituição, pendente retroativa, cedida, cancelada, não evoluída, evolução sem presença, cancelado evoluído): ~157-182
- Regras de projeção mensal por dias úteis reais e feriados: ~184-193

**Onde colocar no sistema-pulsar:**
- Rota já existe: `frontend/app/(dashboard)/relacionamento-prestador/legenda/page.tsx`, hoje renderiza `<RemuneracaoPlaceholderTab title="Legenda" />` (`frontend/components/cronograma/remuneracao/RemuneracaoPlaceholderTab.tsx`).
- Criar um componente novo (ex.: `frontend/components/cronograma/remuneracao/LegendaTab.tsx`) com o conteúdo, adaptado ao mesmo sistema visual das outras abas de Relacionamento Prestador (`bg-card`, `border-border`, `text-foreground`/`text-muted-foreground`, dark-mode aware — ver `CardRemun.tsx`/`AnaliseFuturaTab.tsx` como referência de padrão visual já estabelecido nesta migração).
- Trocar o `page.tsx` da rota `/legenda` pra usar esse componente novo em vez do placeholder.
- **Verificação**: os valores de PA/PE/PPD/ETA citados na legenda devem vir de `useRemuneracaoConfig()` (dinâmicos), não hardcoded, já que são configuráveis em `/relacionamento-prestador/config`.

### 2. Exportação XLSX da aba RP ausente

**Arquivo antigo:** `c:\Users\Maquina001\calculadora-remuneracao\src\views\RemuneracaoRP\exportarRemuneracao.js` (101 linhas, 7 abas de planilha: Resumo, PE proporcional, Sessões que pagam, Registros pendentes, Perdidas para substituição, Inconsistências, Contratos pendentes — confirme a lista exata lendo o arquivo, a auditoria não teve certeza absoluta do nome de todas as 7).

**Padrão a seguir:** o mesmo já usado em `frontend/lib/remuneracao/exportAnaliseFutura.ts` (função `exportarAnaliseXlsx`, criada nesta mesma migração) — usa o pacote `xlsx` já instalado (`import * as XLSX from "xlsx"`), monta várias `XLSX.utils.json_to_sheet(...)` e um `XLSX.writeFile(...)`.

**O que fazer:**
- Criar `frontend/lib/remuneracao/exportRemuneracaoRP.ts` portando a lógica de `exportarRemuneracao.js`, adaptando os nomes de campo pra `ProfRemunReal`/`SessaoComPapel` (tipos de `frontend/lib/remuneracao/calculo.ts`).
- Adicionar um botão "Exportar XLSX" em `frontend/components/cronograma/remuneracao/RemunRPTab.tsx`, seguindo o mesmo padrão visual do botão equivalente em `AnaliseFuturaTab.tsx`.
- **Verificação:** abrir o Excel gerado e conferir que os valores batem com o que a tela mostra pra pelo menos 2-3 profissionais.

### 3. Cadastros de contrato não conectados ao cálculo real da aba RP

**O problema:** `frontend/hooks/useRemuneracao.ts`, função `useRemunRP`, chama `calcularRemuneracaoReal(evoRows, { ..., antigos: {}, cadastroPrestadores: {} })` — **sempre vazios**, com o comentário `// antigos/cadastroPrestadores chegam vazios até o Passo 9`. Isso significa que os contratos cadastrados nas telas `ContratosAntigosConfig.tsx`/`ContratosAtuaisConfig.tsx` (reescritas recentemente com auto-save) nunca chegam no cálculo de remuneração real — só são usados hoje em `useAnaliseFutura` (a projeção).

**Como corrigir:** espelhar exatamente o que `useAnaliseFutura` já faz (mesmo hook, função vizinha, no mesmo arquivo):
```ts
// já existe em useAnaliseFutura — replicar em useRemunRP:
const [antigos, setAntigos] = useState<Record<string, ContratoAntigoInfo>>({})
// + useEffect que chama getContratosAntigos() e getCapacidades() (de @/services/remuneracao.service)
```
Só que `cadastroPrestadores` (usado por `calcularRemuneracaoReal` e por `documento.ts`/`resolverContratoPrestador`) espera o formato de `ContratoAtual` (cpf/cnpj/contratos_atuais), não `ContratoAntigoInfo` — vai precisar buscar também via `getContratosAtuais()` e montar o `Record<string, ContratoAtual>` (ou o formato que `buscarCadastroContratual`/`findCadastroPrestador` esperam — checar em `calculo.ts` e `documento.ts` a assinatura exata).

**Verificação:** cadastrar um contrato atual de teste (função AC, PA R$99) pra um profissional que aparece na grade carregada, e confirmar que o card dele na aba RP mostra o PA R$99 com a explicação citando o contrato, em vez do fallback genérico por função.

### 4. Período do documento fiscal individual sempre vazio

**O problema:** `frontend/components/cronograma/remuneracao/RemunIndividualTab.tsx` (por volta da linha 81) passa `remPeriodo: null` fixo pra `documento.ts`, então o PDF/Word "Apuração do Faturamento" sempre mostra "— a —" em vez do período real do relatório carregado.

**Como corrigir:** calcular o período (data mínima e máxima) a partir de `evoRows` dentro de `useRemunRP` (ou como um `useMemo` dentro do próprio `RemunIndividualTab.tsx`), e passar `{ inicio, fim }` formatados em vez de `null`. Usar `formatDateBR` (já existe em `lib/remuneracao/datas.ts`) pra exibir no formato brasileiro.

**Verificação:** gerar um PDF individual e conferir que o cabeçalho mostra o período correto do mês carregado.

### 5. Capacidade do profissional: sem edição inline, só via CSV

**Arquivo antigo:** `c:\Users\Maquina001\calculadora-remuneracao\src\views\Config\index.jsx` linhas ~280-336 — tela que lista profissionais com edição inline de "Padrão" e cada dia da semana, mostrando a terapia base e o "padrão do sistema calculado" (via `capacidadePadraoProfissional` — Musicoterapia=2, demais=1).

**Arquivo atual:** `frontend/components/cronograma/remuneracao/config/CapacidadeConfig.tsx` — hoje é só leitura + import de CSV (igual ao antigo modelo de `ContratosAntigosConfig.tsx`/`ContratosAtuaisConfig.tsx` **antes** da reescrita desta migração).

**Como corrigir:** aplicar exatamente o mesmo padrão já usado para reescrever `ContratosAntigosConfig.tsx` (lista completa de profissionais vinda de `getProfissionaisRoster()`, edição inline por linha, auto-save com debounce via `useAutoSaveRow` — hook já existe em `frontend/hooks/useAutoSaveRow.ts`, reaproveitar). Adicionar também a exibição da "terapia base" e do padrão calculado pelo sistema (função `capacidadePadraoProfissional`, já portada em `frontend/lib/remuneracao/ocupacao.ts`) como texto de apoio ao lado do campo editável.

**Verificação:** editar a capacidade de um profissional específico direto na tela (sem CSV) e confirmar que salva (auto-save) e reflete no cálculo de ocupação.

### 6. Limite de pacientes de Coordenador de Caso sem UI de edição

**O problema:** o campo `limite_cc` existe na tabela `remuneracao_capacidades` (migration `20260706000007_remuneracao_analise_futura_config.sql`) e é **lido** em `CardRemun.tsx` (`analProf?.limiteCC ?? DEFAULT_CC_LIM`), mas não existe nenhum formulário em lugar nenhum do sistema-pulsar pra escrever esse valor. No app antigo, era editado inline na própria aba de Remuneração RP (`LimitInput.jsx`), não na tela de Config.

**Como corrigir:** adicionar um campo editável de `limite_cc` na mesma tela/linha da Capacidade do profissional (item 5 acima), já que ambos vivem na mesma tabela `remuneracao_capacidades` e o mesmo padrão de auto-save por linha se aplica.

**Verificação:** definir um limite customizado pra um Coordenador de Caso específico, e confirmar que o alerta de "CC acima do limite" na aba RP/Análise Futura passa a usar esse valor em vez do `cc_lim_default` global.

---

## Itens que exigem decisão consciente do usuário (perguntar antes de mexer)

### 7. Histórico: mudança de granularidade (projeção vs realizado)

O antigo salvava snapshot da **projeção** (Análise Futura): `total100`, `totalX` (presença configurada), `pe`. O novo (`HistoricoTab.tsx`) salva snapshot do **realizado** (aba RP): só `valorConfirmado`. Não é bug, é outra decisão de arquitetura. **Perguntar ao usuário**: quer voltar a ter a comparação "100% presença vs presença real" no gráfico do Histórico (precisaria salvar também os dados de `AnaliseFuturaTab`/`calcularAnaliseFutura` no snapshot, não só o de `useRemunRP`), ou o snapshot do realizado já é suficiente?

### 8. `PEDetalheItem` reduzido (já conhecido, sem novidade)

Já estava registrado no `FIX_CODE_REVIEW_BUGS.md` (arquivo de handoff anterior, na seção "Itens conhecidos mas de menor prioridade") como algo que o usuário optou por adiar: `calcularPEProporcional` perdeu campos de auditoria por paciente (`observacao`, `arredondouFimMes`, `trocaCoordenador`, `conflitoSemana`, período de atendimento, contadores). **Perguntar se ainda quer adiar**, já que agora está sendo formalmente re-listado no contexto de "posso arquivar o repo antigo?".

### 9. Dashboard gerencial da aba RP mais enxuto

O antigo (`RemuneracaoRP/index.jsx` linhas ~87-268) tinha painel de 8 KPIs, bloco "PE dos Coordenadores — visão gerencial" com 6 contadores clicáveis, seção "Contratos pendentes", cards "Melhor desempenho"/"Ponto de atenção", múltiplos filtros rápidos. O novo (`RemuneracaoRPDashboard.tsx`, feito nesta migração) tem só o total do mês + barra por especialidade + toggle de inconsistência. **Perguntar ao usuário** quais desses blocos específicos ele sente falta de verdade (não assumir que quer tudo de volta — parte pode ter sido intencionalmente simplificada no redesign).

---

## Itens cosméticos (baixa prioridade, sem impacto em R$ — resolver só se sobrar tempo)

### 10. Badge "+X ETA" mostra contagem semanal em vez de mensal

**Arquivo:** `frontend/components/cronograma/remuneracao/AnaliseFuturaTab.tsx` (~linha 325) usa `t.etaSessoesSemana` onde deveria usar uma contagem mensal equivalente ao antigo `etaSessoesMes100` (`calculadora-remuneracao/src/views/AnaliseFutura/index.jsx:137` e `App.jsx:824`). O campo `etaSessoesMes100` não existe mais no tipo `TerapiaDetalhe` (`frontend/lib/remuneracao/calculo.ts`). Precisa adicionar esse campo de volta ao cálculo (`calcularAnaliseFutura`) e trocar o uso na tela. Não afeta nenhum valor em R$, só o número exibido no chip.

### 11. PDF individual da Análise Futura não mostra mais o nome do arquivo de origem

`frontend/lib/remuneracao/exportAnaliseFutura.ts` cai sempre no fallback `"grade importada"` em vez de mostrar o nome do CSV — esperado, já que a grade agora vem do banco (`buscarGradeParaAnalise`), não de upload manual. Avaliar se vale substituir por algo como o período da semana de referência, já disponível.

### 12. Resumo textual do ETA sumiu da aba de taxas do Config

O antigo tinha uma caixinha "ETA: PA R$X/sessão + PPD R$Y/dia + Bônus R$Z/semana" (`Config/index.jsx:171-173`) que não tem equivalente em `ConfigTab.tsx`. Puramente informativo.

---

## Verificação adicional (não decidível só lendo código)

### 13. Confirmar que `presencaReal.ts` bate com o comportamento antigo de `vw_faltas_pacientes`

`frontend/lib/remuneracao/presencaReal.ts` (feito nesta migração) consulta a tabela `fila_autorizacoes` diretamente; o app antigo (`chaveSessao.js`/`faltasPacientes.js`) consultava a view `vw_faltas_pacientes` (que só existe no Supabase do projeto antigo, não no do sistema-pulsar). A lógica de casamento (por `tita_agendamento_id`, com fallback pra paciente+data+hora) é a mesma, mas a fonte e o filtro de status podem divergir sutilmente. **Ação:** pedir pro usuário (ou comparar manualmente) rodar a mesma janela de datas nos dois sistemas, se ainda houver acesso ao antigo, e conferir se a coluna "Presença Recep." bate linha a linha pra uma amostra de sessões.

---

## Definição de "pronto pra remover a pasta do workspace"

Antes de tirar `calculadora-remuneracao` do workspace, confirme:

- [ ] Itens 1-6 (bloqueantes) resolvidos e verificados, com `tsc`/`vitest`/`build` verdes a cada passo.
- [ ] Itens 7-9 (decisão consciente) discutidos com o usuário — mesmo que a decisão final seja "não fazer agora", isso precisa ser uma escolha explícita, não um esquecimento.
- [ ] Item 13 (verificação de presença real) conferido pelo usuário.
- [ ] Migrations pendentes (`20260707160000_...` e `20260707180000_...`) confirmadas como aplicadas no Supabase.
- [ ] Commit + push de tudo pra `origin/reposicao-faltas`.
- [ ] Sugestão final: rodar mais uma rodada rápida dos 6 agentes de auditoria (ou pelo menos releitura manual dos itens 1-6) pra confirmar que não sobrou nada, antes de remover a pasta de vez.

Só depois disso é seguro considerar `calculadora-remuneracao` obsoleto e tirar do workspace/arquivar o repositório.
