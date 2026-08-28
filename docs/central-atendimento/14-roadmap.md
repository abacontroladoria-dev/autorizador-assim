# Central de Atendimento Pulsar — Roadmap de Implementação

> Documento: Roadmap
> Versão: 1.0
> Status: Planejamento Oficial
>
> Este documento define a estratégia de implementação da Central de Atendimento do Pulsar, incluindo entregas, dependências, prioridades e critérios de aceite.

---

# 1. Objetivo

Implementar a Central de Atendimento como um módulo estratégico do Pulsar.

O roadmap foi estruturado para:

* Gerar valor rapidamente
* Minimizar retrabalho
* Permitir evolução incremental
* Validar hipóteses operacionais
* Preparar o produto para SaaS

---

# 2. Estratégia de Entrega

A implementação seguirá o princípio:

```text id="w6zycn"
Infraestrutura
↓
Operação
↓
Integração
↓
IA
↓
Escalabilidade
```

---

# 3. Fases

```text id="bb7h8m"
Fase 0 - Arquitetura

Fase 1 - Fundação

Fase 2 - Canais

Fase 3 - Workspace

Fase 4 - Contexto

Fase 5 - IA

Fase 6 - WABA

Fase 7 - SaaS

Fase 8 - Campanhas

Fase 9 - Omnichannel
```

---

# FASE 0 — Arquitetura

## Objetivo

Concluir documentação e validações arquiteturais.

---

## Entregáveis

Documentos:

```text id="h88yyx"
01-product-vision

02-business-rules

03-user-roles-and-permissions

04-data-model

05-provider-architecture

06-evolution-provider

07-meta-waba-provider

08-ai-assistant

09-audio-transcription

10-contact-resolution

11-ui-ux-specification

12-notifications

13-audit-and-compliance

14-roadmap
```

---

## Critério de Aceite

```text id="gpnw6s"
Arquitetura aprovada
```

---

# FASE 1 — Fundação

## Objetivo

Criar toda a estrutura de banco e backend.

---

## Entregáveis

Tabelas:

```text id="zzq8ut"
organizations

inboxes

channels

channel_connections

contacts

contact_identifiers

contact_patient_links

conversations

messages

message_attachments

conversation_notes

conversation_events

notifications

permissions

ai_interactions
```

---

## Backend

Criar:

```text id="ev9z2q"
ConversationService

ContactResolutionService

NotificationService

ProviderFactory
```

---

## Critério de Aceite

```text id="9ml5aj"
Banco funcional
APIs básicas disponíveis
```

---

# FASE 2 — Evolution API

## Objetivo

Disponibilizar primeiros canais operacionais.

---

## Infraestrutura

Servidor:

```text id="sx34tq"
VPS OCI
```

---

## Componentes

```text id="ln8e4f"
Evolution API

Redis

Webhook Endpoint
```

---

## Entregáveis

Criar:

```text id="1p0d3i"
EvolutionProvider

Webhook Processor

Provider Logs
```

---

## Funcionalidades

```text id="h9js6r"
Conectar QR

Receber mensagens

Enviar mensagens

Receber mídia
```

---

## Critério de Aceite

```text id="b52m6o"
Conversa funcional via Evolution
```

---

# FASE 3 — Workspace

## Objetivo

Criar a experiência premium.

---

## Layout

Implementar:

```text id="6z7gdt"
Sem sidebar

Tela full-width

Layout 3 colunas
```

---

## Colunas

```text id="lxhn6j"
Conversas

Chat

Contexto
```

---

## Funcionalidades

```text id="k8m3a1"
Lista conversas

Chat realtime

Upload arquivos

Notas internas

Transferência

Assumir conversa
```

---

## Critério de Aceite

```text id="s09o5v"
Operador consegue trabalhar integralmente no módulo
```

---

# FASE 4 — Context Engine

## Objetivo

Criar o principal diferencial do produto.

---

## Contact Resolution

Implementar:

```text id="cysx3z"
ContactResolutionService
```

---

## Context Profiles

Suportar:

```text id="q2rq9r"
guardian

patient

therapist

physician

lead

supplier

employee
```

---

## Context Widgets

Implementar:

```text id="cf31t2"
PatientWidget

AgendaWidget

FinanceiroWidget

AuthorizationWidget

TherapistWidget

LeadWidget
```

---

## Critério de Aceite

```text id="0h5uxw"
Painel contextual funcional
```

---

# FASE 5 — IA Assistiva

## Objetivo

Adicionar produtividade operacional.

---

## Implementar

```text id="r3v0p9"
Sugestões

Resumos

Classificação

Sentimento

Smart Replies
```

---

## Modos

```text id="v34wlc"
OFF

ASSISTED
```

---

## Critério de Aceite

```text id="xjwglt"
IA auxiliando operadores
```

---

# FASE 6 — IA Autônoma

## Objetivo

Automatizar atendimentos simples.

---

## Implementar

```text id="t4k7z6"
AUTONOMOUS

Respostas automáticas

Escalonamento humano
```

---

## Integrações

```text id="4m35gj"
Agenda

Financeiro

Autorizações
```

---

## Critério de Aceite

```text id="ch4r3q"
IA resolve demandas simples
```

---

# FASE 7 — Meta WABA

## Objetivo

Disponibilizar canal oficial.

---

## Implementar

```text id="dr6m4n"
MetaWabaProvider
```

---

## Funcionalidades

```text id="jl4m1s"
Receber mensagens

Enviar mensagens

Templates

Status entrega
```

---

## Critério de Aceite

```text id="1k5dxe"
Recepção operando pela WABA
```

---

# FASE 8 — Governança e Compliance

## Objetivo

Consolidar ambiente corporativo.

---

## Implementar

```text id="rq8p1s"
Auditoria completa

Dashboard compliance

Logs avançados

Métricas
```

---

## Critério de Aceite

```text id="b7r5m2"
Operação auditável ponta a ponta
```

---

# FASE 9 — SaaS Readiness

## Objetivo

Preparar comercialização.

---

## Implementar

```text id="r2v8m4"
Onboarding

Multiempresa

Planos

Limites

Billing
```

---

## Critério de Aceite

```text id="n4w1c6"
Primeira clínica externa onboardada
```

---

# FASE 10 — Campanhas

## Objetivo

Expandir para Marketing e RP.

---

## Funcionalidades

```text id="s8p6m1"
Campanhas

Segmentação

Disparos

Templates

Funis
```

---

## Canais

```text id="a3r9k7"
Evolution

WABA
```

---

## Critério de Aceite

```text id="g6t2q5"
Campanhas operacionais
```

---

# FASE 11 — Omnichannel

## Objetivo

Expandir além do WhatsApp.

---

## Implementar

```text id="n9x3v2"
Instagram

Facebook Messenger

Web Chat
```

---

## Critério de Aceite

```text id="u7m4z8"
Múltiplos canais compartilhando a mesma conversa
```

---

# Priorização Técnica

Ordem recomendada:

```text id="y3p7q1"
1. Banco

2. Backend

3. Evolution

4. Workspace

5. Context Engine

6. IA Assistiva

7. IA Autônoma

8. WABA

9. SaaS

10. Campanhas

11. Omnichannel
```

---

# MVP Real

O MVP da Central de Atendimento é:

```text id="f5n2r6"
Evolution

Workspace

Conversas

Notas

Transferência

Contexto

IA Assistiva
```

---

Não inclui:

```text id="m8v1k4"
Instagram

Campanhas

Broadcast

Chatbot complexo

Múltiplos agentes IA
```

---

# Indicadores de Sucesso

Operacionais:

```text id="z6r3t8"
Tempo Resposta

SLA

Conversas Ativas

Transferências
```

---

IA:

```text id="x2c9m5"
Sugestões Aceitas

Conversas Automatizadas

Economia Operacional
```

---

Negócio:

```text id="p4j8n1"
Usuários Ativos

Canais Conectados

Clínicas Atendidas

Receita SaaS
```

---

# Decisões Estratégicas

Consideradas definitivas:

✅ Workspace próprio

✅ Inbox → Channel → Conversation → Message

✅ Evolution + WABA

✅ Context Profiles

✅ IA nativa

✅ Multiempresa

✅ Auditoria completa

✅ Omnichannel

✅ Produto SaaS

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
