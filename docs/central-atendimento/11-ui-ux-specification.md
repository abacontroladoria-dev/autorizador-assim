# Central de Atendimento Pulsar — Especificação UI/UX

> Documento: UI/UX Specification
> Versão: 1.0
> Status: Referência oficial de experiência do usuário
>
> Este documento define a experiência visual, navegação, layout, componentes e diretrizes de interface da Central de Atendimento do Pulsar.

---

# 1. Objetivo

A Central de Atendimento não deve ser tratada como uma página comum do sistema.

Ela deve funcionar como um ambiente operacional dedicado.

O objetivo é permitir que operadores trabalhem durante todo o expediente dentro do módulo sem necessidade de alternar constantemente entre telas.

---

# 2. Princípio Fundamental

A Central de Atendimento é um:

```text
Workspace Operacional Imersivo
```

Não é:

```text
Tela administrativa
```

---

# 3. Referências

A experiência deve ser inspirada em:

```text
Kommo
Intercom
WhatsApp Web
Slack
Linear
```

---

# 4. Conceitos de Design

O módulo deve transmitir:

```text
Velocidade
Clareza
Contexto
Controle
Profissionalismo
```

---

Evitar:

```text
Excesso de informações
Layout burocrático
Visual de ERP tradicional
```

---

# 5. Modo Workspace

Ao acessar:

```text
/central-atendimento
```

o sistema entra em modo dedicado.

---

Ocultar:

```text
Sidebar principal
Header principal
Breadcrumbs
Menus administrativos
```

---

Exibir:

```text
Workspace próprio
```

---

# 6. Layout Principal

Estrutura padrão:

```text
┌─────────────────────────────────────────────────────────────┐
│ Central de Atendimento                                      │
├───────────────┬─────────────────────────────┬───────────────┤
│ Conversas     │ Chat                        │ Contexto      │
│               │                             │               │
│               │                             │               │
└───────────────┴─────────────────────────────┴───────────────┘
```

---

# 7. Estrutura de Colunas

## Coluna 1

Lista de Conversas

---

## Coluna 2

Chat

---

## Coluna 3

Painel Contextual

---

# 8. Larguras

Desktop:

```text
Conversas: 320px

Chat: flexível

Contexto: 380px
```

---

Permitir redimensionamento.

---

# 9. Responsividade

## Desktop

3 colunas.

---

## Tablet

2 colunas.

---

## Mobile

Navegação por telas.

---

# 10. Barra Superior

Estrutura:

```text
┌──────────────────────────────────────────────┐
│ Central Atendimento             🔔 ⚙ 👤      │
└──────────────────────────────────────────────┘
```

---

Exibir:

```text
Inbox atual

Status

Notificações

Configurações
```

---

# 11. Seletor de Inbox

Visível para:

```text
Admin
Diretor
Supervisor
```

---

Exemplo:

```text
Recepção Realengo ▼
```

---

Troca instantânea.

---

# 12. Lista de Conversas

Inspirada no WhatsApp Web.

---

Exibir:

```text
Nome

Última mensagem

Horário

Status

Não lidas

Canal
```

---

Exemplo:

```text
Maria Silva

Preciso alterar o horário...

14:25

🔴 3
```

---

# 13. Filtros

Filtros rápidos:

```text
Todas

Não Lidas

Atribuídas

Sem Responsável

IA

Pendentes

SLA
```

---

# 14. Busca

Busca global:

```text
Nome

Telefone

Paciente

Responsável

Terapeuta
```

---

Resultado instantâneo.

---

# 15. Indicadores Visuais

Utilizar:

```text
Badge

Tag

Avatar

Indicadores coloridos
```

---

# 16. Chat

Área central do sistema.

---

Estrutura:

```text
Cabeçalho

Mensagens

Compositor
```

---

# 17. Cabeçalho do Chat

Exibir:

```text
Nome

Tipo contato

Canal

Status
```

---

Exemplo:

```text
Maria Silva

Responsável

WhatsApp Oficial
```

---

# 18. Mensagens

Suportar:

```text
Texto

Imagem

PDF

Documento

Áudio
```

---

# 19. Áudios

Exibir:

```text
▶ Reproduzir

📝 Transcrição
```

---

Exemplo:

```text
Áudio

Transcrição:
Gostaria de alterar o horário...
```

---

# 20. Compositor

Permitir:

```text
Texto

Emoji

Imagem

PDF

Documento

Áudio
```

---

# 21. Smart Replies

Exibir sugestões da IA.

---

Exemplo:

```text
[Confirmar Sessão]

[Solicitar Documento]

[Encaminhar Financeiro]
```

---

# 22. Assistente IA

Botão dedicado.

---

Exemplo:

```text
✨ IA
```

---

Funções:

```text
Resumir

Reescrever

Traduzir

Sugerir Resposta
```

---

# 23. Painel Contextual

Principal diferencial competitivo.

---

Estrutura dinâmica.

---

Não é fixo.

---

Baseado em:

```text
Contact Type
```

---

# 24. Responsável

Exibir:

```text
Responsável

Pacientes

Agenda

Autorizações

Financeiro

Faltas

Notas
```

---

# 25. Terapeuta

Exibir:

```text
Especialidade

Agenda

Carga Horária

Pacientes

Pendências
```

---

# 26. Médico

Exibir:

```text
Especialidade

Pacientes

Relatórios

Histórico
```

---

# 27. Lead

Exibir:

```text
Origem

Campanha

Funil

Tags
```

---

# 28. Widget Registry

Arquitetura:

```text
Contact Type
↓
Widget Registry
↓
Widgets
```

---

Exemplo:

```text
guardian
↓
AgendaWidget

FinanceiroWidget

PatientWidget
```

---

# 29. Context Widgets

Widgets independentes.

---

Exemplos:

```text
AgendaWidget

FinanceiroWidget

PatientWidget

AuthorizationWidget

LeadWidget

TherapistWidget
```

---

# 30. Notas Internas

Painel próprio.

---

Permitir:

```text
Criar

Editar

Fixar

Excluir
```

---

Nunca enviar ao contato.

---

# 31. Timeline

Exibir:

```text
Mensagens

Notas

Transferências

IA

Eventos
```

---

Em ordem cronológica.

---

# 32. SLA

Exibir alerta visual.

---

Exemplo:

```text
🟢 Dentro SLA

🟡 Próximo do SLA

🔴 SLA Estourado
```

---

# 33. Transferência

Botão rápido.

---

Exemplo:

```text
Transferir
```

---

Fluxo:

```text
Selecionar Inbox
↓
Transferir
```

---

# 34. Assumir Conversa

Botão:

```text
Assumir Atendimento
```

---

Visível quando:

```text
assigned_user_id = null
```

---

# 35. Modo IA

Exibir:

```text
OFF

ASSISTED

AUTONOMOUS
```

---

Indicador visual da conversa.

---

# 36. Notificações

Tipos:

```text
Badge

Toast

Som
```

---

# 37. Notificação de Nova Mensagem

Exemplo:

```text
🔔 Nova mensagem

Maria Silva
```

---

# 38. Dashboard de Canais

Tela administrativa.

---

Exibir:

```text
Canal

Status

Provider

Inbox

Última Conexão
```

---

# 39. Evolution

Exibir:

```text
QR Code

Status

Reconectar
```

---

# 40. WABA

Exibir:

```text
Phone Number ID

Status

Templates
```

---

# 41. Tema

Inicialmente:

```text
Dark Mode
```

como padrão.

---

Permitir:

```text
Dark

Light
```

---

# 42. Estilo Visual

Preferências:

```text
Minimalista

Premium

Corporativo

Moderno
```

---

Evitar:

```text
Visual ERP

Visual legado

Excesso de tabelas
```

---

# 43. Performance

Objetivos:

```text
Abrir conversa < 200ms

Troca conversa < 100ms

Nova mensagem realtime
```

---

# 44. Acessibilidade

Suportar:

```text
Navegação teclado

Leitores tela

Contraste adequado
```

---

# 45. Microinterações

Utilizar:

```text
Hover

Loading States

Skeletons

Animações leves
```

---

Evitar:

```text
Animações longas

Transições pesadas
```

---

# 46. Roadmap UX

Evoluções futuras:

```text
Split View

Multi-chat

Painéis destacáveis

Atalhos avançados

Workspace personalizável
```

---

# 47. Decisões Arquiteturais

Consideradas definitivas:

✅ Workspace independente

✅ Sem sidebar do Pulsar

✅ Layout 3 colunas

✅ Painel contextual dinâmico

✅ IA integrada ao chat

✅ Widgets contextuais

✅ Dark Mode nativo

✅ UX inspirada em Kommo, Intercom e WhatsApp Web

✅ Experiência premium

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
