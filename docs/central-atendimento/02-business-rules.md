# Central de Atendimento Pulsar — Regras de Negócio

> Documento: Regras de Negócio
> Versão: 1.0
> Status: Referência oficial de comportamento funcional

---

# 1. Objetivo

Este documento define as regras operacionais da Central de Atendimento do Pulsar.

Enquanto o documento `01-product-vision.md` define a visão estratégica do produto, este documento descreve o comportamento esperado do sistema, suas restrições, permissões operacionais e fluxos de negócio.

---

# 2. Estrutura Organizacional

A Central de Atendimento é organizada na seguinte hierarquia:

```text
Organization
↓
Inbox
↓
Channel
↓
Contact
↓
Conversation
↓
Message
```

---

# 3. Inboxes

Uma Inbox representa uma área operacional da organização.

Exemplos:

* Recepção Realengo
* Recepção Padre Miguel
* Financeiro
* Marketing
* RP

Regras:

* Uma Inbox pertence a uma única organização.
* Uma Inbox pode possuir múltiplos canais.
* Uma Inbox possui sua própria equipe.
* Uma Inbox possui suas próprias regras de distribuição.
* Um usuário pode participar de múltiplas Inboxes.

---

# 4. Channels

Um Channel representa um canal de comunicação conectado a uma Inbox.

Exemplos:

* WhatsApp Evolution
* WhatsApp WABA
* Instagram (futuro)

Regras:

* Um Channel pertence a apenas uma Inbox.
* Uma Inbox pode possuir múltiplos Channels.
* O operador não deve visualizar diferenças entre providers.
* A troca de provider não pode alterar o comportamento da interface.

---

# 5. Contatos

Todo atendimento deve estar associado a um contato.

Tipos permitidos:

```text
guardian
patient
therapist
physician
employee
lead
supplier
other
```

---

# 6. Vinculação Automática

Ao receber uma mensagem:

```text
Telefone
↓
Busca automática
↓
Contato existente?
```

Se encontrado:

* Vincular automaticamente.

Se não encontrado:

* Criar contato provisório.
* Marcar como "Não Identificado".

---

# 7. Context Profiles

O painel de contexto deve adaptar-se ao tipo de contato.

## Responsável

Exibir:

* Pacientes vinculados
* Próximas sessões
* Autorizações
* Financeiro
* Histórico de faltas
* Notas internas

---

## Terapeuta

Exibir:

* Especialidade
* Unidade
* Agenda
* Pacientes ativos
* Carga horária
* Pendências

---

## Médico

Exibir:

* Especialidade
* Pacientes vinculados
* Relatórios compartilhados
* Histórico de comunicação

---

## Lead

Exibir:

* Origem
* Campanha
* Funil
* Tags
* Histórico de interações

---

## Outros

Exibir:

* Dados básicos
* Notas internas
* Histórico da conversa

---

# 8. Estados da Conversa

Estados permitidos:

```text
open
assigned
waiting
resolved
archived
```

---

## open

Conversa sem operador atribuído.

Pode ser visualizada por:

* Operadores da Inbox
* Supervisores
* Admin

---

## assigned

Conversa atribuída a um operador.

Pode ser respondida pelo operador responsável.

---

## waiting

Aguardando retorno do contato.

Permanece atribuída ao operador.

---

## resolved

Atendimento concluído.

Permanece no histórico.

---

## archived

Conversa encerrada definitivamente.

Somente leitura.

---

# 9. Atribuição

A V1 utilizará atribuição manual.

Fluxo:

```text
Fila
↓
Assumir conversa
↓
assigned
```

Regras:

* Apenas um operador pode ser responsável pela conversa.
* Uma conversa não pode possuir múltiplos responsáveis simultaneamente.
* Toda atribuição gera evento de auditoria.

---

# 10. Transferência

Uma conversa pode ser transferida.

Exemplos:

```text
Recepção
↓
Financeiro
```

```text
Recepção
↓
RP
```

Regras:

* O histórico permanece íntegro.
* O contato continua na mesma conversa.
* O operador anterior permanece registrado.
* O motivo da transferência pode ser informado.
* Toda transferência gera evento de auditoria.

---

# 11. Escalonamento Interno

Transferências entre setores são consideradas escalonamentos internos.

Exemplo:

```text
Responsável
↓
Recepção
↓
Financeiro
```

O contato não deve perceber a mudança de setor.

A conversa continua única.

---

# 12. Notas Internas

Notas internas:

* Nunca são enviadas ao contato.
* São visíveis apenas para usuários autorizados.
* Podem ser editadas.
* Podem ser fixadas.
* Podem ser excluídas apenas por usuários autorizados.

Toda alteração deve ser auditada.

---

# 13. Mensagens

Tipos suportados:

```text
text
image
audio
document
pdf
system
internal_note
```

---

# 14. Áudios

Todo áudio recebido deve:

```text
Áudio
↓
Transcrição
↓
Texto indexado
```

Regras:

* A transcrição não substitui o arquivo original.
* O operador pode visualizar ambas as versões.

---

# 15. IA

A IA opera em três modos.

## OFF

Sem participação da IA.

---

## ASSISTED

A IA sugere.

O operador decide.

Exemplos:

* Reformulação
* Tradução
* Resumo
* Sugestões de resposta

---

## AUTONOMOUS

A IA pode responder automaticamente.

Exemplos:

* Confirmação de recebimento
* Perguntas simples de agenda
* Informações previamente autorizadas

Toda resposta automática deve ser identificada como enviada pela IA.

---

# 16. Consulta aos Dados do Pulsar

A IA pode consultar:

* Pacientes
* Responsáveis
* Agenda
* Autorizações
* Financeiro
* Indicadores operacionais

Somente dados autorizados para o perfil do usuário.

---

# 17. Classificação Automática

A IA deve classificar conversas por intenção.

Exemplos:

```text
agenda
autorizacao
financeiro
matricula
reclamacao
documentacao
terapeuta
marketing
outros
```

A classificação pode ser ajustada manualmente.

---

# 18. Sentimento

A IA deve identificar:

```text
positive
neutral
negative
```

Utilizado para:

* Filtros
* Alertas
* Relatórios

---

# 19. Auditoria

Toda ação relevante gera evento.

Exemplos:

* Conversa criada
* Conversa atribuída
* Conversa transferida
* Mensagem enviada
* Nota criada
* Nota editada
* Nota removida
* IA respondeu
* Conversa arquivada

Nenhum evento pode ser removido.

---

# 20. Exclusão

Mensagens não são apagadas fisicamente.

Quando uma exclusão ocorre:

```text
Mensagem removida pelo usuário
```

O registro permanece para auditoria.

---

# 21. Notificações

Tipos:

* Badge
* Toast
* Som

Disparadas para:

* Novas mensagens
* Transferências
* Menções futuras
* Conversas atribuídas

---

# 22. SLA

Configuração por Inbox.

Exemplos:

Recepção:

* Primeira resposta: 5 min

Financeiro:

* Primeira resposta: 1h

RP:

* Primeira resposta: 24h

Conversas fora do SLA devem ser destacadas visualmente.

---

# 23. Multiempresa

Toda operação deve respeitar:

```text
organization_id
```

Regras:

* Nenhuma organização pode acessar dados de outra.
* Todas as tabelas devem possuir escopo organizacional.
* Todas as consultas devem respeitar RLS.

---

# 24. Regras Futuras

Não fazem parte da V1:

* Campanhas
* Disparos em massa
* Chatbot de fluxo
* Instagram
* Round Robin
* Distribuição automática
* Múltiplos agentes simultâneos
* Grupos de WhatsApp

Essas funcionalidades deverão possuir documentação própria quando forem incorporadas ao produto.
