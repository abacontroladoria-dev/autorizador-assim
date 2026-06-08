# SPEC-CCO-001

# Central de Conciliação Operacional (CCO)

# Sistema PULSAR

## Objetivo

Implementar uma Central de Conciliação Operacional capaz de monitorar automaticamente o ciclo completo de atendimento da clínica, consolidando informações operacionais, assistenciais e financeiras.

O sistema deverá identificar automaticamente situações que exigem atuação da coordenação, protegendo receita, monitorando autorizações, acompanhando evoluções e controlando substituições de terapeutas.

A Central não será uma tela de consulta de dados.

Ela será um centro de monitoramento baseado em ocorrências, alertas e ações pendentes.

---

# Objetivos de Negócio

A Central deverá responder continuamente às seguintes perguntas:

## Operação

* Existem autorizações travadas neste momento?
* Existem sessões realizadas sem autorização?
* Existem terapeutas faltando hoje?
* Existem substituições ocorrendo hoje?

## Assistencial

* Todas as sessões realizadas possuem evolução?
* Existem evoluções fora do SLA de 5 dias?
* Quais terapeutas possuem evoluções pendentes?

## Receita

* Quais sessões não podem ser faturadas?
* Quanto dinheiro está em risco?
* Quais convênios possuem mais pendências?
* Quais unidades possuem mais pendências?

## Gestão

* Quais ocorrências exigem ação imediata?
* Quem precisa agir?
* Qual o impacto financeiro de cada ocorrência?

---

# Fontes Oficiais de Dados

## 1. API do TITA

Endpoint:

https://apiv2.apptita.com.br/api/integracao/csv_grade_profissionais

Responsável por fornecer:

* Paciente
* Data
* Hora Inicial
* Hora Final
* Profissional
* Terapia
* Convênio
* Unidade
* Status do Agendamento
* Justificativa
* Possui Tratativa
* Profissional Tratativa
* Data da Tratativa

Finalidade:

Fonte oficial dos atendimentos agendados.

---

## 2. Tabela autorizacoes_assim

Responsável por fornecer:

* Sessões autorizadas
* Sessões glosadas
* Sessões canceladas
* Autorizações liberadas

Regra:

Considerar como autorização válida:

Liberada *

Finalidade:

Determinar se uma sessão possui autorização efetiva para faturamento.

---

## 3. Tabela fila_autorizacoes

Responsável por fornecer:

* Solicitações enviadas
* Solicitações em processamento
* Falta do paciente
* Histórico de tentativa de autorização

Finalidade:

Monitorar o ciclo de solicitação da autorização.

Permitir identificar:

* Solicitação enviada
* Solicitação pendente
* Solicitação sem retorno
* Sessão sem solicitação

---

## 4. Tabela controle_terapeutico

Responsável por fornecer:

* Presença de terapeutas
* Faltas de terapeutas
* Substituições
* Cobertura de atendimento

Regra:

Esta tabela é a fonte oficial para faltas e substituições.

Qualquer informação divergente identificada nos campos Possui Tratativa, Profissional Tratativa ou Data da Tratativa da fonte grade_profissionais deverá ser registrada como ocorrência de inconsistência operacional para análise da coordenação.

Não inferir substituições comparando agenda e evolução.

Toda substituição deve existir formalmente nesta tabela.

---

# Princípios Arquiteturais

## Arquitetura Sidecar

A Central de Conciliação deve ser completamente desacoplada dos módulos existentes.

Ela consome informações.

Ela não altera informações.

---

## Não alterar estruturas legadas

Proibido:

* Alterar tabelas existentes
* Adicionar colunas em tabelas existentes
* Adicionar triggers
* Alterar relacionamentos existentes

---

## Processamento Assíncrono

Nenhuma tela poderá consultar:

* API do TITA
* ASSIM
* Tabelas operacionais

durante renderização.

Todos os dados deverão ser previamente materializados.

---

# Banco de Dados

Criar schema exclusivo:

cco

Tabelas:

cco.sessions

cco.session_authorizations

cco.session_substitutions

cco.occurrences

cco.alerts

cco.processing_logs

---

# Entidade Principal

## cco.sessions

Representa uma sessão conciliada.

Campos:

id

session_key

paciente_nome

data_sessao

hora_inicio

hora_fim

profissional_agendado

terapia

convenio

unidade

status_agendamento

justificativa

possui_tratativa

profissional_tratativa

data_tratativa

created_at

updated_at

---

# Chave de Conciliação

session_key

Composição:

hash(
paciente_nome +
data_sessao +
hora_inicio
)

IMPORTANTE:

O profissional não faz parte da chave.

Motivo:

Uma sessão pode possuir substituição legítima.

---

# Materialização

## Job 1

sync_tita_sessions

Periodicidade:

5 minutos

Origem:

API TITA

Destino:

cco.sessions

Responsável por:

Atualizar lista de sessões.

---

## Job 2

sync_assim_authorizations

Periodicidade:

5 minutos

Origem:

autorizacoes_assim

Destino:

cco.session_authorizations

Responsável por:

Atualizar status final das autorizações.

---

## Job 3

sync_authorization_queue

Periodicidade:

5 minutos

Origem:

fila_autorizacoes

Destino:

cco.session_authorizations

Responsável por:

Atualizar solicitações pendentes.

---

## Job 4

sync_therapist_control

Periodicidade:

15 minutos

Origem:

controle_terapeutico

Destino:

cco.session_substitutions

Responsável por:

Atualizar faltas e substituições.

---

# Motor de Conciliação

Serviço:

conciliation-engine

Responsável por:

Ler dados materializados.

Aplicar regras.

Gerar ocorrências.

Nunca consultar sistemas externos.

---

# Categorias de Ocorrências

AUTORIZACAO_PENDENTE

SESSAO_SEM_AUTORIZACAO

EVOLUCAO_ATRASADA

FALTA_TERAPEUTA

SUBSTITUICAO

FALTA_PACIENTE

GLOSA

---

# Regras de Negócio

## AUTORIZACAO_PENDENTE

Condições:

Existe solicitação na fila_autorizacoes

E

Não existe retorno definitivo

E

Tempo superior a 10 minutos

Gravidade:

CRITICAL

Ações:

* Ocorrência
* Slack

---

## SESSAO_SEM_AUTORIZACAO

Condições:

Sessão realizada

E

Não existe autorização válida

E

Não existe solicitação registrada

Gravidade:

CRITICAL

Ações:

* Ocorrência
* Slack

Impacto:

Receita em risco.

---

## EVOLUCAO_ATRASADA

Condições:

Possui Tratativa = Não

E

Sessão realizada há mais de 2 dias

Gravidade:

WARNING

Ações:

* Ocorrência
* Sem Slack

---

## FALTA_TERAPEUTA

Condições:

Falta registrada em controle_terapeutico

E

Não existe substituição

Gravidade:

CRITICAL

Ações:

* Ocorrência
* Slack

---

## SUBSTITUICAO

Condições:

Substituição registrada em controle_terapeutico

Gravidade:

INFO

Ações:

Somente monitoramento.

---

## FALTA_PACIENTE

Condições:

Registro identificado na fila_autorizacoes

Ou

Justificativa da sessão indicar falta do paciente

Gravidade:

INFO

Ações:

Somente monitoramento.

Observação:

Não tratar como inconsistência.

Pode existir evolução mesmo com falta.

---

## GLOSA

Condições:

Status identificado em autorizacoes_assim

Gravidade:

INFO

Ações:

Somente monitoramento.

---

# Receita em Risco

Uma sessão será considerada Receita em Risco quando possuir qualquer uma das situações:

* Sessão sem autorização
* Autorização pendente
* Evolução atrasada

Essa informação deverá ser calculada e exibida no dashboard.

---

# Frontend

Módulo:

/operacional/conciliacao

Totalmente isolado dos demais módulos.

---

# Layout

## Cards Superiores

Autorizações Pendentes

Sessões Sem Autorização

Evoluções Atrasadas

Faltas de Terapeutas

Substituições

Faltas de Pacientes

Glosas

Receita em Risco

---

## Feed de Ocorrências

Formato:

🔴 João Silva

Autorização sem retorno há 18 minutos

---

🔴 Maria Oliveira

Sessão realizada sem solicitação de autorização

---

🟠 Gabriel Pereira

Sessão realizada há 6 dias sem tratativa

---

🔵 Lucas Santos

Atendimento realizado por substituto

---

# APIs

GET /api/cco/dashboard

GET /api/cco/occurrences

GET /api/cco/occurrences/

POST /api/cco/occurrences//resolve

---

# Critérios de Aceite

1. Nenhuma alteração em tabelas legadas.

2. Nenhuma consulta externa durante renderização.

3. Tempo de carregamento do dashboard inferior a 500ms.

4. Tempo de carregamento do feed inferior a 2 segundos.

5. Processamento idempotente.

6. Alertas sem duplicidade.

7. Preparado para múltiplos convênios futuros.

8. Toda ocorrência deve indicar claramente:

* Qual sessão foi afetada
* Qual o problema
* Qual o impacto
* Quem precisa agir
* Qual ação deve ser tomada