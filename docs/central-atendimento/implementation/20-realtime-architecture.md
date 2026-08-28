# Central de Atendimento Pulsar — Arquitetura Realtime

> Documento: Realtime Architecture
> Versão: 1.0
> Status: Referência oficial de comunicação em tempo real
>
> Este documento define a arquitetura realtime da Central de Atendimento utilizando Supabase Realtime, Presence, Broadcast e sincronização distribuída.

---

# 1. Objetivo

Garantir atualização instantânea da interface sem refresh.

Objetivos:

- Novas mensagens em tempo real
- Atualização de conversas
- Notificações instantâneas
- Presença de usuários
- Indicador de digitação
- Atualização de SLA
- Sincronização multiusuário

---

# 2. Princípio Fundamental

A Central de Atendimento deve se comportar como:

```text
WhatsApp Web
+
Slack
+
Kommo
```

Sem necessidade de reload.

---

# 3. Stack

Tecnologia oficial:

```text
Supabase Realtime
```

Recursos:

```text
Postgres Changes

Presence

Broadcast
```

---

# 4. Arquitetura

```text
Mensagem
↓
Provider
↓
Webhook
↓
Banco
↓
Supabase Realtime
↓
Frontend
```

---

# 5. Eventos Realtime

V1:

```text
messages

conversations

notifications

conversation_notes

channels
```

---

# 6. Realtime Service

Criar serviço único.

```typescript
RealtimeService
```

---

Responsável por:

```text
Subscriptions

Presence

Broadcast

Reconnect
```

---

# 7. Estrutura

```text
src

modules

└── atendimento
    │
    ├── realtime
    │   ├── realtime.service.ts
    │   ├── channels.ts
    │   ├── presence.ts
    │   └── broadcast.ts
```

---

# 8. Regra Principal

Nunca criar subscriptions diretamente em componentes.

---

Errado:

```typescript
useEffect(() => {
  supabase.channel(...)
})
```

---

Correto:

```typescript
RealtimeService
```

↓

```typescript
Hook
```

↓

```typescript
Componente
```

---

# 9. Canais Realtime

Criar canais dedicados.

---

# 10. Conversation Channel

Formato:

```text
conversation:{id}
```

---

Exemplo:

```text
conversation:abc123
```

---

Eventos:

```text
message.created

message.updated

message.read
```

---

# 11. Inbox Channel

Formato:

```text
inbox:{id}
```

---

Exemplo:

```text
inbox:recepcao-realengo
```

---

Eventos:

```text
conversation.created

conversation.updated

conversation.transferred
```

---

# 12. Notification Channel

Formato:

```text
notifications:{user_id}
```

---

Exemplo:

```text
notifications:user123
```

---

Eventos:

```text
notification.created

notification.read
```

---

# 13. Provider Channel

Formato:

```text
provider:{channel_id}
```

---

Eventos:

```text
channel.connected

channel.disconnected

channel.reconnecting
```

---

# 14. Presence

Permite saber quem está online.

---

Status:

```text
online

away

offline
```

---

# 15. Presence Payload

```typescript
{
  userId: string
  userName: string
  inboxId: string
  status: string
}
```

---

# 16. Indicador Online

Exibir:

```text
🟢 Online

🟡 Ausente

⚫ Offline
```

---

# 17. Typing Indicator

Preparação para V1.1

---

Fluxo:

```text
Digitando
↓
Broadcast
↓
Outros usuários
```

---

Evento:

```text
typing.start
```

---

```text
typing.stop
```

---

# 18. Broadcast

Utilizar para:

```text
Typing

Presence

Eventos efêmeros
```

---

Não utilizar para:

```text
Mensagens

Conversas

Notas
```

Esses vêm do banco.

---

# 19. Postgres Changes

Utilizar para:

```text
messages

conversations

notifications

conversation_notes
```

---

# 20. Subscription Messages

```typescript
messages
```

Eventos:

```text
INSERT

UPDATE
```

---

# 21. Subscription Conversations

```typescript
conversations
```

Eventos:

```text
INSERT

UPDATE
```

---

# 22. Subscription Notes

```typescript
conversation_notes
```

Eventos:

```text
INSERT

UPDATE
```

---

# 23. Subscription Notifications

```typescript
notifications
```

Eventos:

```text
INSERT
```

---

# 24. Fluxo Nova Mensagem

```text
Contato
↓
Provider
↓
Webhook
↓
messages
↓
Realtime
↓
Chat
```

---

Tempo esperado:

```text
< 1 segundo
```

---

# 25. Fluxo Transferência

```text
Supervisor
↓
Transferir
↓
conversation.updated
↓
Realtime
↓
Lista atualizada
```

---

# 26. Fluxo Notificação

```text
Evento
↓
notifications
↓
Realtime
↓
Toast
```

---

# 27. Reconexão

Obrigatória.

---

Estados:

```text
connected

reconnecting

disconnected
```

---

# 28. Estratégia de Reconexão

```text
1s

2s

5s

10s

30s
```

---

Backoff exponencial.

---

# 29. Offline Mode

Quando perder conexão:

Exibir:

```text
Conexão perdida
```

---

Permitir:

```text
Visualização local
```

---

Bloquear:

```text
Envio mensagens
```

até reconectar.

---

# 30. Heartbeat

Executar heartbeat.

---

Intervalo:

```text
30 segundos
```

---

Objetivo:

```text
Detectar desconexão
```

---

# 31. Controle de Assinaturas

Ao trocar conversa:

```text
unsubscribe
```

↓

```text
subscribe nova conversa
```

---

Evitar:

```text
Memory Leak
```

---

# 32. Múltiplas Abas

Preparação futura.

---

Estratégia:

```text
BroadcastChannel API
```

---

Objetivo:

```text
Sincronizar abas
```

---

# 33. Performance

Nunca atualizar:

```text
Toda lista
```

---

Atualizar:

```text
Item alterado
```

---

# 34. Ordenação

Nova mensagem:

```text
Atualiza conversa

Move para topo
```

---

Sem recarregar lista inteira.

---

# 35. Realtime e IA

Quando IA responder:

```text
Mensagem IA
↓
messages
↓
Realtime
↓
Operador
```

---

Mesmo fluxo das mensagens humanas.

---

# 36. Realtime e SLA

Evento:

```text
sla.warning

sla.violated
```

---

Atualizar:

```text
Badge

Indicador visual
```

---

# 37. Segurança

Toda subscription deve respeitar:

```text
RLS
```

---

Nunca confiar no frontend.

---

# 38. Multiempresa

Garantido por:

```text
organization_id
```

---

Nenhum canal pode vazar dados entre organizações.

---

# 39. Monitoramento

Monitorar:

```text
Conexões

Desconexões

Reconexões

Latência

Falhas
```

---

# 40. Métricas

Indicadores:

```text
Usuários online

Tempo médio conexão

Reconexões

Mensagens realtime

Latência média
```

---

# 41. Logs

Registrar:

```text
Connection Open

Connection Closed

Reconnect

Subscription Error
```

---

# 42. Testes Obrigatórios

Validar:

```text
Nova mensagem

Transferência

Nota interna

Notificação

Reconexão

Troca conversa

Troca inbox
```

---

# 43. Critério de Aceite

Arquitetura realtime aprovada quando:

```text
Mensagens < 1s

Notificações < 1s

Sem refresh

Reconexão automática

Sem memory leaks

Presença funcionando
```

---

# 44. Decisões Arquiteturais

✅ Supabase Realtime

✅ Postgres Changes para dados persistidos

✅ Broadcast para eventos efêmeros

✅ Presence para usuários online

✅ Reconnect automático

✅ Canais separados por Inbox

✅ Segurança via RLS

✅ Latência alvo < 1s

A próxima etapa obrigatória será:

text
21-evolution-deployment.md
