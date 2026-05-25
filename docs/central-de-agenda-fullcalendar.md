# central-de-agenda-fullcalendar.md

# Central de Agenda - Universo ABA

## Objetivo

Construir um módulo moderno chamado “Central de Agenda” inspirado no Google Calendar utilizando FullCalendar.

O sistema permitirá visualização operacional da clínica por:

* Pacientes
* Terapeutas
* Salas

A funcionalidade será utilizada como centro operacional da clínica para:

* controle de ocupação
* visualização de atendimentos
* gestão de horários
* acompanhamento operacional
* visualização de salas
* horários livres
* conflitos futuros

---

# Estrutura do Sidebar

Adicionar novo grupo no menu lateral:

## CENTRAL DE AGENDA

Submenus:

* Pacientes
* Terapeutas
* Salas

---

# Rotas

Criar:

* /agenda/pacientes
* /agenda/terapeutas
* /agenda/salas

---

# Objetivo Visual

A interface deve possuir experiência semelhante a:

* Google Calendar
* Notion Calendar
* sistemas hospitalares modernos

Priorizar:

* clareza visual
* velocidade
* experiência operacional
* leitura rápida
* visual moderno

---

# Stack

## Frontend

* Next.js
* TypeScript
* TailwindCSS
* FullCalendar

## Bibliotecas

Instalar:

* @fullcalendar/react
* @fullcalendar/resource-timegrid
* @fullcalendar/resource-timeline
* @fullcalendar/daygrid
* @fullcalendar/timegrid
* @fullcalendar/interaction

---

# Estrutura Visual

## Sidebar

Manter estrutura atual do sistema.

Adicionar:

CENTRAL DE AGENDA

* Pacientes
* Terapeutas
* Salas

---

# Header da Página

Adicionar:

* botão Hoje
* semana anterior/próxima
* seletor de semana
* busca rápida
* botão filtros

---

# Corpo Principal

## Calendar View

Criar visualização semanal:

* horários na vertical
* dias da semana na horizontal
* eventos coloridos
* scroll fluido
* altura automática

---

# Modos de Visualização

## 1. Pacientes

Cada resource representa:

* um paciente

Eventos mostram:

* terapeuta
* terapia
* sala

---

## 2. Terapeutas

Cada resource representa:

* um terapeuta

Eventos mostram:

* paciente
* terapia
* sala

---

## 3. Salas

Cada resource representa:

* uma sala

Eventos mostram:

* paciente
* terapeuta
* terapia

Horários vagos:

* verde claro
* texto “LIVRE”

---

# Cores

## Terapias

* Fonoaudiologia → azul
* Psicologia → roxo
* Terapia Ocupacional → amarelo
* Psicopedagogia → ciano

## Status

* Livre → verde
* Conflito → vermelho
* Bloqueado → cinza

---

# Eventos do Calendário

Cada evento deve exibir:

* horário
* paciente
* terapeuta
* terapia
* sala

Layout compacto e legível.

---

# Filtros

Criar painel lateral com:

* unidade
* terapeuta
* paciente
* terapia
* sala
* convênio

---

# KPIs Inferiores

Adicionar cards:

* ocupação %
* horários livres
* total atendimentos
* próximo atendimento

---

# Integração API Tita

## Endpoint Principal

POST:
`/integracao/grade_profissionais`

A API retorna:

* profissionais
* salas
* terapias
* horários
* status
* unidade

Utilizar para construir os eventos do FullCalendar.

---

# Segurança

IMPORTANTE:
O token da API Tita NÃO deve ficar exposto no frontend.

Criar:

* route handler
  ou
* edge function

Exemplo:
`/api/agenda`

Fluxo:
Frontend → /api/agenda → API Tita

O backend será responsável por:

* inserir X-INTEGRACAO-TOKEN
* consumir API Tita
* tratar retorno
* devolver JSON limpo ao frontend

---

# Estrutura Sugerida

/components/agenda

* AgendaCalendar.tsx
* AgendaFilters.tsx
* AgendaToolbar.tsx
* AgendaLegend.tsx
* AgendaKpis.tsx

/pages/agenda

* pacientes
* terapeutas
* salas

---

# Reutilização

Criar componente único:

`<AgendaCalendar mode="pacientes" />`

Valores:

* pacientes
* terapeutas
* salas

Alterando apenas:

* resources
* labels
* agrupamento

---

# Arquitetura Futura

Preparar estrutura para:

* drag and drop
* conflitos
* edição inline
* presença
* check-in
* websocket
* ocupação em tempo real
* IA sugerindo encaixes

---

# Performance

Priorizar:

* frontend estático
* renderização client-side
* lazy loading
* alta performance

---

# Objetivo Final

Transformar a Central de Agenda em um verdadeiro centro operacional da clínica com visão completa de:

* pacientes
* terapeutas
* salas
* ocupação
* disponibilidade
* horários livres
