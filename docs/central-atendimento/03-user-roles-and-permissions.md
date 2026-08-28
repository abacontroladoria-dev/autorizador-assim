# Central de Atendimento Pulsar — Papéis e Permissões

> Documento: Papéis e Permissões
> Versão: 1.0
> Status: Referência oficial de autorização e controle de acesso

---

# 1. Objetivo

Este documento define os papéis, níveis de acesso, regras de visibilidade e operações permitidas dentro da Central de Atendimento do Pulsar.

O objetivo é garantir:

* Segurança operacional
* Segregação de responsabilidades
* Controle de acesso por Inbox
* Escalabilidade para ambiente SaaS
* Auditabilidade completa

---

# 2. Princípios Gerais

## 2.1 Menor Privilégio

Todo usuário deve possuir apenas os acessos necessários para executar suas atividades.

---

## 2.2 Visibilidade Restrita

Usuários visualizam apenas:

* Inboxes autorizadas
* Conversas autorizadas
* Contatos autorizados

Exceto quando possuírem privilégios elevados.

---

## 2.3 Auditoria Obrigatória

Toda ação administrativa deve gerar registro de auditoria.

---

## 2.4 Multiempresa

Nenhum usuário pode visualizar recursos de outra organização.

Toda permissão é limitada por:

```text
organization_id
```

---

# 3. Arquitetura de Permissões

O sistema possui dois níveis de autorização:

## Nível 1 — Organização

Define o papel global do usuário.

Exemplos:

```text
Admin
Diretor
Supervisor
Operador
```

---

## Nível 2 — Inbox

Define quais Inboxes o usuário pode acessar.

Exemplos:

```text
Recepção Realengo
Recepção Padre Miguel
Financeiro
Marketing
RP
```

---

# 4. Papéis da Central

Papéis da Central são independentes dos módulos administrativos do Pulsar.

---

# 5. Admin

## Descrição

Administrador da organização.

Possui controle total da Central de Atendimento.

---

## Pode

* Ver todas as Inboxes
* Ver todos os canais
* Ver todas as conversas
* Ver todos os contatos
* Criar canais
* Conectar QR Codes
* Configurar WABA
* Configurar IA
* Configurar equipe
* Configurar regras
* Criar supervisores
* Criar operadores
* Excluir canais
* Excluir notas
* Arquivar conversas
* Restaurar conversas
* Consultar auditoria

---

## Não pode

Nada dentro da organização.

---

# 6. Diretor

## Descrição

Perfil executivo.

Possui visibilidade total da operação.

---

## Pode

* Ver todas as Inboxes
* Ver todos os canais
* Ver todas as conversas
* Ver relatórios
* Consultar auditoria
* Assumir conversas
* Transferir conversas

---

## Não pode

* Alterar infraestrutura
* Alterar providers
* Excluir canais
* Alterar integrações

---

# 7. Supervisor

## Descrição

Responsável por uma ou mais Inboxes.

---

## Pode

* Ver todas as conversas das Inboxes permitidas
* Assumir conversas
* Transferir conversas
* Encerrar conversas
* Arquivar conversas
* Consultar métricas
* Gerenciar fila
* Gerenciar operadores da Inbox

---

## Não pode

* Criar canais
* Excluir canais
* Alterar providers
* Configurar integrações globais

---

# 8. Operador

## Descrição

Usuário responsável pelo atendimento diário.

---

## Pode

* Visualizar Inboxes autorizadas
* Responder mensagens
* Criar notas
* Editar próprias notas
* Assumir conversas
* Encerrar conversas
* Utilizar IA
* Utilizar macros

---

## Não pode

* Ver outras Inboxes
* Alterar configurações
* Criar canais
* Excluir canais
* Ver auditoria global

---

# 9. Operador Especial

## Descrição

Operador com permissões adicionais.

Utilizado para exceções operacionais.

Exemplo:

```text
Recepção Sênior
Coordenador Operacional
Responsável Técnico
```

---

## Pode

Tudo que um Operador pode.

Além disso:

* Conectar canais
* Gerar QR Code
* Reiniciar conexão
* Visualizar status dos providers

---

## Não pode

* Alterar regras globais
* Gerenciar usuários
* Alterar integrações críticas

---

# 10. Permissões por Inbox

Além do papel global, o usuário precisa possuir acesso explícito à Inbox.

---

## Exemplo

Usuário:

```text
João
```

Permissões:

```text
Recepção Realengo
Financeiro
```

---

O usuário não deve visualizar:

```text
Marketing
RP
Recepção Padre Miguel
```

Nem mesmo saber que essas Inboxes existem.

---

# 11. Visibilidade de Conversas

## Admin

Visualiza todas.

---

## Diretor

Visualiza todas.

---

## Supervisor

Visualiza todas as conversas das suas Inboxes.

---

## Operador

Visualiza:

* Conversas atribuídas
* Conversas da Inbox permitida

---

# 12. Atribuição de Conversas

## Operador

Pode assumir conversa.

---

## Supervisor

Pode atribuir conversa para qualquer operador da Inbox.

---

## Diretor

Pode atribuir qualquer conversa.

---

## Admin

Pode atribuir qualquer conversa.

---

# 13. Transferência de Conversas

Pode transferir:

| Papel      | Transferir |
| ---------- | ---------- |
| Admin      | Sim        |
| Diretor    | Sim        |
| Supervisor | Sim        |
| Operador   | Sim        |

---

Toda transferência gera auditoria.

---

# 14. Notas Internas

## Criar

Todos os usuários operacionais.

---

## Editar

Autor da nota.

Supervisor.

Admin.

---

## Excluir

Supervisor.

Diretor.

Admin.

---

Toda exclusão gera auditoria.

---

# 15. Auditoria

## Admin

Acesso completo.

---

## Diretor

Acesso leitura.

---

## Supervisor

Apenas auditoria da própria Inbox.

---

## Operador

Sem acesso.

---

# 16. Configuração de Providers

## Evolution

Pode configurar:

* Admin
* Operador Especial autorizado

---

## WABA

Pode configurar:

* Admin

---

# 17. Configuração de IA

## Admin

Controle total.

---

## Supervisor

Configuração da Inbox.

---

## Operador

Sem acesso.

---

# 18. Modos de IA

Cada Inbox possui um modo.

---

## OFF

Sem IA.

---

## ASSISTED

IA sugere.

Operador aprova.

---

## AUTONOMOUS

IA responde automaticamente.

---

Somente:

* Admin
* Supervisor

podem alterar.

---

# 19. Permissões de Contato

## Responsável

Visualizar:

* Pacientes
* Agenda
* Autorizações
* Financeiro

Conforme permissões da Inbox.

---

## Terapeuta

Visualizar:

* Agenda
* Pacientes
* CH
* Pendências

Conforme permissões da Inbox.

---

## Lead

Visualizar:

* Funil
* Campanha
* Tags

Conforme permissões da Inbox.

---

# 20. QR Code e Conexões

Pode visualizar QR:

| Papel             | QR  |
| ----------------- | --- |
| Admin             | Sim |
| Diretor           | Não |
| Supervisor        | Não |
| Operador          | Não |
| Operador Especial | Sim |

---

# 21. Relatórios

## Admin

Todos.

---

## Diretor

Todos.

---

## Supervisor

Somente suas Inboxes.

---

## Operador

Somente métricas pessoais.

---

# 22. Exclusão de Dados

A Central de Atendimento adota política de preservação histórica.

---

Mensagens:

```text
Nunca são removidas fisicamente.
```

---

Conversas:

```text
Nunca são removidas fisicamente.
```

---

Notas:

```text
Soft delete.
```

---

Logs:

```text
Imutáveis.
```

---

# 23. Matriz Resumida

| Ação                   | Admin | Diretor | Supervisor | Operador | Op. Especial |
| ---------------------- | ----- | ------- | ---------- | -------- | ------------ |
| Ver todas as Inboxes   | ✅     | ✅       | ❌          | ❌        | ❌            |
| Ver Inbox permitida    | ✅     | ✅       | ✅          | ✅        | ✅            |
| Assumir conversa       | ✅     | ✅       | ✅          | ✅        | ✅            |
| Transferir conversa    | ✅     | ✅       | ✅          | ✅        | ✅            |
| Encerrar conversa      | ✅     | ✅       | ✅          | ✅        | ✅            |
| Criar nota             | ✅     | ✅       | ✅          | ✅        | ✅            |
| Excluir nota           | ✅     | ✅       | ✅          | ❌        | ❌            |
| Configurar IA          | ✅     | ❌       | ✅          | ❌        | ❌            |
| Configurar Canal       | ✅     | ❌       | ❌          | ❌        | ✅            |
| Visualizar QR Code     | ✅     | ❌       | ❌          | ❌        | ✅            |
| Ver Auditoria          | ✅     | ✅       | Parcial    | ❌        | ❌            |
| Ver Relatórios Globais | ✅     | ✅       | ❌          | ❌        | ❌            |
| Gerenciar Usuários     | ✅     | ❌       | ❌          | ❌        | ❌            |

---

# 24. Regras Futuras

Versões futuras poderão introduzir:

* Papéis customizáveis
* Permissões por recurso
* Permissões por campo
* Delegação temporária
* Aprovação em múltiplos níveis

Sem quebrar a estrutura definida neste documento.
