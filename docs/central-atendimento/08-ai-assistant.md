# Central de Atendimento Pulsar — Assistente de IA

> Documento: Assistente de IA
> Versão: 1.0
> Status: Referência oficial de Inteligência Artificial
>
> Este documento define a arquitetura, capacidades, restrições e integrações do Assistente de IA da Central de Atendimento do Pulsar.

---

# 1. Objetivo

A IA da Central de Atendimento não é um chatbot isolado.

Ela é um agente operacional integrado ao ecossistema Pulsar.

Seu objetivo é:

* Reduzir tempo de atendimento
* Aumentar produtividade
* Fornecer contexto operacional
* Automatizar tarefas repetitivas
* Auxiliar operadores
* Atender contatos automaticamente quando permitido

---

# 2. Princípios Fundamentais

A IA deve atuar como:

```text
Copiloto Operacional
+
Assistente de Atendimento
+
Agente Autônomo Controlado
```

Não deve substituir completamente os operadores humanos.

---

# 3. Modos de Operação

Cada Inbox possui um modo de IA configurável.

---

## OFF

Sem participação da IA.

Fluxo:

```text
Mensagem
↓
Operador
```

---

## ASSISTED

A IA sugere.

O operador aprova.

Fluxo:

```text
Mensagem
↓
IA sugere
↓
Operador aprova
↓
Envio
```

---

## AUTONOMOUS

A IA pode responder automaticamente.

Fluxo:

```text
Mensagem
↓
IA responde
↓
Contato
```

---

# 4. Configuração por Inbox

Exemplo:

```text
Recepção Realengo
AUTONOMOUS

Recepção Padre Miguel
AUTONOMOUS

Financeiro
ASSISTED

Marketing
ASSISTED

RP
ASSISTED

Diretoria
OFF
```

---

# 5. Capacidades da IA

A IA deve ser capaz de:

* Responder mensagens
* Consultar dados internos
* Gerar resumos
* Classificar conversas
* Analisar sentimento
* Criar notas
* Sugerir respostas
* Traduzir mensagens
* Reescrever textos

---

# 6. Escopo de Conhecimento

A IA pode acessar informações autorizadas do Pulsar.

---

## Dados Operacionais

```text
Pacientes
Responsáveis
Terapeutas
Agenda
Autorizações
Financeiro
```

---

## Dados Administrativos

```text
Usuários
Inboxes
Canais
Conversas
Notas
```

---

# 7. Integração com Agenda

Exemplo:

Contato:

```text
Tenho sessão amanhã?
```

Fluxo:

```text
Mensagem
↓
IA
↓
Agenda
↓
Resposta
```

Resposta:

```text
Sim.

Pedro possui sessão amanhã às 14h com a terapeuta Ana.
```

---

# 8. Integração com Autorizações

Exemplo:

```text
Minha autorização está válida?
```

Fluxo:

```text
Mensagem
↓
IA
↓
Autorizações
↓
Resposta
```

---

# 9. Integração com Financeiro

Exemplo:

```text
Tenho alguma pendência?
```

Fluxo:

```text
Mensagem
↓
IA
↓
Financeiro
↓
Resposta
```

---

# 10. Integração com Terapeutas

Exemplo:

```text
Preciso alterar meu horário.
```

A IA pode:

* Consultar agenda
* Consultar disponibilidade
* Encaminhar para setor correto

---

# 11. Identificação de Contexto

Antes de responder, a IA deve identificar:

```text
Quem está falando?
```

Tipos:

```text
Responsável

Paciente

Terapeuta

Médico

Lead

Fornecedor

Colaborador

Outro
```

---

# 12. Context Profiles

A resposta deve utilizar o perfil do contato.

---

## Responsável

Contexto:

```text
Pacientes

Agenda

Faltas

Financeiro

Autorizações
```

---

## Terapeuta

Contexto:

```text
Agenda

Carga Horária

Pendências

Pacientes
```

---

## Lead

Contexto:

```text
Origem

Campanha

Interações
```

---

# 13. Classificação de Intenção

Toda conversa deve receber uma intenção.

Valores previstos:

```text
agenda

autorizacao

financeiro

documentacao

matricula

reclamacao

terapeuta

marketing

outros
```

---

# 14. Análise de Sentimento

Toda conversa deve receber:

```text
positive

neutral

negative
```

---

# 15. Respostas Automáticas

Exemplos permitidos:

```text
Recebemos sua mensagem.

Em instantes retornaremos.
```

---

```text
Sua sessão está confirmada para amanhã às 14h.
```

---

```text
Sua autorização está válida até 10/09/2026.
```

---

# 16. Restrições

A IA NÃO pode:

* Alterar agenda
* Alterar autorização
* Alterar financeiro
* Excluir dados
* Alterar prontuários
* Alterar pacientes

Sem autorização explícita.

---

# 17. Escalonamento Humano

Quando necessário:

```text
IA
↓
Operador
```

---

Motivos:

```text
Reclamações

Conflitos

Solicitações complexas

Erros

Solicitações financeiras críticas
```

---

# 18. Botão "Assumir Atendimento"

Operador pode interromper IA.

Fluxo:

```text
IA
↓
Assumir Atendimento
↓
Humano
```

---

Ao assumir:

```text
AI_MODE efetivo = OFF
```

para aquela conversa.

---

# 19. Resumo Automático

A IA deve gerar:

```text
Resumo da Conversa
```

Exemplo:

```text
Responsável solicitou alteração de horário.

Paciente:
Pedro

Nova disponibilidade:
Segunda e quarta à tarde.
```

---

# 20. Smart Replies

A IA pode sugerir:

```text
Respostas rápidas
```

Exemplo:

```text
Confirmar sessão

Solicitar documento

Encaminhar para financeiro
```

---

# 21. Tradução

Suportar:

```text
Português

Inglês

Espanhol
```

---

# 22. Reescrita

Exemplos:

```text
Formal

Amigável

Empático

Profissional
```

---

# 23. Áudios

Fluxo:

```text
Áudio
↓
Transcrição
↓
Texto
↓
IA
```

---

A IA sempre trabalha sobre a transcrição.

---

# 24. Geração de Notas

A IA pode sugerir:

```text
Notas internas
```

Exemplo:

```text
Possível risco de evasão.

Responsável demonstrou insatisfação.
```

---

# 25. IA e Auditoria

Toda ação deve ser registrada.

---

Exemplos:

```text
Resposta automática

Resumo gerado

Classificação

Análise sentimento

Sugestão resposta
```

---

# 26. Tabela ai_interactions

Todas as ações devem ser registradas em:

```text
ai_interactions
```

---

Campos mínimos:

```text
conversation_id

action_type

model

prompt

response

created_at
```

---

# 27. Modelos

Arquitetura preparada para:

```text
GPT

Claude

Gemini

Modelos locais
```

---

A troca de modelo não pode impactar o restante do sistema.

---

# 28. Prompt Engine

A IA deve utilizar:

```text
System Prompt

Inbox Prompt

Contact Context

Conversation Context

Business Rules
```

---

Estrutura:

```text
Prompt Final
=
System
+
Inbox
+
Contato
+
Histórico
+
Contexto Pulsar
```

---

# 29. Segurança

A IA deve respeitar:

* Permissões do usuário
* Permissões da Inbox
* Escopo da organização

---

Nunca acessar:

```text
Dados de outra organização
```

---

# 30. Custos

Todas as chamadas devem registrar:

```text
Modelo

Tokens Entrada

Tokens Saída

Custo estimado
```

---

# 31. Observabilidade

Monitorar:

```text
Tempo resposta

Erros

Custo

Tokens

Conversas automatizadas

Taxa escalonamento humano
```

---

# 32. Métricas

Indicadores:

```text
Respostas IA

Conversas resolvidas pela IA

Conversas transferidas para humano

Tempo médio atendimento

Economia operacional
```

---

# 33. Roadmap Futuro

Futuras capacidades:

```text
Múltiplos Agentes

Agente Financeiro

Agente Recepção

Agente Marketing

Agente RP

Agente Autorização
```

---

# 34. Decisões Arquiteturais

Consideradas definitivas:

✅ IA nativa do produto

✅ OFF / ASSISTED / AUTONOMOUS

✅ Integração com Agenda

✅ Integração com Autorizações

✅ Integração com Financeiro

✅ Transcrição automática

✅ Auditoria obrigatória

✅ Escalonamento humano

✅ Provider independente

✅ Multi-modelo

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
