# Prompt — Evolution Integration

Leia integralmente:

docs/central-atendimento/05-provider-architecture.md

docs/central-atendimento/06-evolution-provider.md

docs/central-atendimento/21-evolution-deployment.md

docs/central-atendimento/17-backend-services.md

docs/central-atendimento/20-realtime-architecture.md

Sua missão é integrar a Evolution API ao Pulsar.

IMPORTANTE:

- Não alterar a arquitetura definida.
- Não acessar Evolution diretamente pelo frontend.
- Todo acesso deve passar pelo backend do Pulsar.

Objetivos:

Implementar integração completa com Evolution API.

Escopo:

1. Criar EvolutionProvider.
2. Criar EvolutionWebhookController.
3. Criar EvolutionWebhookProcessor.
4. Criar EvolutionChannelManager.
5. Criar EvolutionInstanceManager.
6. Registrar provider na ProviderFactory.

Implementar:

- Criar instância
- Buscar QR Code
- Conectar número
- Receber mensagens
- Enviar mensagens
- Receber mídias
- Atualizar status conexão

Eventos obrigatórios:

- messages.upsert
- messages.update
- connection.update
- qrcode.updated

Persistência:

- provider_webhook_logs
- conversations
- messages

Regras:

- QR Code nunca deve ser salvo no banco.
- API Key nunca deve ser exposta ao frontend.
- Todo webhook deve ser armazenado antes de ser processado.
- Toda falha deve ser auditada.

Entregáveis:

1. Arquivos criados.
2. Fluxo completo implementado.
3. Endpoints criados.
4. Dependências instaladas.
5. Pontos pendentes.

Ao final apresentar:

"Ready for review"