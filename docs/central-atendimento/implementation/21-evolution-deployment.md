# Central de Atendimento Pulsar — Evolution Deployment

> Documento: Evolution Deployment
> Versão: 1.0
> Status: Referência oficial de infraestrutura
>
> Este documento define a arquitetura de implantação da Evolution API na infraestrutura do Pulsar.

---

# 1. Objetivo

Implantar a Evolution API de forma:

- Segura
- Escalável
- Monitorável
- Independente do Pulsar
- Preparada para múltiplos números

---

# 2. Infraestrutura Atual

Servidor:

```text
OCI VPS NVMe 4
```

Recursos:

```text
4 vCPU

24 GB RAM

200 GB NVMe
```

---

# 3. Estratégia

A Evolution não será instalada dentro do projeto Pulsar.

Arquitetura:

```text
VPS
│
├── Pulsar
├── Evolution
├── Redis
├── Nginx
└── Monitoring
```

---

# 4. Containers

Containers recomendados:

```text
pulsar-app

evolution-api

redis

nginx
```

---

# 5. Estrutura de Diretórios

```text
/opt

├── pulsar
│
├── evolution
│   ├── docker-compose.yml
│   ├── .env
│   └── backups
│
└── nginx
```

---

# 6. Domínios

Sugestão:

```text
app.pulsar.com.br

evolution.pulsar.com.br
```

---

# 7. SSL

Obrigatório.

Utilizar:

```text
Let's Encrypt
```

---

Nunca expor:

```text
HTTP
```

em produção.

---

# 8. Arquitetura de Rede

```text
Internet
↓
Cloudflare
↓
Nginx
↓
Evolution
```

---

# 9. Cloudflare

Benefícios:

```text
SSL

Proteção

Rate Limit

Firewall
```

---

# 10. Redis

Obrigatório.

Responsável por:

```text
Sessões

Cache

Filas internas
```

---

# 11. Container Redis

```yaml
redis:
  image: redis:7-alpine
```

---

# 12. Evolution

Container dedicado.

---

Imagem:

```text
evolutionapi/evolution-api
```

---

# 13. Docker Compose

Estrutura:

```yaml
services:

  evolution:

  redis:
```

---

# 14. Persistência

Volumes obrigatórios.

---

```text
Sessões WhatsApp

Configurações

Logs
```

---

# 15. Volumes

```yaml
volumes:

  evolution_instances

  evolution_store

  redis_data
```

---

# 16. Variáveis

Exemplo:

```env
SERVER_URL=https://evolution.pulsar.com.br

AUTHENTICATION_API_KEY=xxxx

DATABASE_ENABLED=false

REDIS_ENABLED=true
```

---

# 17. Banco de Dados

Para V1:

```text
Sem PostgreSQL próprio
```

---

Fonte oficial:

```text
Supabase
```

---

A Evolution armazenará apenas:

```text
Sessões

Estado conexão
```

---

# 18. API Key

Obrigatória.

---

Nunca expor ao frontend.

---

Uso permitido:

```text
Backend Pulsar
```

---

# 19. Integração Pulsar

Fluxo:

```text
Frontend
↓
Backend Pulsar
↓
Evolution
```

---

Nunca:

```text
Frontend
↓
Evolution
```

---

# 20. Criação de Instância

Fluxo:

```text
Admin
↓
Criar Canal
↓
ChannelService
↓
Evolution API
↓
Nova Instância
```

---

# 21. Nome da Instância

Padrão:

```text
org_{organization_id}_{slug}
```

---

Exemplo:

```text
org_123_marketing_realengo
```

---

# 22. QR Code

Fluxo:

```text
Admin
↓
Solicitar QR
↓
Backend
↓
Evolution
↓
QR
```

---

Nunca persistir QR Code.

---

# 23. Armazenamento do QR

Permitido:

```text
Memória

Cache
```

---

Proibido:

```text
Banco

Storage
```

---

# 24. Webhooks

Endpoint:

```text
/api/webhooks/evolution
```

---

Todos os eventos passam por:

```text
WebhookProcessingService
```

---

# 25. Eventos

Receber:

```text
messages.upsert

messages.update

connection.update

qrcode.updated
```

---

# 26. Pipeline

```text
Evolution
↓
Webhook
↓
provider_webhook_logs
↓
Processamento
↓
Banco
```

---

# 27. Monitoramento

Monitorar:

```text
Conexão

Reconexão

Falhas

Latência

Mensagens
```

---

# 28. Dashboard Operacional

Cada canal deve exibir:

```text
Status

Número

Inbox

Última Conexão

Mensagens Hoje
```

---

# 29. Estados

Mapeamento:

```text
open
↓
CONNECTED
```

---

```text
close
↓
DISCONNECTED
```

---

```text
connecting
↓
CONNECTING
```

---

# 30. Reconexão

Automática.

---

Tentativas:

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

# 31. Backup

Backup diário:

```text
Configurações

Sessões
```

---

Destino:

```text
OCI Object Storage
```

---

# 32. Logs

Separar:

```text
Application Logs

Webhook Logs

Provider Logs
```

---

# 33. Rotação

Manter:

```text
30 dias
```

---

Rotação automática.

---

# 34. Segurança

Firewall:

Liberar apenas:

```text
80

443

22
```

---

Bloquear restante.

---

# 35. SSH

Obrigatório:

```text
Chave SSH
```

---

Proibido:

```text
Senha
```

---

# 36. Fail2Ban

Instalar.

---

Objetivo:

```text
Bloquear tentativas de invasão
```

---

# 37. Recursos Esperados

Com sua VPS atual:

```text
Até 50 números

Até 20 operadores simultâneos

Sem gargalo relevante
```

---

# 38. Limites V1

Meta inicial:

```text
5 números

Marketing

RP

Relacionamento
```

---

# 39. Health Check

Endpoint:

```text
/api/health
```

---

Monitorar:

```text
Evolution

Redis

Webhook
```

---

# 40. Alertas

Notificar:

```text
Canal desconectado

QR expirado

Erro autenticação

Redis offline
```

---

# 41. Integração Futura

Preparado para:

```text
Instagram

Telegram

Facebook
```

---

Sem alterar arquitetura.

---

# 42. Deploy

Pipeline recomendado:

```text
GitHub
↓
Coolify
↓
OCI
```

---

# 43. Critério de Aceite

Deploy considerado concluído quando:

```text
Evolution online

Redis online

SSL ativo

QR funcional

Mensagens recebidas

Mensagens enviadas

Webhook funcionando

Logs funcionando
```

---

# 44. Decisões Arquiteturais

✅ Evolution isolada do Pulsar

✅ Redis obrigatório

✅ SSL obrigatório

✅ Cloudflare recomendado

✅ Backend intermediando toda comunicação

✅ QR não persistido

✅ Webhook centralizado

✅ OCI VPS NVMe 4 suportada

✅ Preparação para múltiplos números

A próxima etapa obrigatória será:

text
22-mvp-checklist.md
