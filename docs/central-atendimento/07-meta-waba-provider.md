# Central de Atendimento Pulsar — Meta WABA Provider

> Documento: Meta WABA Provider
> Versão: 1.0
> Status: Referência oficial de integração
>
> Este documento define a arquitetura, regras operacionais e integração da WhatsApp Business Platform (Meta WABA) com a Central de Atendimento do Pulsar.

---

# 1. Objetivo

A Meta WABA será o provider oficial para canais críticos de atendimento.

Seu uso será priorizado para:

* Recepção
* Autorizações
* Financeiro
* Relacionamento com responsáveis
* Atendimento clínico
* Operações dependentes de SLA

---

# 2. Posicionamento Estratégico

A arquitetura da Central de Atendimento deve suportar simultaneamente:

```text
Meta WABA
+
Evolution API
```

Exemplo:

Recepção Realengo

```text
Meta WABA
```

Financeiro

```text
Meta WABA
```

Marketing

```text
Evolution
```

RP

```text
Evolution
```

---

# 3. Benefícios da WABA

A Meta WABA é considerada o provider corporativo principal do Pulsar.

Benefícios:

* API oficial da Meta
* Menor risco operacional
* Alta estabilidade
* Menor taxa de desconexão
* Escalabilidade empresarial
* Suporte a templates oficiais
* Webhooks oficiais
* Conformidade com políticas da Meta

---

# 4. Responsabilidades da WABA

A Meta WABA é responsável por:

* Receber mensagens
* Enviar mensagens
* Gerenciar templates
* Gerenciar status de entrega
* Gerenciar leitura
* Enviar webhooks

---

# 5. Responsabilidades do Pulsar

O Pulsar permanece responsável por:

* Conversas
* Contatos
* Auditoria
* IA
* Histórico
* Permissões
* Integração clínica
* Relatórios
* SLA

A WABA nunca será fonte de verdade.

---

# 6. Arquitetura

```text
Responsável
↓
WhatsApp
↓
Meta WABA
↓
Webhook
↓
Pulsar
↓
Central Atendimento
```

---

# 7. Criação de Canal

Ao criar um canal:

Campos obrigatórios:

```text
Nome
Inbox
Provider
Phone Number ID
```

Exemplo:

```text
Recepção Realengo

Provider:
Meta WABA
```

---

# 8. Estrutura de Canal

Exemplo:

```text
Inbox
│
└── Recepção Realengo
     │
     └── WhatsApp Oficial
```

---

# 9. Conexão

Diferente da Evolution:

```text
Não utiliza QR Code
```

O canal é configurado através de:

```text
Business Manager
↓
WhatsApp Business Account
↓
Phone Number ID
↓
Access Token
```

---

# 10. Credenciais

As credenciais nunca devem ser armazenadas no frontend.

Devem permanecer:

```text
Backend
Secrets
Environment Variables
```

---

# 11. Webhooks

Todos os eventos da WABA devem utilizar endpoint centralizado.

Exemplo:

```text
/api/webhooks/meta-waba
```

---

# 12. Fluxo de Recebimento

```text
Meta
↓
Webhook
↓
provider_webhook_logs
↓
Normalização
↓
Conversation Service
↓
Banco de Dados
```

---

# 13. provider_webhook_logs

Toda entrega da Meta deve ser armazenada.

Objetivos:

* Diagnóstico
* Reprocessamento
* Auditoria
* Troubleshooting

---

Fluxo:

```text
Recebe webhook
↓
Salva payload bruto
↓
processed = false
↓
Processa
↓
processed = true
```

---

# 14. Eventos Esperados

```text
message_received

message_sent

message_delivered

message_read

message_failed

message_deleted

media_received
```

---

# 15. Normalização

A WABA possui payload próprio.

Após recebimento:

```text
Payload Meta
↓
Normalização
↓
Evento Interno Pulsar
```

---

# 16. Conversas

A WABA não cria conversas diretamente.

Fluxo:

```text
Mensagem
↓
Webhook
↓
Conversation Service
↓
Criar ou localizar conversa
```

---

# 17. Contatos

Ao receber uma mensagem:

```text
Telefone
↓
Buscar contato
↓
Encontrado?
```

Se encontrado:

```text
Vincular
```

Se não encontrado:

```text
Criar contato provisório
```

---

# 18. Integração Clínica

Esta é a principal diferença da utilização da WABA no Pulsar.

Quando o contato for identificado como responsável:

Exibir:

```text
Pacientes

Agenda

Autorizações

Financeiro

Faltas

Pendências
```

---

# 19. Tipos de Mensagem

Suportados:

```text
Texto

Imagem

Documento

PDF

Áudio

Localização
```

---

# 20. Áudios

Fluxo:

```text
Áudio
↓
Download
↓
Storage
↓
Transcrição
↓
IA
```

---

# 21. Storage

A WABA não deve ser utilizada para armazenamento permanente.

Destino:

```text
Supabase Storage
```

Buckets:

```text
chat-images

chat-audio

chat-documents
```

---

# 22. Templates

A WABA suporta templates oficiais.

Exemplos:

```text
Lembrete de sessão

Confirmação de agendamento

Confirmação de autorização

Boas-vindas
```

---

# 23. Templates no Pulsar

A V1 não utilizará campanhas.

Porém o sistema deve nascer preparado para:

```text
Template Registry
```

---

Estrutura prevista:

```text
templates

template_versions

template_variables
```

---

# 24. Janela de Conversa

A Meta trabalha com janelas de atendimento.

A Central deve abstrair essa complexidade do operador.

O operador não precisa conhecer:

```text
24h Window

Template Rules
```

---

Essas regras ficam encapsuladas na camada Provider.

---

# 25. Envio de Mensagens

Fluxo:

```text
Operador
↓
Chat
↓
Conversation Service
↓
Meta WABA Provider
↓
WhatsApp
```

---

# 26. IA

Fluxo:

```text
IA
↓
Conversation Service
↓
Meta WABA Provider
↓
WhatsApp
```

A IA nunca interage diretamente com a API da Meta.

---

# 27. Modos de IA

Compatível com:

```text
OFF

ASSISTED

AUTONOMOUS
```

---

# 28. SLA

A WABA será considerada o provider prioritário para:

```text
Recepção

Financeiro

Autorizações
```

Por isso deve possuir monitoramento reforçado.

---

# 29. Monitoramento

Monitorar:

```text
Mensagens enviadas

Mensagens recebidas

Mensagens falhadas

Tempo resposta

Erros API

Taxa entrega

Taxa leitura
```

---

# 30. Auditoria

Registrar:

```text
Mensagem enviada

Mensagem recebida

Template enviado

Falha envio

Falha entrega

Leitura
```

---

# 31. Segurança

Toda integração deve respeitar:

```text
Princípio do Menor Privilégio
```

Tokens devem possuir apenas os escopos necessários.

---

# 32. Dashboard Operacional

Cada canal WABA deve exibir:

```text
Status

Número

Mensagens hoje

Conversas ativas

Taxa entrega

Taxa leitura

Falhas
```

---

# 33. Estratégia de Escalabilidade

A adição de novos números WABA não deve exigir alterações estruturais.

Exemplo:

```text
Recepção Realengo
├── Número Oficial 1
├── Número Oficial 2
└── Número Oficial 3
```

Todos pertencem à mesma Inbox.

---

# 34. Estratégia SaaS

A camada WABA deve ser compartilhada por todas as organizações.

Restrições:

```text
organization_id
```

deve ser respeitado em todas as operações.

---

# 35. Limitações Conhecidas

Restrições impostas pela Meta:

* Templates exigem aprovação
* Políticas de envio
* Limites de qualidade
* Limites de conta
* Regras de conversa

Estas limitações devem ser tratadas pela camada Provider.

---

# 36. Decisões Arquiteturais

Consideradas definitivas:

✅ WABA é o provider oficial para atendimento clínico

✅ Evolution e WABA coexistem

✅ Provider desacoplado da regra de negócio

✅ provider_webhook_logs obrigatório

✅ Supabase Storage obrigatório

✅ Templates suportados futuramente

✅ IA integrada à WABA através da camada Provider

✅ Preparação para múltiplos números por Inbox

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
