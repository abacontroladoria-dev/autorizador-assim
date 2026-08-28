# Central de Atendimento Pulsar — Notificações e Tempo Real

> Documento: Notifications
> Versão: 1.0
> Status: Referência oficial de notificações, alertas e eventos em tempo real
>
> Este documento define a arquitetura de notificações da Central de Atendimento do Pulsar.

---

# 1. Objetivo

Garantir que operadores, supervisores, diretores e administradores sejam informados em tempo real sobre eventos relevantes da operação.

Objetivos:

* Reduzir tempo de resposta
* Evitar mensagens sem atendimento
* Melhorar SLA
* Melhorar produtividade
* Reduzir perda de conversas
* Aumentar percepção operacional

---

# 2. Princípios Fundamentais

As notificações devem ser:

```text
Relevantes

Contextuais

Não Intrusivas

Configuráveis

Auditáveis
```

---

# 3. Arquitetura

Fluxo:

```text
Evento
↓
Notification Engine
↓
Rules Engine
↓
Destinatários
↓
Entrega
```

---

# 4. Notification Engine

Criar serviço dedicado:

```text
NotificationService
```

Responsável por:

* Gerar notificações
* Distribuir notificações
* Aplicar regras
* Controlar preferências
* Registrar histórico

---

# 5. Canais de Notificação

V1:

```text
Badge

Toast

Som
```

---

Futuro:

```text
Push Browser

Email

WhatsApp

Mobile Push
```

---

# 6. Eventos Notificáveis

Eventos suportados:

```text
Nova Mensagem

Conversa Atribuída

Conversa Transferida

Menção

SLA Próximo

SLA Violado

Canal Desconectado

Erro Provider

IA Escalonou Atendimento

Falha de Envio

Nova Nota Interna
```

---

# 7. Nova Mensagem

Quando uma nova mensagem chegar:

```text
Contato
↓
Mensagem
↓
Notificação
```

---

Destinatários:

* Operador responsável
* Supervisores da Inbox

---

# 8. Conversa Não Atribuída

Caso:

```text
assigned_user_id = null
```

Nova mensagem deve notificar:

* Todos operadores da Inbox
* Supervisores

---

# 9. Conversa Atribuída

Caso:

```text
assigned_user_id != null
```

Nova mensagem deve notificar:

* Operador responsável
* Supervisores

---

# 10. Transferência

Exemplo:

```text
Recepção
↓
Financeiro
```

---

Notificar:

* Operador destino
* Supervisores destino

---

# 11. Menções

Suportar:

```text
@usuario
```

---

Exemplo:

```text
@joao verificar autorização
```

---

Destinatário:

```text
João
```

Recebe notificação imediata.

---

# 12. SLA Próximo

Quando atingir:

```text
80%
```

do prazo.

---

Exibir:

```text
🟡 SLA próximo do limite
```

---

# 13. SLA Violado

Quando ultrapassar prazo:

```text
🔴 SLA violado
```

---

Prioridade máxima.

---

# 14. Canal Desconectado

Exemplo:

```text
Evolution
↓
DISCONNECTED
```

---

Notificar:

* Admin
* Operador Especial

---

# 15. Falha de Envio

Exemplo:

```text
Mensagem
↓
Erro Provider
```

---

Notificar:

* Operador responsável
* Supervisor

---

# 16. Escalonamento IA

Quando a IA não conseguir resolver.

Fluxo:

```text
IA
↓
Escalonamento
↓
Humano
```

---

Notificar operador.

---

# 17. Notas Internas

Quando houver menção.

Exemplo:

```text
@financeiro verificar cobrança
```

---

Gerar notificação.

---

# 18. Tipos de Notificação

## Badge

Indicador persistente.

Exemplo:

```text
🔴 5
```

---

## Toast

Mensagem temporária.

Exemplo:

```text
Nova mensagem

Maria Silva
```

---

## Som

Alerta sonoro.

Exemplo:

```text
ding.wav
```

---

# 19. Prioridades

```text
LOW

MEDIUM

HIGH

CRITICAL
```

---

# 20. Regras de Prioridade

## LOW

* Nota criada
* Atualização menor

---

## MEDIUM

* Nova mensagem

---

## HIGH

* Conversa transferida
* Menção

---

## CRITICAL

* SLA violado
* Canal desconectado
* Falha Provider

---

# 21. Horário de Trabalho

Preparação futura.

Permitir:

```text
Horário Comercial

Plantão

24x7
```

---

# 22. Silenciamento

Usuário pode silenciar:

```text
Inbox

Conversa

Tipo de Evento
```

---

Limitações:

Eventos críticos não podem ser silenciados.

---

# 23. Preferências do Usuário

Criar configurações:

```text
Som

Toast

Badge

Volume

Eventos
```

---

# 24. Notificações por Inbox

Configuração independente.

Exemplo:

```text
Recepção
Som Ativado

Marketing
Som Desativado
```

---

# 25. Real Time

Tecnologia recomendada:

```text
Supabase Realtime
```

---

Eventos:

```text
messages

conversations

notes

events
```

---

# 26. Tempo de Atualização

Objetivo:

```text
< 1 segundo
```

entre recebimento e exibição.

---

# 27. Presença

Preparação futura.

Exibir:

```text
Online

Ausente

Offline
```

---

# 28. Indicador de Digitação

Preparação futura.

Exibir:

```text
Digitando...
```

---

# 29. Indicador de Leitura

Exibir:

```text
Enviado

Entregue

Lido
```

---

Compatível com:

```text
WABA

Evolution
```

---

# 30. Central de Notificações

Criar painel dedicado.

---

Exemplo:

```text
🔔 Notificações
```

---

Exibir:

```text
Não lidas

Hoje

Esta semana
```

---

# 31. Histórico

Registrar:

```text
Quem recebeu

Quando recebeu

Quando visualizou
```

---

# 32. Persistência

Criar tabela:

```sql
notifications

id uuid pk

organization_id uuid

user_id uuid

type text

priority text

title text

body text

payload jsonb

read_at timestamptz

created_at timestamptz
```

---

# 33. Auditoria

Registrar:

```text
Notificação criada

Notificação lida

Notificação descartada
```

---

# 34. Dashboard Operacional

Indicadores:

```text
Mensagens Não Lidas

Conversas Sem Responsável

SLA Próximo

SLA Violado

Canais Offline
```

---

# 35. Integração com IA

A IA pode gerar notificações.

Exemplo:

```text
Possível risco de evasão identificado
```

---

Ou:

```text
Responsável demonstrou insatisfação
```

---

# 36. Roadmap Futuro

Evoluções previstas:

```text
Push Browser

Push Mobile

Email

WhatsApp

Microsoft Teams

Slack
```

---

# 37. Decisões Arquiteturais

Consideradas definitivas:

✅ Notification Engine dedicado

✅ Tempo real via Supabase Realtime

✅ Badge + Toast + Som

✅ SLA como evento notificável

✅ Canal desconectado como evento crítico

✅ Menções internas

✅ Histórico de notificações

✅ Notificações por Inbox

✅ Integração com IA

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
