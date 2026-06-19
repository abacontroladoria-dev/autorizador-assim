# Permissões

## Objetivo

Definir o modelo de permissões do módulo Pulsar Atendimento.

O módulo deve utilizar o sistema de autenticação e autorização já existente no Pulsar.

Não criar sistema paralelo de usuários.

---

# Princípios

## Menor Privilégio

Usuários devem possuir apenas as permissões necessárias para executar suas atividades.

---

## Controle por Permissão

O acesso deve ser baseado em permissões.

Não em regras hardcoded.

---

## Controle por Função

As permissões podem ser agrupadas em perfis.

Exemplos:

* Atendente
* Supervisor
* Coordenador
* Administrador

---

# Estrutura

O módulo Atendimento deve registrar permissões próprias.

Prefixo:

```text
atendimento.*
```

---

# Permissões Básicas

## Visualizar Atendimento

```text
atendimento.view
```

Permite:

* Acessar módulo
* Visualizar conversas
* Visualizar histórico

---

## Visualizar Conversas

```text
atendimento.conversations.view
```

Permite:

* Listar conversas
* Abrir conversas

---

## Enviar Mensagens

```text
atendimento.messages.send
```

Permite:

* Enviar mensagens
* Responder clientes

---

## Visualizar Contexto

```text
atendimento.context.view
```

Permite:

* Visualizar paciente
* Visualizar agenda
* Visualizar financeiro

---

# Operações de Conversa

## Assumir Conversa

```text
atendimento.conversations.assign
```

Permite:

* Assumir atendimento

---

## Transferir Conversa

```text
atendimento.conversations.transfer
```

Permite:

* Transferir para outro operador

---

## Encerrar Conversa

```text
atendimento.conversations.close
```

Permite:

* Encerrar atendimento

---

## Reabrir Conversa

```text
atendimento.conversations.reopen
```

Permite:

* Reabrir atendimento encerrado

---

# CRM

## Visualizar CRM

```text
atendimento.crm.view
```

Permite:

* Visualizar tags
* Visualizar notas
* Visualizar histórico

---

## Editar CRM

```text
atendimento.crm.edit
```

Permite:

* Alterar tags
* Criar notas
* Atualizar status

---

# IA

## Utilizar IA

```text
atendimento.ai.use
```

Permite:

* Solicitar sugestões
* Gerar resumos
* Utilizar recursos IA

---

## Gerenciar IA

```text
atendimento.ai.manage
```

Permite:

* Alterar prompts
* Alterar modelos
* Ativar ou desativar IA

---

# WhatsApp

## Visualizar Integrações

```text
atendimento.whatsapp.view
```

Permite:

* Ver status
* Ver configurações

---

## Gerenciar Integrações

```text
atendimento.whatsapp.manage
```

Permite:

* Alterar token
* Alterar provider
* Configurar webhooks

---

# Configurações

## Visualizar Configurações

```text
atendimento.settings.view
```

Permite:

* Acessar área de configuração

---

## Alterar Configurações

```text
atendimento.settings.manage
```

Permite:

* Alterar parâmetros
* Alterar comportamentos

---

# Auditoria

## Visualizar Logs

```text
atendimento.logs.view
```

Permite:

* Consultar auditoria

---

# Perfis Sugeridos

## Atendente

Permissões:

```text
atendimento.view
atendimento.conversations.view
atendimento.messages.send
atendimento.context.view
atendimento.ai.use
```

---

## Supervisor

Permissões:

```text
Todas do Atendente

+
atendimento.conversations.assign
atendimento.conversations.transfer
atendimento.conversations.close
atendimento.crm.view
atendimento.crm.edit
```

---

## Coordenador

Permissões:

```text
Todas do Supervisor

+
atendimento.logs.view
atendimento.settings.view
```

---

## Administrador

Permissões:

```text
Acesso total
```

Incluindo:

```text
atendimento.ai.manage
atendimento.whatsapp.manage
atendimento.settings.manage
```

---

# Visibilidade de Dados

## Operador

Visualiza:

* Conversas atribuídas
* Conversas abertas

---

## Supervisor

Visualiza:

* Todas as conversas da unidade

---

## Coordenador

Visualiza:

* Todas as conversas da clínica

---

## Administrador

Visualiza:

* Todas as conversas
* Todas as configurações

---

# Multiempresa

Toda consulta deve respeitar:

```sql
tenant_id
```

Nenhum usuário pode visualizar dados de outra empresa.

---

# Regras de Segurança

Nunca confiar apenas no frontend.

Toda validação deve ocorrer no backend.

Toda operação sensível deve validar permissões antes da execução.

---

# Logs Obrigatórios

Registrar:

* Assumir conversa
* Transferir conversa
* Encerrar conversa
* Reabrir conversa
* Alterar configuração
* Alterar integração
* Alterar IA

---

# MVP

Obrigatórias:

```text
atendimento.view
atendimento.conversations.view
atendimento.messages.send
atendimento.context.view
```

Demais permissões podem ser implementadas gradualmente.
