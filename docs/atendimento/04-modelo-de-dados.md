# Modelo de Dados

## Objetivo

Definir a estrutura inicial de dados para o módulo Pulsar Atendimento.

O modelo deve suportar:

* Atendimento humano
* Atendimento IA
* WhatsApp
* CRM
* Multiempresa (futuro)

---

# Princípios

1. Conversas são independentes dos canais.

2. Um contato pode possuir múltiplas conversas.

3. Uma conversa possui múltiplas mensagens.

4. O sistema deve suportar novos canais no futuro.

Exemplos:

* WhatsApp
* Instagram
* Telegram
* Web Chat

---

# Tabela: contacts

Representa pessoas que interagem com a clínica.

```sql
contacts
```

Campos:

```sql
id uuid pk

name text

phone text

email text

avatar_url text

patient_id uuid nullable

responsavel_id uuid nullable

created_at timestamp

updated_at timestamp
```

---

# Tabela: conversations

Representa uma conversa.

```sql
conversations
```

Campos:

```sql
id uuid pk

contact_id uuid fk

channel text

status text

assigned_user_id uuid nullable

last_message_at timestamp

created_at timestamp

updated_at timestamp
```

---

# Status possíveis

```text
open
pending
waiting_customer
resolved
closed
```

---

# Tabela: messages

Armazena mensagens.

```sql
messages
```

Campos:

```sql
id uuid pk

conversation_id uuid fk

sender_type text

message_type text

content text

metadata jsonb

created_at timestamp
```

---

# sender_type

```text
customer
human
ai
system
```

---

# message_type

```text
text
image
audio
document
system
```

---

# Tabela: conversation_tags

```sql
conversation_tags
```

Campos:

```sql
conversation_id

tag_id
```

---

# Tabela: tags

```sql
tags
```

Campos:

```sql
id uuid pk

name text

color text
```

---

# Exemplos de Tags

```text
Urgente
Financeiro
Remarcação
Novo Paciente
Avaliação
Convênio
```

---

# Tabela: conversation_notes

Notas internas.

Nunca enviadas ao cliente.

```sql
conversation_notes
```

Campos:

```sql
id uuid pk

conversation_id uuid fk

user_id uuid fk

content text

created_at timestamp
```

---

# Tabela: ai_interactions

Histórico de decisões da IA.

```sql
ai_interactions
```

Campos:

```sql
id uuid pk

conversation_id uuid fk

model text

prompt_version text

decision text

confidence numeric

created_at timestamp
```

---

# Tabela: conversation_assignments

Controle de responsáveis.

```sql
conversation_assignments
```

Campos:

```sql
id uuid pk

conversation_id uuid fk

user_id uuid fk

assigned_at timestamp
```

---

# Integração com Pacientes

O módulo Atendimento não deve duplicar dados clínicos.

Sempre que possível deve utilizar:

```sql
pacientes
responsaveis
terapeutas
agendamentos
financeiro
```

já existentes no Pulsar.

---

# Integração com Agenda

A conversa deve ser capaz de recuperar:

* Próxima sessão
* Última sessão
* Terapeuta atual

a partir dos módulos existentes.

---

# Integração com Financeiro

A conversa deve exibir:

* Situação financeira
* Último pagamento
* Pendências

sem replicar dados.

---

# Campos Obrigatórios MVP

Para primeira versão:

contacts

conversations

messages

tags

conversation_tags

Os demais podem ser implementados gradualmente.

---

# Preparação para Multiempresa

Todas as tabelas devem prever futuramente:

```sql
tenant_id uuid
```

Mesmo que o campo não seja utilizado inicialmente.

A arquitetura deve permanecer preparada para múltiplas clínicas.
