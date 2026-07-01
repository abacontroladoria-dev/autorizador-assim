# Central de Atendimento Pulsar — Evolution Provider

> Documento: Evolution Provider
> Versão: 1.0
> Status: Referência oficial de integração
>
> Este documento define a arquitetura, regras operacionais e integração da Evolution API com a Central de Atendimento do Pulsar.

---

# 1. Objetivo

A Evolution API será utilizada como provider de comunicação para canais WhatsApp não oficiais.

Seu uso será direcionado principalmente para:

* Marketing
* RP
* Relacionamento
* Operações internas
* Canais não críticos

A Evolution não será considerada o provider principal para atendimento clínico de pacientes.

---

# 2. Posicionamento Estratégico

A arquitetura da Central de Atendimento deve permitir coexistência entre:

```text
Meta WABA
+
Evolution API
```

Exemplo:

Recepção:

```text
Meta WABA
```

Marketing:

```text
Evolution
```

RP:

```text
Evolution
```

---

# 3. Infraestrutura

A Evolution não será executada dentro do Supabase.

Arquitetura:

```text
VPS
│
├── Pulsar
├── Evolution API
├── Redis
└── Reverse Proxy
```

---

# 4. Implantação

Recomendação:

Executar a Evolution em container dedicado.

Exemplo:

```text
Projeto
└── WhatsApp
    ├── Evolution API
    └── Redis
```

---

# 5. Responsabilidades da Evolution

A Evolution é responsável por:

* Conectar WhatsApp
* Gerar QR Code
* Receber mensagens
* Enviar mensagens
* Enviar webhooks
* Gerenciar sessão WhatsApp

---

# 6. Responsabilidades do Pulsar

O Pulsar é responsável por:

* Conversas
* Contatos
* Permissões
* Auditoria
* IA
* Histórico
* Integração clínica
* Relatórios
* SLA

A Evolution nunca será fonte de verdade do sistema.

---

# 7. Fluxo de Conexão

```text
Administrador
↓
Criar Canal
↓
Provider = Evolution
↓
Gerar QR
↓
Escanear QR
↓
Canal Conectado
```

---

# 8. Criação de Canal

Ao criar um canal:

Campos mínimos:

```text
Nome

Inbox

Provider

Descrição
```

Exemplo:

```text
Marketing Realengo

Provider:
Evolution
```

---

# 9. QR Code

O QR Code deve ser exibido dentro da Central de Atendimento.

Fluxo:

```text
Central Atendimento
↓
Configurações
↓
Canais
↓
Canal Evolution
↓
Conectar
↓
QR Code
```

---

# 10. Permissões do QR Code

Podem visualizar:

* Admin
* Operador Especial autorizado

Não podem visualizar:

* Diretor
* Supervisor
* Operador

---

# 11. Status de Conexão

Estados padronizados:

```text
CONNECTED

CONNECTING

DISCONNECTED

ERROR
```

---

# 12. Indicadores de Status

Exibir:

```text
Online

Offline

Reconectando

Erro
```

---

# 13. Webhooks

Todos os eventos da Evolution devem utilizar endpoint centralizado.

Exemplo:

```text
/api/webhooks/evolution
```

---

# 14. Estratégia de Recebimento

Fluxo obrigatório:

```text
Evolution
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

# 15. provider_webhook_logs

Objetivo:

Armazenar payload bruto recebido.

Benefícios:

* Auditoria técnica
* Diagnóstico
* Reprocessamento
* Troubleshooting

---

## Estrutura

```sql
provider_webhook_logs

id uuid

provider text

event_type text

payload jsonb

processed boolean

processed_at timestamptz

error_message text

received_at timestamptz
```

---

# 16. Reprocessamento

Caso o processamento falhe:

```text
processed = false
```

O evento poderá ser reprocessado.

Sem necessidade de nova entrega do provider.

---

# 17. Eventos Suportados

Eventos esperados:

```text
message_received

message_sent

message_delivered

message_read

message_deleted

media_received

connection_update
```

---

# 18. Normalização

Todos os eventos da Evolution devem ser convertidos para o modelo interno.

Exemplo:

Payload Evolution:

```json
{
  "event": "messages.upsert"
}
```

↓

Evento interno:

```json
{
  "eventType": "message_received"
}
```

---

# 19. Conversas

A Evolution nunca cria conversas diretamente.

Fluxo:

```text
Mensagem
↓
Webhook
↓
Normalização
↓
Conversation Service
↓
Criar ou localizar conversa
```

---

# 20. Contatos

Fluxo:

```text
Telefone
↓
Buscar contato
↓
Encontrado?
```

Sim:

```text
Vincular conversa
```

Não:

```text
Criar contato provisório
```

---

# 21. Mensagens

Tipos suportados:

```text
Texto

Imagem

Documento

PDF

Áudio
```

---

# 22. Áudios

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

# 23. Download de Arquivos

A Evolution não deve ser utilizada como armazenamento.

Fluxo:

```text
Evolution
↓
Download
↓
Supabase Storage
↓
message_attachments
```

---

# 24. Storage

Armazenamento oficial:

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

# 25. Envio de Mensagens

Fluxo:

```text
Operador
↓
Chat
↓
Conversation Service
↓
Evolution Provider
↓
WhatsApp
```

---

# 26. Envio pela IA

Fluxo:

```text
IA
↓
Conversation Service
↓
Evolution Provider
↓
WhatsApp
```

A IA nunca envia diretamente.

---

# 27. Modos de IA

Compatível com:

```text
OFF

ASSISTED

AUTONOMOUS
```

---

# 28. Reconexão

Se a conexão for perdida:

```text
CONNECTED
↓
DISCONNECTED
↓
RECONNECTING
```

O sistema deve tentar reconexão automática.

---

# 29. Alertas

Notificar:

* Admin
* Operador Especial

Quando:

* Canal desconectar
* QR expirar
* Falha de autenticação

---

# 30. Auditoria

Registrar:

* Conexão
* Desconexão
* Reconexão
* Troca de QR
* Mensagens enviadas
* Mensagens recebidas

---

# 31. Limitações Conhecidas

A Evolution utiliza engenharia baseada no WhatsApp Web.

Portanto:

* Pode sofrer desconexões
* Pode exigir atualização periódica
* Não possui garantias da Meta

---

# 32. Uso Recomendado

Indicado para:

```text
Marketing

RP

Relacionamento

Captação

Comunicação Interna
```

---

# 33. Uso Não Recomendado

Evitar como canal principal para:

```text
Atendimento clínico crítico

Autorizações críticas

Operações dependentes de SLA rigoroso
```

Nestes casos utilizar Meta WABA.

---

# 34. Métricas

Monitorar:

```text
Mensagens enviadas

Mensagens recebidas

Falhas

Tempo resposta

Desconexões

Reconexões
```

---

# 35. Dashboard Operacional

Cada canal Evolution deve exibir:

```text
Status

Última conexão

Última mensagem

Quantidade conversas

Mensagens hoje

Falhas
```

---

# 36. Decisões Arquiteturais

Consideradas definitivas:

✅ Evolution é apenas Provider

✅ Pulsar é a fonte de verdade

✅ provider_webhook_logs obrigatório

✅ Supabase Storage obrigatório

✅ QR Code dentro da Central de Atendimento

✅ Provider desacoplado da regra de negócio

✅ Suporte simultâneo Evolution + WABA

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
