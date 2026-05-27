# REFATORAÇÃO UX — MÓDULO DE INDISPONIBILIDADE / COBERTURA CLÍNICA

## CONTEXTO

Hoje o fluxo atual utiliza múltiplos modais em cascata:

* selecionar terapeuta
* abrir horários
* marcar indisponibilidade
* selecionar substituto
* abrir outro modal
* confirmar

O objetivo é transformar isso em uma experiência operacional moderna, rápida e visual, mantendo a estrutura atual baseada em modais.

IMPORTANTE:

* NÃO refatorar toda a arquitetura.
* NÃO trocar stack.
* NÃO criar nova página.
* REAPROVEITAR os modais existentes.
* Evoluir gradualmente em blocos.

---

# OBJETIVO FINAL

Transformar o fluxo em uma:

# “Central de Cobertura Clínica”

com:

* visão operacional,
* menos cliques,
* menos modais em cascata,
* mais contexto visual,
* decisões rápidas.

---

# FLUXO OPERACIONAL

## REGRA DE NEGÓCIO

Os terapeutas NÃO acessam o sistema.

Fluxo real:

1. terapeuta fala com Alex via WhatsApp
2. Alex registra indisponibilidade
3. Operações Clínicas resolve substituições

Perfis que acessam:

* Alex / Administrativo
* Operações Clínicas

---

# BLOCO 1 — TELA INICIAL DE OPERAÇÃO CLÍNICA

## OBJETIVO

Ao abrir o módulo:
mostrar TODOS os terapeutas que possuem agenda no dia.

NÃO abrir direto em indisponibilidade.

---

## CRIAR ESTRUTURA VISUAL

### Cabeçalho

Título:
"Operação Clínica"

Subtítulo:
"Gerencie disponibilidade, indisponibilidade e cobertura dos terapeutas."

---

## KPI SUPERIOR

Criar cards rápidos:

* Terapeutas disponíveis
* Indisponibilidades
* Coberturas pendentes
* Sessões sem cobertura

Layout clean estilo SaaS moderno.

---

## LISTA DE TERAPEUTAS DO DIA

Cada linha/card deve conter:

* foto/avatar
* nome
* terapia principal
* horário total do dia
* total de sessões
* status operacional

---

## STATUS POSSÍVEIS

* Disponível
* Parcial
* Indisponível
* Cobertura pendente
* Resolvido

Usar badges suaves.

---

## AÇÕES RÁPIDAS

Adicionar botões:

* [ Disponível ]
* [ Parcial ]
* [ Indisponível ]

Sem abrir modal inicialmente.

---

# BLOCO 2 — MODAL DE INDISPONIBILIDADE

## OBJETIVO

Ao clicar em:
[ Parcial ]
ou
[ Indisponível ]

abrir modal grande.

---

## MODAL DEVE MOSTRAR

### RESUMO SUPERIOR

* foto
* nome terapeuta
* data
* horário total
* total de sessões afetadas

Exemplo:

Juliana Santos
26/05/2026
08:00 às 17:50
10 sessões afetadas

---

## IMPORTANTE

Mostrar SOMENTE horários que possuem sessões.

NÃO mostrar horários vazios.

---

## PRÉ-SELEÇÃO

Todos os horários já devem iniciar como:
"Sem substituição"

---

## ABAS

Separar:

* Manhã
* Tarde

---

# BLOCO 3 — NOVO LAYOUT DAS SESSÕES

## REMOVER

* tabela tradicional
* accordion
* linhas expansíveis
* modal dentro de modal

---

## USAR

Lista vertical de cards por sessão.

---

## ESTRUTURA DE CADA CARD

### COLUNA 1

Horário

Exemplo:
08:00 - 08:50

---

### COLUNA 2

Paciente

* nome paciente
* terapia exibição
* sala

---

### COLUNA 3

Profissionais compatíveis da semana

Mostrar primeiro os profissionais livres e exibir apenas os TOP 3 inicialmente.

---

# REGRA DE COMPATIBILIDADE

Mostrar terapeutas:

* da mesma terapia de exibição
* que possuem agenda ativa na semana

NÃO mostrar terapeutas aleatórios.

---

# STATUS DOS PROFISSIONAIS

## 🟢 Livre

Quando não possui sessão no horário.

Texto:
"Livre"

---

## 🟠 Ocupado

Quando possui sessão no horário.

Mostrar:

* nome do paciente
* horário da sessão

Exemplo:
"Ocupado"
Paciente: Sofia Lima
09:00 - 09:50

---

## 🔵 Não trabalha hoje

Quando terapeuta possui agenda na semana, mas não atende naquele dia.

Texto:
"Não trabalha hoje"

---

## 🟢 Livre

Quando não possui sessão no horário.

Texto:
"Livre"

---

## 🟠 Ocupado

Quando possui sessão no horário.

Mostrar:

* nome do paciente
* horário da sessão

Exemplo:
"Ocupado"
Paciente: Sofia Lima
09:00 - 09:50

---

## 🔵 Não trabalha hoje

Quando terapeuta possui agenda na semana, mas não atende naquele dia.

Texto:
"Não trabalha hoje"

---

# IMPORTANTE

Esses status devem aparecer visualmente no card do profissional.

---

# BLOCO 4 — SELEÇÃO DE SUBSTITUTO

## OBJETIVO

Transformar seleção em ação visual simples.

---

## REGRAS

* clique no card inteiro seleciona
* NÃO usar checkbox
* NÃO usar select HTML
* NÃO usar dropdown tradicional

---

## QUANDO SELECIONAR

Card:

* recebe borda roxa
* fundo suave
* ícone de check

---

## SEM SUBSTITUIÇÃO

Sempre exibir como opção fixa.

Visual:

○ Sem substituição
Paciente ficará sem cobertura

---

## IMPORTANTE

"Sem substituição"
deve iniciar selecionado por padrão.

---

# BLOCO 5 — VER MAIS

## OBJETIVO

Quando clicar:
"+12 profissionais"

abrir modal contextual.

---

## MODAL:

"Profissionais compatíveis"

---

## CONTEXTO SUPERIOR

Mostrar:

08:00 — Arthur Silva
ABA Infantil

---

## LISTA COMPLETA

Mostrar TODOS profissionais compatíveis da semana.

---

## FILTROS

Adicionar:

* Unidade
* Horário
* Mostrar livres
* Mostrar ocupados
* Mostrar não trabalha hoje

NÃO mostrar indisponíveis inicialmente.

---

## ORDENAÇÃO

Prioridade:

1. Livres
2. Ocupados
3. Não trabalha hoje

---

## CARD DO PROFISSIONAL

Mostrar:

* foto
* nome
* unidade
* status
* paciente atual se ocupado

---

## SELEÇÃO

Clique no card seleciona e fecha modal.

---

# BLOCO 6 — INTEGRAÇÃO COM API TITA

Utilizar endpoints existentes.

---

## PARA BUSCAR AGENDA DOS PROFISSIONAIS

Endpoint:
POST /integracao/grade_profissionais

Usar:

* data
* terapia_exibicao
* unidade

Retorna:

* horários
* status
* terapeuta
* paciente
* terapia

---

## PARA BUSCAR DISPONIBILIDADE

Endpoint:
POST /integracao/grades_disponiveis

Usar:

* horários
* terapias
* terapeutas

---

## PARA VALIDAR DISPONIBILIDADE

Endpoint:
POST /integracao/get_disponibilidade

---

# BLOCO 7 — ESTADO GLOBAL

Criar estrutura de estado para:

* indisponibilidade
* sessões afetadas
* substitutos selecionados
* sem substituição
* profissionais compatíveis

---

## SUGESTÃO

Criar:
useCoberturaClinica()

Centralizar:

* loading
* seleção
* atualização
* confirmação

---

# BLOCO 8 — UX / VISUAL

## VISUAL DESEJADO

Referência:

* Linear
* Notion
* ClickUp
* Slack
* SaaS moderno

---

## EVITAR

* aparência ERP antiga
* excesso de tabelas
* excesso de bordas
* muitos modais empilhados
* excesso de informação simultânea

---

## PRIORIZAR

* leitura rápida
* decisão rápida
* contexto operacional
* espaçamento
* clareza visual

---

# BLOCO 9 — RESPONSIVIDADE

Desktop:
manter layout principal.

Desktop:
manter layout principal.

Mobile:
não será tratado nesta etapa da refatoração. Ignorar adaptações mobile por enquanto e focar exclusivamente na experiência desktop.

Criar experiência simplificada:

* um card por sessão
* foco operacional
* botões grandes
* fluxo linear

---

# BLOCO 10 — SLACK (PREPARAÇÃO)

Ainda NÃO implementar.

Mas preparar arquitetura para:

* disparo de webhook Slack
* criação de evento operacional

Exemplo futuro:
"Nova indisponibilidade registrada"

---

# IMPORTANTE FINAL

Executar por etapas.
NÃO fazer tudo de uma vez.

Ordem recomendada:

1. Tela inicial
2. Novo modal
3. Cards das sessões
4. Seleção visual
5. Modal ver mais
6. Integração API
7. Responsividade
8. Refinos UX
