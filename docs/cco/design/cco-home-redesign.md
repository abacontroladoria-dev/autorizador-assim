# Redesign da Página Inicial - Central de Conciliação

## Objetivo

Reestruturar a página inicial da Central de Conciliação para torná-la um painel operacional focado em tomada de decisão.

O objetivo NÃO é criar novos indicadores ou alterar regras de negócio.

O objetivo é reorganizar visualmente as informações existentes para reduzir carga cognitiva e destacar ações prioritárias.

---

## Layout Geral

## Linha 1 - KPIs

Exibir exatamente 4 KPIs:

### Evoluções em atraso

Quantidade de evoluções pendentes até o dia anterior.

Evoluções do dia atual não devem ser consideradas atrasadas.

---

### Substituições

Quantidade de substituições registradas no período selecionado.

Substituições não dependem de aprovação.

Subtítulo:

"Substituições realizadas"

---

### Sessões em dia

Exibir:

* Percentual de conformidade operacional
* Quantidade absoluta

Formato:

69%
Sessões em dia

418 de 602 sessões

---

### Pacientes ativos

Quantidade de pacientes ativos no período.

---

## Linha 2

## Card Ação Imediata

Critério:

Pacientes com evolução atrasada há 5 dias ou mais.

Título:

Ação Imediata

Subtítulo:

5 dias ou mais

Exibir:

* Quantidade total
* Lista resumida de pacientes
* Dias de atraso

Botão:

Ver todos (X)

---

## Card Acompanhamento

Critério:

Pacientes com evolução atrasada de até 4 dias.

Título:

Acompanhamento

Subtítulo:

Até 4 dias

Exibir:

* Quantidade total
* Lista resumida de pacientes
* Dias de atraso

Botão:

Ver todos (X)

---

## Ações Rápidas

Botões:

* Buscar Paciente
* Buscar Terapeuta
* Substituições
* Relatório

---

## Linha 3

## Top 10 Terapeutas com Mais Pendências

Colunas:

* Terapeuta
* Evoluções Atrasadas
* Dias sem Evolução

### Regra Evoluções Atrasadas

Considerar somente evoluções pendentes até o dia anterior.

Evoluções do dia atual não entram na contagem.

### Regra Dias sem Evolução

Contagem de dias desde a última evolução registrada pelo terapeuta.

Formato:

Hoje
Há 1 dia
Há 3 dias
Há 10 dias

---

## Regras Visuais

Remover:

* Barras de progresso por paciente
* Percentuais por paciente
* Classificações Alto/Médio/Baixo
* Ranking por carga operacional

Utilizar:

* Cards simples
* Hierarquia visual clara
* Pouco texto
* Foco em ação operacional

---

## Importante

Não alterar:

* APIs
* Queries
* Estrutura de banco
* Regras de negócio existentes

A alteração deve ser exclusivamente visual e de organização da informação.
