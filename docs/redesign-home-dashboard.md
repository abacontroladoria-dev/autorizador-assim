# Redesign Home - Central Operacional Clínica

## Objetivo

Transformar a Home do sistema em um dashboard operacional moderno, leve e profissional, focado em operação clínica ABA.

O sistema não é mais apenas um autorizador.
Agora ele deve transmitir:

- operação em tempo real
- organização
- produtividade
- visão geral clínica
- experiência SaaS moderna
- leveza visual

---

# Direção visual

## Referências

Inspirar-se em:

- Linear
- Notion
- Supabase Dashboard
- Vercel
- dashboards SaaS modernos

Misturando:

- visual clean
- aspecto clínico leve
- cards suaves
- cores pastel
- bastante espaço em branco

---

# Layout geral

## Estrutura principal

A Home deve possuir:

1. Header operacional
2. Cards KPI
3. Ações rápidas
4. Gráfico operacional
5. Últimos registros

---

# Estilo visual

## Background

Substituir fundo cinza chapado por gradiente suave.

Exemplo:

```css
background: linear-gradient(
  180deg,
  #f8fbff 0%,
  #f3f7fc 100%
);
```

---

# Sidebar

## Objetivo

Modernizar o menu lateral mantendo simplicidade.

## Alterações

- bordas mais arredondadas
- hover moderno
- ícones maiores
- melhor espaçamento
- categorias visuais

## Estrutura

ATENDIMENTO

- Home
- Nova Solicitação
- Controle de Pacientes
- Controle de Terapeutas

PROCESSOS

- Guias Digitais
- Auditoria ASSIM

SISTEMA

- Admin

## Visual

- botão ativo azul moderno
- hover com fundo suave
- transições suaves
- borda radius moderna

---

# Header principal

## Remover

- botão "Iniciar Atendimentos"

## Novo conteúdo

Título:

"Central Operacional Clínica"

Subtítulo:

"Monitoramento diário das unidades"

Adicionar:

- data atual
- status operacional pequeno

Exemplo:

🟢 Sistema operacional

---

# Cards KPI

Criar dois cards principais.

---

## Card 1

### Título

Atendimentos previstos hoje

### Valor principal

128

### Subinformações

- Realengo — 45
- Fazendinha — 38
- Padre Miguel — 45

### Visual

- ícone clínico
- card branco
- sombra suave
- radius grande
- número principal em destaque

---

## Card 2

### Título

Terapeutas em atendimento

### Valor principal

42

### Subinformações

- Realengo — 12
- Fazendinha — 15
- Padre Miguel — 15

---

# Quick Actions

## Objetivo

Criar acessos rápidos modernos.

## Botões

1. Nova Solicitação
2. Pacientes
3. Guias Digitais
4. Auditoria ASSIM

## Visual

- cards clicáveis
- borda moderna
- ícones grandes
- hover animado
- micro interação ao passar mouse
- descrição pequena abaixo do título

Exemplo:

Nova Solicitação
"Iniciar uma nova solicitação"

---

# Gráfico operacional

## Objetivo

Mostrar movimentação diária.

## Tipo

Gráfico de barras simples.

## Informações

- Realengo
- Fazendinha
- Padre Miguel

## Estilo

- minimalista
- sem excesso visual
- tons pastel
- responsivo

Pode usar:

- Recharts
- Chart.js
- ApexCharts

---

# Últimos registros

## Objetivo

Mostrar atividade recente do sistema.

## Exemplo

- Maria Silva — Guia emitida
- João Pedro — Atendimento iniciado
- Ana Souza — Solicitação criada

## Visual

- lista limpa
- badges de status
- horário
- ícone pequeno

---

# Responsividade

A Home precisa funcionar perfeitamente no mobile.

## Mobile

- cards empilhados
- quick actions em grid
- sidebar recolhível
- gráfico simplificado

---

# Restrições importantes

## NÃO adicionar

- excesso de widgets
- visual hospitalar antigo
- tabelas gigantes
- excesso de cores
- poluição visual

## O sistema deve parecer

- moderno
- clean
- premium
- leve
- confiável
- clínico
- operacional

---

# Tecnologias

O sistema utiliza frontend estático.

Preferências:

- React
- TailwindCSS
- componentes reutilizáveis
- animações leves
- sem dependência pesada

---

# Micro interações

Adicionar:

- hover suave
- transições
- animações discretas
- elevação leve em cards

Sem exageros.

---

# Resultado esperado

A Home deve parecer um sistema SaaS clínico moderno e comercializável.
