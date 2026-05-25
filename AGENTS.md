# Projeto GESTAO_CLINICA

## Stack

- Next.js App Router
- TypeScript
- Supabase
- TailwindCSS
- shadcn/ui

## Regras importantes

- Manter layout atual do sistema
- Manter identidade visual existente
- Mobile-first
- Não quebrar páginas existentes
- Reutilizar componentes existentes sempre que possível

## Backend

### agenda_tita
Agenda oficial

### controle_terapeutico
Controle operacional

### grade_profissionais_tita
Grade operacional do Tita

### vw_profissionais_disponiveis
View oficial para cobertura

## Regras operacionais

- Nunca usar agenda_id como chave principal
- Usar terapia_nome como referência operacional
- Filtrar unidade operacional:
  id_unidade = 280

## UI

- Seguir padrão visual das páginas existentes
- Usar side panels ao invés de páginas excessivas
- Desktop + Mobile compatíveis
- Tela mobile será usada pelas atendentes

## Objetivo atual

Criar:
- página Controle Terapêutico
- modal de cobertura
- controle de presença/falta
- sincronização operacional