# Central de Conciliação - Regras de Negócio

## Objetivo

Definir as regras de cálculo dos indicadores exibidos na página inicial da Central de Conciliação.

Estas regras devem ser utilizadas exclusivamente para composição dos dados da interface.

---

## Regra Global

### Elegibilidade das Sessões

Todos os cálculos, indicadores, rankings e listas devem considerar exclusivamente sessões cujo:

### Status do Agendamento = Agendado

Esta regra possui prioridade sobre qualquer outra regra descrita neste documento.

---

### Statuses a Não Considerar

Sessões com status diferentes de:

* Cancelado
* Falta
* Remarcado
* Não Realizado
* Reposição Cancelada
* Qualquer outro status operacional

---

## KPI - Evoluções em Atraso

### Definição

Quantidade total de evoluções pendentes referentes a sessões anteriores ao dia atual.

### Considerar

Sessões:

* Status do Agendamento = Agendado
* Data da sessão anterior à data atual
* Sem evolução registrada

### Não Considerar

* Sessões do dia atual
* Sessões futuras

---

## KPI - Substituições

### Definição de Substituições

Quantidade de sessões realizadas por terapeuta substituto dentro do período selecionado.

### Sessões a Considerar

Sessões:

* Status do Agendamento = Agendado
* Possuem substituição registrada

### Observação

Substituições não dependem de aprovação.

A autorização já é realizada previamente pelo setor terapêutico.

---

## KPI - Sessões em Dia

### Definição de Sessões em Dia

Percentual de conformidade operacional.

### Fórmula

Sessões em Dia ÷ Total de Sessões Elegíveis × 100

### Sessão em Dia

Sessão considerada regular para fins operacionais.

### Exibição

69%

Sessões em dia

418 de 602 sessões

Conformidade operacional

---

## KPI - Pacientes Ativos

### Definição de Pacientes Ativos

Quantidade de pacientes únicos que possuem ao menos uma sessão elegível dentro do período selecionado.

### Regra

Cada paciente deve ser contabilizado apenas uma vez.

---

## Card - Ação Imediata

### Critério de Ação Imediata

Pacientes que possuem pelo menos uma evolução atrasada há 5 dias ou mais.

### Exibição da Ação Imediata

Título:

Ação Imediata

Subtítulo:

5 dias ou mais

---

## Card - Acompanhamento

### Critério de Acompanhamento

Pacientes que possuem evoluções atrasadas há até 4 dias.

### Exibição do Acompanhamento

Título:

Acompanhamento

Subtítulo:

Até 4 dias

---

## Top 10 Terapeutas com Mais Pendências

### Ordenação

Maior quantidade de evoluções atrasadas.

---

### Coluna - Evoluções Atrasadas

Quantidade de evoluções pendentes referentes a sessões:

* Status do Agendamento = Agendado
* Data anterior ao dia atual
* Sem evolução registrada

Não considerar sessões do dia atual.

---

### Coluna - Dias sem Evolução

Quantidade de dias decorridos desde a última evolução registrada pelo terapeuta.

#### Exibição dos Dias sem Evolução

* Hoje
* Há 1 dia
* Há 3 dias
* Há 10 dias

---

### Período

Todos os indicadores devem respeitar o filtro de período selecionado pelo usuário.

Quando não houver filtro explícito, utilizar o período padrão definido pelo sistema.
