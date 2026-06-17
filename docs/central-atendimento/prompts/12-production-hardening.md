# Prompt — Production Hardening

Leia integralmente:

docs/central-atendimento/13-audit-and-compliance.md

docs/central-atendimento/20-realtime-architecture.md

docs/central-atendimento/21-evolution-deployment.md

Sua missão é preparar a Central de Atendimento para produção.

IMPORTANTE:

Não criar novas funcionalidades.

Apenas endurecer a aplicação.

Objetivos:

- Segurança
- Observabilidade
- Monitoramento
- Performance
- Recuperação de falhas

Implementar:

Logs:

- Application Logs
- Webhook Logs
- Provider Logs
- AI Logs

Monitoramento:

- Health Check
- Redis
- Evolution
- Supabase

Criar endpoints:

GET /api/health

GET /api/health/evolution

GET /api/health/redis

GET /api/health/database

Implementar:

- Retry Strategy
- Circuit Breaker
- Timeout Control
- Rate Limiting

Validar:

- Realtime
- Webhooks
- Uploads
- Mensagens

Segurança:

- Validar RLS
- Validar JWT
- Validar Service Role
- Validar Storage Policies

Auditoria:

- conversation_events
- provider_webhook_logs
- ai_interactions

Performance:

Identificar:

- Queries lentas
- N+1 queries
- Re-renderizações
- Memory leaks

Entregáveis:

1. Relatório de problemas encontrados.
2. Correções realizadas.
3. Riscos remanescentes.
4. Recomendações.

Ao final apresentar:

"Ready for review"