# Layout e UX

## Objetivo

Criar uma experiência de atendimento moderna, rápida e focada em produtividade.

A interface deve transmitir a sensação de uma Central de Atendimento profissional.

A conversa é o elemento principal da tela.

---

# Estrutura Geral

O layout será dividido em três colunas.

```text
┌──────────────┬───────────────────────┬─────────────────────┐
│ Conversas    │        Chat           │      Contexto       │
└──────────────┴───────────────────────┴─────────────────────┘
```

---

# Barra Superior

A barra superior deve ser minimalista.

Elementos:

* Voltar ao Pulsar
* Nome do módulo
* Busca Global
* Status WhatsApp
* Status IA
* Operador logado

Exemplo:

```text
← Pulsar            Atendimento

🔍 Buscar

🟢 WhatsApp Online
🤖 IA Ativa

Caio ▼
```

Altura aproximada:

64px

---

# Coluna 1 — Conversas

Largura:

20% a 25%

Responsabilidade:

Gerenciar conversas.

---

## Componentes

### Busca

Campo de busca fixo.

Permite localizar:

* Contatos
* Pacientes
* Telefones

---

### Filtros

Filtros rápidos:

* Todas
* Não lidas
* IA
* Humano
* Pendentes
* Finalizadas

---

### Lista de Conversas

Cada item deve exibir:

* Nome
* Última mensagem
* Horário
* Indicador de não lidas
* Status

Exemplo:

```text
Maria Silva

Gostaria de remarcar

14:32

🟢 IA
```

---

## Estados

### Conversa Não Lida

Badge vermelho.

### Conversa Ativa

Destacada.

### Conversa Encerrada

Visual reduzido.

---

# Coluna 2 — Chat

Largura:

50% a 60%

Esta é a área mais importante do sistema.

---

## Cabeçalho

Exibir:

* Nome
* Telefone
* Status

Exemplo:

```text
Maria Silva

🟢 Online
```

---

## Histórico

Mensagens devem utilizar estilo semelhante ao WhatsApp.

Mensagens do cliente:

Alinhadas à esquerda.

Mensagens da clínica:

Alinhadas à direita.

---

## Informações da Mensagem

Cada mensagem deve exibir:

* Horário
* Status de envio

---

## Campo de Digitação

Fixado na parte inferior.

Suportar:

* Texto
* Emoji
* Arquivos
* Áudio (futuro)

---

## Sugestões IA

Acima do campo de envio.

Exemplo:

```text
Sugestões

[ Confirmar ]
[ Remarcar ]
[ Transferir ]
```

---

# Coluna 3 — Contexto

Largura:

20% a 25%

Responsabilidade:

Apresentar informações relevantes da conversa.

---

## Navegação Interna

Utilizar abas.

Abas:

* Resumo
* Agenda
* Financeiro
* Histórico
* IA

---

# Aba Resumo

Exibir:

* Responsável
* Paciente
* Unidade
* Terapeuta
* Convênio
* Tags

---

# Aba Agenda

Exibir:

* Próximas sessões
* Últimos atendimentos

---

# Aba Financeiro

Exibir:

* Status
* Último pagamento
* Pendências

---

# Aba Histórico

Exibir:

* Eventos relevantes
* Ocorrências
* Remarcações
* Faltas

---

# Aba IA

Exibir:

* Status da IA
* Prompt utilizado
* Confiança
* Motivo da última decisão

---

# Estado Sem Conversa

Quando nenhuma conversa estiver selecionada.

Exibir:

```text
💬

Selecione uma conversa

ou

pesquise um contato
```

Centralizado na tela.

---

# Tema Visual

Estilo:

* Kommo
* Linear
* Notion Mail

Prioridades:

* Espaço em branco
* Tipografia limpa
* Bordas suaves
* Poucas cores

Evitar:

* Excesso de cards
* Muitas sombras
* Visual carregado

---

# Responsividade

Desktop é prioridade.

Largura mínima recomendada:

1440px

Não otimizar para mobile na primeira versão.
