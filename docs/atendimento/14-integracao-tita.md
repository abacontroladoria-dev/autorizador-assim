# Integração TITA

## Objetivo

Definir a integração entre o Pulsar Atendimento e a API TITA.

O objetivo é permitir que atendentes e IA consultem informações operacionais sem sair da conversa.

A TITA será considerada a fonte oficial para informações de agenda clínica.

---

# Princípios

## Fonte Única da Verdade

O Pulsar não deve duplicar dados da TITA.

Sempre que possível:

* Consultar
* Sincronizar
* Cachear

Mas não replicar lógica de negócio.

---

## Baixo Acoplamento

O módulo Atendimento nunca deve consumir endpoints da TITA diretamente.

Sempre utilizar:

```text
Atendimento
     ↓
ContextService
     ↓
TitaService
     ↓
API TITA
```

---

## Arquitetura

```text
WhatsApp
     ↓
Pulsar Atendimento
     ↓
ContextService
     ↓
TitaService
     ↓
API TITA
```

---

# Estrutura

## Serviço Principal

```text
services/tita/tita.service.ts
```

Responsável por toda comunicação com a API TITA.

---

## Cliente HTTP

```text
services/tita/tita-client.ts
```

Responsável por:

* Autenticação
* Headers
* Requests
* Tratamento de erros

---

# Configuração

## Base URL

Obtida por variável de ambiente.

```env
TITA_API_URL=
```

---

## Token

Obtido por variável de ambiente.

```env
TITA_TOKEN=
```

A API utiliza:

```http
X-INTEGRACAO-TOKEN
```

para autenticação.

---

# Funcionalidades MVP

## Buscar Agenda do Paciente

Objetivo:

Exibir no painel contextual:

* Próximas sessões
* Últimas sessões
* Terapias
* Profissionais

---

## Buscar Disponibilidade

Permitir que atendentes consultem horários livres.

Utilizar endpoint:

```text
grade_livre_favorecidos
```

---

## Buscar Dados do Favorecido

Permitir identificação automática.

Dados:

* Nome
* CPF
* Responsáveis
* Telefones

---

# Funcionalidades Fase 2

## Buscar Grades Disponíveis

Permitir que a IA encontre possibilidades de agendamento.

Endpoint:

```text
grades_disponiveis
```

---

## Verificar Disponibilidade

Antes de criar agendamento.

Endpoint:

```text
get_disponibilidade
```

---

## Criar Agendamento

Permitir agendamento diretamente pelo atendimento.

Endpoint:

```text
agendamento/create
```

---

# Contexto do Paciente

Ao abrir uma conversa.

O sistema deve tentar localizar:

```text
Telefone
↓
Responsável
↓
Favorecido
↓
Agenda
```

Caso identificado.

Exibir automaticamente:

* Nome do paciente
* Unidade
* Convênio
* Próximas sessões
* Profissional

---

# Painel Agenda

A aba Agenda deverá exibir:

## Próximas Sessões

```text
Segunda
14:00
ABA
Fernanda
```

---

## Últimas Sessões

```text
Quarta
16:00
Fono
Marcos
```

---

## Disponibilidades

Quando solicitado.

Exibir:

```text
Terça 14:00

Quinta 16:00

Sexta 10:00
```

---

# Integração com IA

A IA poderá utilizar informações da TITA.

Exemplos:

## Consulta

Cliente:

"Qual minha próxima sessão?"

Fluxo:

```text
Mensagem
↓
IA
↓
TitaService
↓
Resposta
```

---

## Disponibilidade

Cliente:

"Quero remarcar."

Fluxo:

```text
Mensagem
↓
IA
↓
Buscar disponibilidade
↓
Sugerir horários
```

---

# Limitações da IA

A IA pode:

* Consultar
* Informar
* Sugerir

A IA não pode:

* Alterar agenda diretamente
* Criar agendamento automaticamente
* Cancelar sessões

sem validações de negócio.

---

# Cache

Consultas frequentes podem utilizar cache.

Tempo sugerido:

```text
5 minutos
```

para reduzir chamadas.

---

# Logs

Registrar:

* Consulta agenda
* Consulta disponibilidade
* Criação agendamento
* Erros da TITA

---

# Tratamento de Erros

Em caso de falha:

Nunca exibir erro técnico ao operador.

Exibir:

```text
Não foi possível consultar a agenda neste momento.
```

Registrar erro internamente.

---

# MVP

Implementar inicialmente:

✅ Consulta agenda

✅ Consulta favorecido

✅ Exibição no painel contextual

❌ Criar agendamento

❌ Cancelar agendamento

❌ Remarcar automaticamente

Essas funcionalidades ficam para fases posteriores.

---

# Visão Futura

O objetivo final é permitir que o Pulsar Atendimento funcione como uma central operacional completa.

Fluxo desejado:

```text
Cliente WhatsApp
      ↓
IA
      ↓
TITA
      ↓
Agenda
      ↓
Resposta
```

sem que o atendente precise abrir sistemas externos.
