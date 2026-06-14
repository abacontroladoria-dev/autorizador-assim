# Regras de Negócio

## Objetivo

Definir o comportamento oficial do módulo Pulsar Atendimento.

As regras descritas neste documento possuem prioridade sobre decisões de implementação.

---

# RN-001

## Recebimento de Mensagem

Quando uma mensagem for recebida:

1. Identificar o canal.
2. Identificar o remetente.
3. Buscar contato existente.
4. Caso não exista, criar contato.
5. Localizar conversa ativa.
6. Caso não exista, criar conversa.
7. Registrar mensagem.
8. Atualizar última interação.

---

# RN-002

## Criação Automática de Contato

Ao receber mensagem de um telefone desconhecido:

Criar automaticamente:

```text
Contato
```

com:

* Telefone
* Nome recebido do canal
* Data de criação

---

# RN-003

## Conversa Única Ativa

Um contato pode possuir várias conversas históricas.

Porém:

Apenas uma conversa pode estar ativa por canal.

---

# RN-004

## Atualização da Última Interação

Toda nova mensagem deve atualizar:

```text
last_message_at
```

da conversa.

---

# RN-005

## Ordenação de Conversas

A lista de conversas deve ser ordenada por:

```text
last_message_at DESC
```

Mais recentes primeiro.

---

# RN-006

## Mensagem Não Lida

Ao receber mensagem:

Marcar conversa como:

```text
unread
```

até visualização do operador.

---

# RN-007

## Leitura

Ao abrir a conversa:

Remover status de não lida.

---

# RN-008

## Assumir Conversa

Um operador pode assumir uma conversa.

Ao assumir:

```text
assigned_user_id
```

deve ser atualizado.

---

# RN-009

## Transferência Entre Operadores

Uma conversa pode ser transferida.

Histórico de transferências deve ser preservado.

---

# RN-010

## Conversa Encerrada

Uma conversa encerrada:

* Continua acessível
* Continua pesquisável
* Não recebe novas mensagens

Caso o cliente envie nova mensagem:

Nova conversa deve ser criada.

---

# RN-011

## Criação de Conversa por Reabertura

Caso uma conversa esteja encerrada há mais de 24 horas:

Criar nova conversa.

Não reutilizar conversa antiga.

---

# RN-012

## Histórico Permanente

Mensagens nunca devem ser excluídas fisicamente.

Utilizar:

Soft Delete.

---

# RN-013

## Notas Internas

Notas internas:

* Nunca são enviadas ao cliente.
* Nunca aparecem em integrações externas.

---

# RN-014

## Mensagens da IA

Mensagens geradas pela IA devem ser identificadas.

Exemplo:

```text
sender_type = ai
```

---

# RN-015

## Registro de Decisões da IA

Toda decisão tomada pela IA deve ser registrada.

Exemplo:

```text
classificação
tag
transferência
resumo
```

---

# RN-016

## Transferência para Humano

A IA deve transferir imediatamente quando:

* Solicitação explícita
* Assunto clínico
* Baixa confiança
* Reclamação

---

# RN-017

## Prioridade de Atendimento

Prioridade:

1. Urgente
2. Financeiro
3. Remarcação
4. Novo Paciente
5. Demais

---

# RN-018

## Associação Automática com Paciente

Ao identificar telefone conhecido:

Buscar:

* Responsável
* Paciente
* Unidade

e exibir automaticamente.

---

# RN-019

## Associação Manual

Operadores podem vincular:

Contato ↔ Paciente

quando a identificação automática falhar.

---

# RN-020

## Busca Global

A busca deve localizar:

* Nome
* Telefone
* Paciente
* Responsável
* Número da conversa

---

# RN-021

## Tags

Uma conversa pode possuir múltiplas tags.

Exemplo:

```text
Urgente
Financeiro
Remarcação
Novo Paciente
```

---

# RN-022

## Fechamento Automático

Conversas sem interação por período configurável podem ser encerradas automaticamente.

Configuração padrão:

```text
7 dias
```

---

# RN-023

## Auditoria

Todas as ações relevantes devem gerar log:

* Criação
* Transferência
* Encerramento
* Assunção
* Resposta IA

---

# RN-024

## Multiempresa

Toda conversa deve pertencer a uma empresa.

Nenhum dado pode ser compartilhado entre empresas.

---

# RN-025

## Fonte Única da Verdade

Agenda, Financeiro e Pacientes devem continuar pertencendo aos seus módulos originais.

O Atendimento apenas consulta esses dados.

Não duplicar informações já existentes no Pulsar.

---

# Regras do MVP

Obrigatórias para primeira versão:

* Receber mensagens
* Criar contato
* Criar conversa
* Registrar mensagens
* Assumir conversa
* Transferir conversa
* Encerrar conversa
* Histórico completo
* Integração IA

Qualquer funcionalidade fora desta lista deve ser considerada evolução futura.
