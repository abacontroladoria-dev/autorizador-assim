# Frontend - CCO

## Objetivo

A página deve responder rapidamente:

"O que pode ser enviado para faturamento hoje?"

## Filosofia

A tela deve possuir aparência de produto SaaS moderno.

Referências:

- Stripe
- Linear
- Notion
- Vercel

## NÃO FAZER

- Tabelas gigantes
- Aparência de Excel
- Aparência de ERP legado
- Excesso de colunas
- Valores financeiros

## Estrutura da Página

### Header

Título:

Central de Conciliação ASSIM

Filtro:

Competência

Formato:

MM/YYYY

---

### Cards KPI

- Prontas para Faturar
- Pendências de Conciliação
- Em Revisão
- Evoluções Pendentes

---

### Funil de Conciliação

Fluxo visual:

Solicitadas
↓
Autorizadas
↓
Realizadas
↓
Evoluídas
↓
Prontas para Faturar

---

### Motivos das Pendências

Visualização:

Gráfico Donut

Categorias:

- Sem autorização
- Glosa
- Falta terapeuta
- Falta paciente
- Outros

---

### Sessões em Revisão

Exibir:

Substituições

---

### Evoluções Pendentes

Exibir:

Ranking por terapeuta

## Drill-down obrigatório

Toda informação da CCO deve permitir navegar até:

Paciente
↓
Sessão
↓
Detalhamento da Sessão

- Data
- Horário
- Terapia
- Profissional
- Status da autorização
- Status da evolução
- Autor da evolução
- Data/Hora da evolução
- Substituição
- Glosa
- Tratativas
