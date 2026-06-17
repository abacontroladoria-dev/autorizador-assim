# Prompt — Realtime

Leia:

docs/central-atendimento/20-realtime-architecture.md

Sua missão é implementar toda arquitetura realtime.

Implementar:

RealtimeService

Subscriptions:

- messages
- conversations
- notifications
- conversation_notes

Implementar:

- reconnect
- unsubscribe
- resubscribe

Criar hooks:

- useRealtime
- useNotifications
- useMessagesRealtime

Regras:

- Não criar subscriptions diretamente em componentes.
- Utilizar Supabase Realtime.
- Respeitar RLS.

Objetivos:

Latência inferior a 1 segundo.

Entregáveis:

- Service
- Hooks
- Testes

Ao final apresentar:

"Ready for review"