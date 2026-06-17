# Análise Arquitetural — Plataforma de Atendimento Multi-Agentes com IA

> **Fonte analisada:** `references/plataforma-de-atendimento-multi-agentes-com-ai`  
> **Data da análise:** 2026-06-17  
> **Escopo:** UX, experiência operacional e organização de componentes.  
> Modelagem de dados **não** é abordada; as regras de negócio do Pulsar prevalecem sobre qualquer padrão desta referência.

---

## Sumário Executivo

A referência é uma plataforma de atendimento via WhatsApp construída com React + TypeScript + shadcn/ui + Tailwind CSS. Sua organização de componentes é madura e oferece sete padrões de UX altamente reutilizáveis: layout de três colunas, AI inline no compositor, sidebar de detalhes contextual, notas internas com pin, atribuição manual + regras automáticas, e um painel de relatórios com KPIs + múltiplos gráficos.

---

## 1. Componentes Reutilizáveis de UX

### 1.1 MetricCard
**Arquivo:** `src/components/reports/MetricCard.tsx`

Card de KPI com quatro zonas fixas:
- **Cabeçalho:** título + ícone Lucide + tooltip informativo (`<Info />`)
- **Valor:** `text-2xl font-bold`
- **Tendência:** ícone direcional (`TrendingUp / TrendingDown / Minus`) com cor semântica (`text-success` / `text-destructive` / `text-muted-foreground`) e rótulo "vs período anterior"
- **Slot de conteúdo:** `children` opcional para conteúdo extra

Interface:
```ts
interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  info?: string;           // texto do tooltip
  trend?: {
    value: number;
    isPercentage?: boolean;
  };
  children?: ReactNode;
}
```

**Aplicabilidade no Pulsar:** substitui os TotalCard/KpiCard atuais com padrão unificado que já carrega tendência relativa a período anterior.

---

### 1.2 Badge de Status Semântico
**Arquivos:** `AssignmentRuleCard.tsx`, `AssignAgentDialog.tsx`, `ConversationItem.tsx`

Padrão recorrente de badge colorido para estados operacionais:
- `default` → ativo / online (verde)
- `secondary` → inativo / away (amarelo)
- `destructive` → busy / erro (vermelho)
- `outline` → papel / categoria (neutro)

Todos os badges de status usam `<Badge variant="..." className="text-xs">` com conteúdo textual, nunca apenas cor.

---

### 1.3 Avatar com Iniciais + Status Dot
**Arquivo:** `AssignAgentDialog.tsx`

Padrão para representar agentes humanos:
```tsx
<Avatar className="h-10 w-10">
  <AvatarImage src={agent.avatar_url} />
  <AvatarFallback className="bg-primary/10 text-primary">
    {getInitials(agent.full_name)}   {/* 2 iniciais em maiúsculo */}
  </AvatarFallback>
</Avatar>
<Circle className={`h-2 w-2 fill-current ${getStatusColor(agent.status)}`} />
```

O dot de status é um `<Circle />` Lucide com `fill-current`, evitando elementos HTML extras.

---

### 1.4 Empty State Padronizado
Padrão encontrado em quatro componentes distintos:
```tsx
<div className="text-center py-12 border border-dashed border-border rounded-lg">
  <p className="text-muted-foreground mb-4">Mensagem contextual</p>
  <Button onClick={handleCreate} variant="outline">
    <Plus className="mr-2 h-4 w-4" />
    Ação principal
  </Button>
</div>
```

Usado em: `AssignmentRulesManager`, `MacrosManager`, `ContactDetails`, `ConversationNotes`.

---

### 1.5 Skeleton Loading
**Arquivos:** `MetricsGridSkeleton.tsx`, `ChartsGridSkeleton.tsx`, `ConversationNotes.tsx`

Todos os estados de carregamento usam `<Skeleton className="h-N w-full" />` para preservar o layout e evitar layout shift. O padrão é: `isLoading ? <Skeleton /> : <ConteúdoReal />`.

---

### 1.6 ScrollArea Controlada
Todos os painéis com conteúdo dinâmico usam `<ScrollArea className="max-h-[Npx] pr-2">` em vez de `overflow-y-auto`. Isso garante scrollbar estilizada e padding consistente.

---

### 1.7 AlertDialog para Ações Destrutivas
Exclusões sempre passam por `<AlertDialog>` com título, descrição e dois botões (Cancelar / Confirmar). Nunca `window.confirm()`.

---

## 2. Padrões de Navegação

### 2.1 Layout Três Colunas (Master-Detail-Context)
**Arquivo:** `src/pages/WhatsApp.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│  ConversationsSidebar (resizable) │  ChatArea  │  Details    │
│  width: 300–640px (drag)          │  flex-1    │  350px      │
│  collapse → 56px                  │            │  collapse→56px │
└──────────────────────────────────────────────────────────────┘
```

- A sidebar esquerda é **arrastável** (`useResizableSidebar`): o divisor `w-1.5 cursor-col-resize` muda de cor ao arrastar.
- Largura é persistida em `localStorage` (`storageKey`).
- Sidebar direita (Detalhes) colapsa para 56px mostrando apenas o ícone.
- **Mobile:** exibe apenas uma coluna por vez — sidebar OU chat — com botão "Voltar".

### 2.2 Roteamento Flat com Quatro Módulos
```
/whatsapp             → Atendimento (3 colunas)
/whatsapp/contatos    → Gestão de contatos (2 colunas)
/whatsapp/relatorio   → Relatórios (full-width)
/whatsapp/settings    → Configurações (tabs)
```

Navegação entre módulos é por `<Link>` e `useNavigate`. Não há navbar global visível nas páginas — a navegação de retorno usa botão `<ArrowLeft />` local.

### 2.3 Configurações por Tabs com URL State
**Arquivo:** `src/pages/WhatsAppSettings.tsx`

Cada aba sincroniza com `?tab=nome` na URL via `useSearchParams`. Isso permite deep-link direto para qualquer aba e preserva o estado ao recarregar.

Abas disponíveis (com controle de permissão por role):
| Tab | Visível para |
|---|---|
| Setup | Todos |
| Conexão | Admin |
| Instâncias | Todos |
| Macros | Todos |
| Atribuição | Todos |
| Equipe | Admin |
| Segurança | Admin |

### 2.4 Banner de Alerta Global
**Arquivo:** `src/components/notifications/DisconnectedInstancesBanner.tsx`

Banner fixo no topo de todas as páginas principais para comunicar instâncias desconectadas. Renderizado condicionalmente — só aparece quando há instâncias com problema. Padrão de UX: alertas sistêmicos precedem o conteúdo da página.

---

## 3. Fluxo de Atendimento

O fluxo operacional identificado tem cinco estados:

```
FILA (sem agente)
    │
    ▼ AssignAgentDialog ou regra automática
ATRIBUÍDA (agente designado)
    │
    ▼ troca de agente
TRANSFERIDA → ATRIBUÍDA (novo agente)
    │
    ▼ resolve o atendimento
FECHADA (closed)
    │
    ▼ opcional
ARQUIVADA (archived)
```

### 3.1 Fila de Conversas
- `QueueIndicator` exibe a contagem de conversas sem agente.
- `QuickFilterPills` permite filtrar por: Todas, Minhas, Não lidas, Em fila, Abertas, Fechadas.
- Conversas sem agente ficam destacadas visualmente na lista.

### 3.2 Seleção e Abertura
- Click na `ConversationItem` abre a `ChatArea` central.
- `ConversationItemMenu` oferece ações rápidas sem abrir a conversa: atribuir, transferir, fechar, arquivar.

### 3.3 Atendimento Ativo
- `ChatHeader` exibe nome do contato, status da instância, agente atribuído.
- `ChatHeaderMenu` oferece: atribuir, transferir, fechar, arquivar.
- `MessageInputContainer` com toolbar completa.
- `ReplyPreview` para citar mensagens.

### 3.4 Encerramento
- Fechar → status `closed`
- Arquivar → status `archived`
- Ambas as ações disparam invalidação de queries para atualizar a lista.

---

## 4. Componentes de IA

### 4.1 AIComposerButton — Transformação de Texto
**Arquivo:** `src/components/chat/input/AIComposerButton.tsx`

Botão `<Sparkles />` no toolbar de input que abre um Popover com menu de ações sobre o texto digitado:

| Ação | Ícone |
|---|---|
| Expandir | Maximize2 |
| Reformular | RefreshCw |
| Meu tom de voz | User |
| Mais amigável | Smile |
| Mais formal | Briefcase |
| Corrigir gramática | CheckCircle2 |
| Traduzir para... | Languages (submenu com 5 idiomas) |

O submenu de tradução usa navegação de segundo nível dentro do Popover (ChevronLeft para voltar). O botão fica desabilitado enquanto `isComposing`.

**Padrão de UX:** IA como assistente do operador, não substituto. O texto gerado é inserido no campo e o agente confirma antes de enviar.

---

### 4.2 SmartReplySuggestions — Sugestões de Resposta
**Arquivo:** `src/components/chat/input/SmartReplySuggestions.tsx`

Exibe até 3 sugestões de resposta geradas por IA com base no contexto da conversa. Cada sugestão é um chip clicável que popula o campo de input. Atualiza a cada nova mensagem recebida.

---

### 4.3 MacroSuggestions — Sugestão de Macros
**Arquivo:** `src/components/chat/input/MacroSuggestions.tsx`

Quando o agente digita `/`, aparece um dropdown com macros correspondentes ao texto. Selecionar insere o conteúdo completo da macro no campo.

---

### 4.4 ConversationSummaries — Resumos Gerados por IA
**Arquivo:** `src/components/chat/details/ConversationSummaries.tsx`

Painel na sidebar direita que:
- Lista resumos gerados anteriormente (com data e badge de sentimento).
- Botão "Gerar Resumo" (`<Sparkles />`) dispara geração sob demanda.
- Cada resumo contém: texto livre, **pontos-chave** (bullet list), **próximos passos** (`<CheckCircle2 />`), sentimento no momento da geração.
- Expansão individual por `expandedId` (accordion single-open).
- Excluir com `AlertDialog`.

Estrutura de dados do resumo:
```ts
{
  summary: string;
  key_points: string[];
  action_items: string[];
  sentiment_at_time: 'positive' | 'negative' | 'neutral';
  created_at: string;
}
```

---

### 4.5 ConversationTopics — Categorização Automática
**Arquivo:** `src/components/chat/topics/ConversationTopics.tsx`

- Classifica a conversa em tópicos automáticos a cada 5 mensagens do cliente.
- Exibe `TopicBadges` com os tópicos identificados.
- Mostra `ai_confidence` (percentual) e `ai_reasoning` (texto de análise).
- Botão de re-categorização manual (`<RefreshCw />`).
- Timestamp da última categorização no tooltip de informação.

---

### 4.6 ConversationSentiment — Análise de Sentimento
**Arquivo:** `src/components/chat/details/ConversationSentiment.tsx`

Exibe o sentimento atual da conversa (positivo / neutro / negativo) com ícone e cor semântica. Atualiza em tempo real após cada nova mensagem. Também exibido no `SentimentCard` no cabeçalho do chat.

---

## 5. Componentes de Atribuição de Agentes

### 5.1 AssignAgentDialog — Atribuição e Transferência Manual
**Arquivo:** `src/components/conversations/AssignAgentDialog.tsx`

Dialog unificado para dois casos (`isTransfer: boolean`):

**Modo Atribuição:**
- Lista todos os agentes disponíveis (exceto o atribuído atual).
- Cada item mostra: Avatar + iniciais, nome, dot de status (online/away/busy), badge de papel (Admin/Supervisor/Agente), contagem de conversas ativas.
- Seleção visualmente marcada com `border-primary bg-primary/5`.

**Modo Transferência:**
- Mesmo seletor de agentes.
- Campo adicional de texto livre: "Motivo da transferência (opcional)".

Ambos os modos confirmam com um único botão "Confirmar" que fica desabilitado até selecionar agente.

---

### 5.2 AssignmentRulesManager — Regras Automáticas
**Arquivos:** `AssignmentRulesManager.tsx`, `AssignmentRuleCard.tsx`, `AssignmentRuleDialog.tsx`

Sistema de regras configuráveis por instância com dois modos:

**Atribuição Fixa:**
- Toda conversa da instância vai para um agente específico.

**Round-Robin:**
- Conversas distribuídas em rodízio entre N agentes selecionados.
- Os agentes participantes são listados como badges no card.

Cada regra tem:
- `is_active` com `<Switch />` para ativar/desativar sem excluir.
- CRUD completo (criar, editar, excluir com confirmação).
- Indicação visual de status (badge "Ativa" / "Inativa").

---

### 5.3 QueueIndicator — Visualização da Fila
**Arquivo:** `src/components/conversations/QueueIndicator.tsx`

Indicador numérico de conversas aguardando atribuição. Exibido na sidebar de conversas. Clicável para filtrar a lista por conversas em fila.

---

## 6. Componentes de Notas Internas

### 6.1 ConversationNotes
**Arquivo:** `src/components/chat/details/ConversationNotes.tsx`

Painel de observações por conversa com operações completas:

**Criar:** formulário inline (não modal) com `<Textarea autoFocus>` que aparece ao clicar em "Adicionar". Confirmação por botão "Salvar" ou cancelamento com "Cancelar".

**Visualizar:** lista em `<ScrollArea className="max-h-[300px]">`. Header exibe contagem `Observações (N)`.

**Fixar:** botão `<Pin />` / `<PinOff />` por nota. Notas fixadas têm estilo visual diferenciado: `border-primary/50 bg-primary/5`.

**Editar:** modo inline — o conteúdo do card é substituído por `<Textarea>` com os botões salvar/cancelar.

**Excluir:** via `<AlertDialog>` com confirmação.

**Metadados:** cada nota exibe timestamp de criação formatado (`dd/MM/yyyy 'às' HH:mm`).

**Ordenação implícita:** notas fixadas aparecem primeiro (pela query).

---

## 7. Componentes de Relatórios

### 7.1 Estrutura da Página de Relatórios
**Arquivo:** `src/pages/WhatsAppRelatorio.tsx`

Organização em seções sequenciais com grid responsivo:

```
Header (título + botão voltar)
    │
ReportToolbar (filtros + exportar CSV)
    │
MetricsGrid — Conversas (5 colunas lg)
    │
MetricsGrid — Mensagens (4 colunas lg)
    │
MetricsGrid — Operacional (4 colunas lg)
    │
ChartsGrid — 2 colunas md:
  ├── Evolução no Período (LineChart inline)
  ├── MessageFlowChart
  ├── StatusDistributionChart
  ├── SentimentDistributionChart
  ├── TopicsDistributionChart
  ├── MessageTypeChart
  ├── HourlyActivityChart
  └── WeekdayActivityChart
    │
InstanceComparisonChart (full-width, só sem filtro de instância)
    │
AgentPerformanceChart (full-width)
    │
TopContactsChart (full-width)
    │
LongestConversationsTable
```

---

### 7.2 ReportToolbar
**Arquivo:** `src/components/reports/ReportToolbar.tsx`

Barra de ferramentas com layout flex:
- **Esquerda (`flex-1`):** slot `extra` para filtros (DateRange, Instance, Agent).
- **Direita:** botão "Exportar CSV" fixo com `<Download />` e `exportToCSV()`.

Botão desabilitado quando `rowsForExport.length === 0`.

---

### 7.3 Filtros de Relatório
Três filtros independentes e combináveis:

| Componente | Tipo | Opções |
|---|---|---|
| `DateRangeFilter` | Select + DatePicker | Hoje, Ontem, 7 dias, 30 dias, Personalizado |
| `InstanceFilter` | Select | Lista de instâncias configuradas |
| `AgentFilter` | Select | Lista de agentes da equipe |

O período selecionado gera label legível que compõe o nome do arquivo exportado.

---

### 7.4 Gráficos (todos Recharts)

| Componente | Tipo de Gráfico | Dados |
|---|---|---|
| `StatusDistributionChart` | PieChart | status × count × percentage |
| `SentimentDistributionChart` | PieChart | sentiment × count |
| `AgentPerformanceChart` | BarChart horizontal | agente × total × fechadas × TMR |
| `HourlyActivityChart` | BarChart | hora × count |
| `WeekdayActivityChart` | BarChart | dia da semana × count |
| `MessageFlowChart` | LineChart/AreaChart | data × enviadas × recebidas |
| `MessageTypeChart` | PieChart/BarChart | tipo × count |
| `InstanceComparisonChart` | BarChart agrupado | instância × métricas |
| `TopContactsChart` | BarChart horizontal | contato × count |
| `TopicsDistributionChart` | BarChart | tópico × count |

Todos os gráficos:
- Mostram estado vazio com `<div className="flex items-center justify-center h-[300px]">` quando `data.length === 0`.
- Usam `hsl(var(--chart-N))` para cores, garantindo suporte a temas.
- Tooltip com `contentStyle` usando tokens CSS do shadcn.

---

### 7.5 LongestConversationsTable
Tabela `<Table>` shadcn com: contato, agente, duração, status, data de abertura. Sem paginação — exibe top N conversas mais longas do período.

---

### 7.6 Skeleton de Carregamento
**Arquivos:** `MetricsGridSkeleton.tsx`, `ChartsGridSkeleton.tsx`

Skeletons replicam exatamente o grid de cards e gráficos para zero layout shift durante o carregamento inicial.

---

## Mapa de Correspondência com a Central de Atendimento Pulsar

| Componente da Referência | Aplicabilidade no Pulsar |
|---|---|
| Layout 3 colunas resizable | Tela principal de atendimento |
| `QuickFilterPills` | Filtros rápidos de fila/status |
| `ConversationDetailsSidebar` | Painel lateral de contexto do paciente/conversa |
| `ConversationNotes` | Notas internas do atendente por atendimento |
| `ConversationSummaries` | Resumo IA do atendimento gerado sob demanda |
| `ConversationTopics` | Classificação automática do assunto do contato |
| `ConversationSentiment` | Termômetro da conversa em tempo real |
| `AIComposerButton` | Assistente de redação para operadores |
| `SmartReplySuggestions` | Sugestões contextuais de resposta |
| `AssignAgentDialog` | Modal de atribuição/transferência de atendimento |
| `AssignmentRulesManager` | Regras automáticas de distribuição de fila |
| `MetricCard` | KPI cards do painel de relatórios |
| `ReportToolbar` | Barra de filtros + exportação CSV |
| Conjunto de gráficos Recharts | Visualizações do painel de relatórios |
| `MacrosManager` + `MacroDialog` | Respostas rápidas pré-configuradas |
| `DisconnectedInstancesBanner` | Banner de alerta de estado sistêmico |
| Tab navigation com URL state | Configurações da central por área |

---

## Observações Finais

1. **Modelagem de dados não foi analisada.** Toda referência a tipos e interfaces neste documento é descritiva dos contratos de UI, não prescritiva para o banco de dados do Pulsar.

2. **Dois padrões de IA se destacam para adoção imediata:** o `AIComposerButton` (transformação de texto sob demanda) e o `ConversationSummaries` (resumo estruturado com pontos-chave e próximos passos). Ambos são desacoplados do canal de comunicação.

3. **O sistema de notas internas** (`ConversationNotes`) é o mais simples de portar — não depende de nenhuma lógica de canal e pode ser adaptado a qualquer entidade que precise de observações por operador.

4. **O padrão de atribuição** (manual + round-robin + fixed) cobre os principais cenários de distribuição de carga entre atendentes com UX operacional madura.
