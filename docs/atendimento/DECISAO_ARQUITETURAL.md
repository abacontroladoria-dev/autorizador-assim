# Decisões Arquiteturais

## Objetivo

Este documento registra decisões arquiteturais consideradas definitivas para o módulo Pulsar Atendimento.

Estas decisões devem ser respeitadas durante toda a implementação.

---

# DA-001

## O módulo Atendimento NÃO faz parte do Dashboard

O módulo Atendimento não será implementado dentro do layout principal do Dashboard.

Motivo:

A experiência de atendimento possui necessidades completamente diferentes do restante do sistema.

O foco deve estar na conversa.

---

# DA-002

## O módulo possui layout próprio

O módulo Atendimento terá seu próprio layout.

Estrutura:

/atendimento

Layout independente do Dashboard.

---

# DA-003

## Experiência Full Screen

Ao acessar o módulo Atendimento, o usuário deve entrar em uma experiência dedicada.

Objetivos:

* Máximo espaço útil
* Menos distrações
* Foco operacional
* Sensação de sistema especializado

---

# DA-004

## Não utilizar Sidebar

O módulo Atendimento não utilizará a sidebar principal do Pulsar.

Motivos:

* Economia de espaço
* Melhor aproveitamento horizontal
* Experiência semelhante ao Kommo

---

# DA-005

## Barra Superior Simplificada

O topo da aplicação deve conter apenas:

* Botão Voltar ao Pulsar
* Busca global
* Configurações
* Status do WhatsApp
* Informações do operador

Não utilizar menus complexos.

---

# DA-006

## Estrutura Principal em Três Colunas

O layout principal deve possuir três áreas:

### Coluna 1

Conversas

Responsável por:

* Lista de conversas
* Busca
* Filtros
* Status

---

### Coluna 2

Chat

Responsável por:

* Histórico
* Digitação
* Arquivos
* Mensagens

Esta é a área mais importante do sistema.

---

### Coluna 3

Contexto

Responsável por:

* Dados do cliente
* Dados do paciente
* Agenda
* Financeiro
* Histórico
* IA

---

# DA-007

## Conversa é o Centro da Aplicação

Toda decisão de UX deve responder à pergunta:

"Isso ajuda o usuário a conversar melhor?"

Se não ajudar, deve ser reconsiderado.

---

# DA-008

## Contexto Sem Troca de Tela

O atendente nunca deve precisar abrir outra tela para consultar:

* Paciente
* Responsável
* Agenda
* Financeiro

Tudo deve estar disponível no painel lateral.

---

# DA-009

## Design Inspirado em Kommo

Referências:

* Kommo
* Linear
* Notion Mail
* Slack

Não copiar interface.

Copiar princípios de usabilidade.

---

# DA-010

## Mobile Não é Prioridade Inicial

A primeira versão será otimizada para desktop.

O foco operacional é uso em recepção e setores administrativos.

Mobile será tratado em fase futura.
