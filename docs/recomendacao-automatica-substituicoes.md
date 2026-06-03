# Recomendação Automática de Substituições

## Objetivo

Identificar automaticamente o profissional mais adequado para assumir temporariamente uma sessão descoberta.

A recomendação automática não realiza alterações na agenda.

Sua função é apenas pré-selecionar o profissional mais indicado no modal de substituição, permitindo que o usuário confirme ou altere a escolha antes da efetivação da substituição.

---

## Dependências

Este documento complementa as regras definidas em:

`cobertura-clinica.md`

As regras de compatibilidade, elegibilidade e classificação dos profissionais continuam sendo definidas pelo documento principal.

Este documento trata exclusivamente da lógica de recomendação automática entre profissionais já considerados compatíveis.

---

## Escopo

A recomendação automática é utilizada quando uma sessão fica descoberta e o sistema precisa sugerir o profissional mais adequado para assumir temporariamente aquele atendimento.

A recomendação sempre será calculada individualmente para cada sessão.

Não existe conceito de substituição definitiva ou transferência permanente neste processo.

---

# Profissionais Elegíveis

Participam da recomendação automática apenas profissionais classificados como:

* Livre

Profissionais classificados como:

* Ocupado
* Não trabalha hoje

nunca poderão ser pré-selecionados automaticamente.

Eles continuam sendo exibidos no modal para análise manual do usuário.

---

# Requisitos Obrigatórios

Para participar da recomendação automática o profissional deve:

* estar ativo;
* possuir compatibilidade terapêutica;
* possuir permissão para atuar na unidade da sessão;
* possuir grade cadastrada para o dia e horário da sessão;
* não possuir conflito de agenda;
* estar classificado como Livre.

O descumprimento de qualquer requisito elimina o profissional da recomendação automática.

---

# Unidade

A recomendação automática considera apenas profissionais da mesma unidade da sessão analisada.

Profissionais de outras unidades não participam do cálculo da recomendação.

---

# Compatibilidade Terapêutica

A compatibilidade é determinada exclusivamente pela Terapia Real.

A Terapia de Exibição não deve ser utilizada em nenhuma etapa do processo de recomendação.

As regras de compatibilidade seguem exatamente o definido em:

`central-terapeutas-substituicao.md`

---

# Critérios de Priorização

Os profissionais elegíveis serão ordenados de acordo com os critérios abaixo.

A ordem dos critérios é obrigatória.

Um critério somente será utilizado quando houver empate no critério anterior.

---

## Critério 1 — Continuidade com o Paciente

Maior prioridade.

Recebe prioridade o profissional que já possui atendimento com o mesmo paciente na mesma semana da sessão analisada.

Exemplo:

Paciente João:

* Segunda-feira → Ana
* Quarta-feira → Carlos

Sessão descoberta:

* Quinta-feira

Ana e Carlos possuem prioridade sobre profissionais que não atendem o paciente naquela semana.

---

## Critério 2 — Mesma Terapia Real

Persistindo empate.

Recebe prioridade o profissional cuja Terapia Real seja exatamente igual à Terapia Real da sessão descoberta.

### Exemplo

Sessão:

* Aplicador ABA (AE)

Profissionais livres:

* Aplicador ABA (AE)
* Aplicador ABA (PS)

Ambos são compatíveis.

Porém o profissional AE recebe prioridade por possuir a mesma Terapia Real.

---

## Critério 3 — Menor Carga de Atendimentos no Dia

Persistindo empate.

Recebe prioridade o profissional que possui menor quantidade de sessões agendadas no dia da sessão analisada.

### Exemplo

Profissionais:

* Ana → 8 sessões no dia
* Carlos → 5 sessões no dia

Carlos recebe prioridade.

Para este cálculo devem ser consideradas todas as sessões do profissional naquele dia.

---

## Critério 4 — Menor Quantidade de Substituições na Competência Atual

Persistindo empate.

Recebe prioridade o profissional que recebeu menos substituições durante a competência atual.

A competência corresponde ao mês e ano da sessão analisada.

### Exemplos

Sessão em junho de 2026:

Considerar apenas substituições realizadas em junho de 2026.

Sessão em julho de 2026:

Considerar apenas substituições realizadas em julho de 2026.

---

## Atualização Imediata

A contagem de substituições deve ser atualizada imediatamente após a confirmação de uma nova substituição.

### Exemplo

Situação atual:

* Ana → 2 substituições
* Carlos → 2 substituições

Nova substituição confirmada para Ana.

Nova contagem:

* Ana → 3 substituições
* Carlos → 2 substituições

Na próxima recomendação equivalente, Carlos passa a ter prioridade.

---

## Critério 5 — Ordem Alfabética

Persistindo empate total.

Ordenar os profissionais pelo nome em ordem alfabética crescente.

---

# Pré-seleção Automática

Após a aplicação dos critérios de priorização, o primeiro profissional da lista será considerado o candidato recomendado.

Este profissional deverá aparecer automaticamente selecionado no modal de substituição.

---

# Ausência de Candidatos Elegíveis

Caso não exista nenhum profissional classificado como Livre:

* nenhuma pré-seleção automática deverá ser realizada;
* nenhum profissional será recomendado pelo sistema;
* o usuário poderá analisar manualmente os profissionais exibidos nas categorias Ocupado e Não trabalha hoje.

---

# Confirmação da Substituição

A recomendação automática não possui efeito operacional até que a substituição seja confirmada pelo usuário.

A confirmação é obrigatória para efetivar a alteração da sessão.

---

# Registro de Auditoria

Toda substituição confirmada deverá gerar registro histórico.

O registro deverá conter, no mínimo:

* sessão original;
* paciente;
* unidade;
* terapia;
* profissional original;
* profissional substituto;
* data da sessão;
* horário da sessão;
* competência;
* usuário responsável pela alteração;
* data e hora da confirmação.

---

# Estatísticas

As substituições confirmadas deverão alimentar os indicadores de distribuição utilizados pela recomendação automática.

Somente substituições efetivamente confirmadas entram nos cálculos.

Não devem ser contabilizados:

* sugestões automáticas;
* pré-seleções automáticas;
* substituições canceladas;
* substituições revertidas antes da efetivação.

---

# Objetivo da Distribuição

A recomendação automática deve buscar simultaneamente:

* continuidade terapêutica do paciente;
* equilíbrio operacional da equipe;
* distribuição justa das substituições;
* redução de concentração excessiva em um único profissional;
* manutenção da compatibilidade técnica exigida para o atendimento.

O sistema deve priorizar profissionais que já acompanham o paciente, mantendo a qualidade assistencial sempre que possível.
