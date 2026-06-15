# Backlog Oficial

## Objetivo

Este arquivo controla a implementação do Pulsar Atendimento.

O Claude deve sempre executar tarefas seguindo a ordem definida abaixo.

Não pular etapas.

Não implementar funcionalidades futuras antes do MVP estar concluído.

---

# FASE 1 — Fundação

Objetivo:

Criar a estrutura básica do módulo.

---

## T001

Criar rota:

```text
/atendimento
```

Status:

[ ]

---

## T002

Criar layout independente.

Requisitos:

* Sem sidebar
* Full screen
* Topbar própria

Status:

[ ]

---

## T003

Criar botão:

```text
Atendimento
```

na navegação principal do Pulsar.

Status:

[ ]

---

## T004

Criar botão:

```text
← Voltar ao Pulsar
```

na topbar.

Status:

[ ]

---

# FASE 2 — Interface

Objetivo:

Construir experiência estilo Kommo.

---

## T005

Criar layout 3 colunas.

Status:

[ ]

---

## T006

Criar coluna:

Conversas

Status:

[ ]

---

## T007

Criar coluna:

Chat

Status:

[ ]

---

## T008

Criar coluna:

Contexto

Status:

[ ]

---

## T009

Criar estado vazio.

Status:

[ ]

---

## T010

Criar busca de conversas.

Status:

[ ]

---

# FASE 3 — Banco

Objetivo:

Persistência de dados.

---

## T011

Criar tabela:

contacts

Status:

[ ]

---

## T012

Criar tabela:

conversations

Status:

[ ]

---

## T013

Criar tabela:

messages

Status:

[ ]

---

## T014

Criar tabela:

tags

Status:

[ ]

---

## T015

Criar tabela:

conversation_tags

Status:

[ ]

---

# FASE 4 — Realtime

Objetivo:

Atualizações em tempo real.

---

## T016

Criar canal realtime para mensagens.

Status:

[ ]

---

## T017

Atualizar lista de conversas automaticamente.

Status:

[ ]

---

## T018

Atualizar chat automaticamente.

Status:

[ ]

---

# FASE 5 — WhatsApp

Objetivo:

Integração com canal externo.

---

## T019

Criar interface:

MessagingProvider

Status:

[ ]

---

## T020

Criar provider:

EvolutionProvider

Status:

[ ]

---

## T021

Criar webhook de recebimento.

Status:

[ ]

---

## T022

Registrar mensagens recebidas.

Status:

[ ]

---

## T023

Enviar mensagens.

Status:

[ ]

---

# FASE 6 — CRM

Objetivo:

Adicionar contexto.

---

## T024

Associar contato ao paciente.

Status:

[ ]

---

## T025

Exibir responsável.

Status:

[ ]

---

## T026

Exibir paciente.

Status:

[ ]

---

## T027

Exibir terapeuta.

Status:

[ ]

---

## T028

Exibir agenda.

Status:

[ ]

---

## T029

Exibir financeiro.

Status:

[ ]

---

# FASE 7 — IA

Objetivo:

Automação.

---

## T030

Criar provider IA.

Status:

[ ]

---

## T031

Criar classificação de intenção.

Status:

[ ]

---

## T032

Criar sugestões ao operador.

Status:

[ ]

---

## T033

Criar resumo automático.

Status:

[ ]

---

## T034

Criar transferência IA → Humano.

Status:

[ ]

---

# FASE 8 — Produção

Objetivo:

Preparar operação real.

---

## T035

Criar MetaProvider.

Status:

[ ]

---

## T036

Criar configurações por empresa.

Status:

[ ]

---

## T037

Criar logs.

Status:

[ ]

---

## T038

Criar monitoramento.

Status:

[ ]

---

# Critério de MVP

O MVP é considerado concluído quando:

* T001 até T023 estiverem concluídas.

Qualquer funcionalidade após T023 é evolução.
