# Integração WhatsApp

## Objetivo

Definir a arquitetura de comunicação entre o Pulsar Atendimento e os canais de mensageria.

O sistema deve ser desacoplado do fornecedor.

O Pulsar não deve depender diretamente da Meta, Evolution API ou qualquer outro provedor.

---

# Princípio Fundamental

O Pulsar conversa com um Provider.

O Provider conversa com o canal.

```text
Pulsar
   ↓
Provider
   ↓
WhatsApp
```

---

# Objetivos

Permitir:

* Troca de fornecedor
* Testes locais
* Ambientes de homologação
* Suporte futuro a múltiplos canais

---

# Arquitetura

```text
Pulsar Atendimento
        ↓
Messaging Provider
        ↓
Meta Provider
Evolution Provider
Future Providers
```

---

# Interface Base

Todos os providers devem implementar a mesma interface.

Exemplo conceitual:

```typescript
interface MessagingProvider {

  sendMessage()

  sendImage()

  sendDocument()

  markAsRead()

  getContact()

}
```

O restante do sistema nunca deve conhecer detalhes do fornecedor.

---

# Providers Suportados

## MetaProvider

Implementação oficial.

Utilizar:

WhatsApp Business Platform

Cloud API

Este será o provider padrão de produção.

---

## EvolutionProvider

Utilizado apenas para:

* Desenvolvimento
* Testes
* Homologação

Baseado em QR Code.

Não recomendado para produção.

---

# Webhooks

Todos os eventos recebidos devem ser convertidos para um formato interno.

Nunca salvar payloads externos diretamente.

---

# Evento Interno

Exemplo:

```json
{
  "channel": "whatsapp",
  "external_id": "abc123",
  "phone": "21999999999",
  "message": "Olá",
  "received_at": "2026-01-01T10:00:00"
}
```

---

# Fluxo de Recebimento

```text
WhatsApp
      ↓
Webhook
      ↓
Provider
      ↓
Pulsar
      ↓
Banco
```

---

# Fluxo de Envio

```text
Operador
      ↓
Pulsar
      ↓
Provider
      ↓
WhatsApp
```

---

# Status de Mensagens

O sistema deve suportar:

```text
sending
sent
delivered
read
failed
```

---

# Anexos

Suportar:

```text
text
image
audio
document
video
```

Mesmo que alguns tipos sejam implementados futuramente.

---

# Conexão por QR Code

Permitida apenas para:

* Desenvolvimento
* MVP
* Testes internos

Não utilizar como solução oficial para clientes.

---

# Produção

Produção deve utilizar:

Meta Cloud API

com número próprio da clínica.

---

# Multiempresa

Cada empresa poderá possuir:

* Número próprio
* Token próprio
* Configuração própria

Exemplo:

```text
Empresa A
└── WhatsApp A

Empresa B
└── WhatsApp B
```

---

# Boas Práticas

Nunca armazenar:

* Tokens em código
* Credenciais hardcoded

Sempre utilizar:

* Variáveis de ambiente
* Secrets do servidor

---

# Objetivo Futuro

O módulo deve permitir adicionar novos canais sem alterar a aplicação principal.

Exemplos:

* Instagram
* Telegram
* Facebook Messenger
* Web Chat

Todos utilizando a mesma arquitetura de providers.
