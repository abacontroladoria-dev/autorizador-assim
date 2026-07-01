# Prompt — Context Panel

Leia:

docs/central-atendimento/10-contact-resolution.md

docs/central-atendimento/11-ui-ux-specification.md

docs/central-atendimento/17-backend-services.md

Sua missão é implementar o Painel Contextual.

Este é o principal diferencial competitivo do Pulsar.

Implementar:

ContextService

Widgets:

- PatientWidget
- AgendaWidget
- AuthorizationWidget
- FinancialWidget
- TherapistWidget
- LeadWidget

Criar:

WidgetRegistry

Renderização dinâmica baseada em:

contact_type

Tipos:

- guardian
- therapist
- lead
- physician

Objetivos:

Quando abrir uma conversa:

Mostrar automaticamente:

- Pacientes
- Agenda
- Autorizações
- Financeiro
- Faltas

conforme o perfil.

Entregáveis:

- Widgets
- Registry
- ContextService

Ao final apresentar:

"Ready for review"