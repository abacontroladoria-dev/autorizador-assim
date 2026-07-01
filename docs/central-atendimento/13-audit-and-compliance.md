# Central de Atendimento Pulsar — Auditoria, Compliance e Governança

> Documento: Audit and Compliance
> Versão: 1.0
> Status: Referência oficial de auditoria, rastreabilidade, conformidade e governança
>
> Este documento define os mecanismos obrigatórios de auditoria da Central de Atendimento do Pulsar.

---

# 1. Objetivo

Garantir:

* Rastreabilidade completa
* Transparência operacional
* Conformidade com LGPD
* Investigação de incidentes
* Histórico imutável
* Governança corporativa

---

# 2. Princípio Fundamental

A Central de Atendimento deve operar sob o conceito:

```text
Tudo é auditável.
```

Toda ação relevante deve deixar evidência permanente.

---

# 3. Escopo de Auditoria

A auditoria cobre:

```text
Conversas
Mensagens
Notas
IA
Usuários
Permissões
Canais
Providers
Configurações
Integrações
```

---

# 4. Eventos Auditáveis

Todo evento relevante gera registro.

Exemplos:

```text
Conversa criada
Conversa atribuída
Conversa transferida
Conversa arquivada

Mensagem enviada
Mensagem recebida
Mensagem removida

Nota criada
Nota editada
Nota removida

IA respondeu
IA classificou
IA resumiu

Canal conectado
Canal desconectado

Permissão alterada
Usuário criado
Usuário removido
```

---

# 5. Tabela conversation_events

Auditoria operacional.

```sql
conversation_events

id uuid pk

organization_id uuid

conversation_id uuid

event_type text

user_id uuid

metadata jsonb

created_at timestamptz
```

---

# 6. Tabela provider_webhook_logs

Auditoria técnica.

```sql
provider_webhook_logs

id uuid pk

organization_id uuid

provider text

event_type text

payload jsonb

processed boolean

processed_at timestamptz

error_message text

received_at timestamptz
```

---

Objetivos:

```text
Diagnóstico
Reprocessamento
Investigação
Troubleshooting
```

---

# 7. Tabela ai_interactions

Auditoria de IA.

```sql
ai_interactions

id uuid pk

organization_id uuid

conversation_id uuid

message_id uuid

action_type text

prompt text

response text

model text

tokens_input integer

tokens_output integer

created_at timestamptz
```

---

# 8. Auditoria de Mensagens

Toda mensagem deve registrar:

```text
Origem

Destino

Canal

Provider

Horário

Status
```

---

# 9. Exclusão de Mensagens

Mensagens nunca são removidas fisicamente.

Quando houver exclusão:

```text
Mensagem removida pelo usuário
```

---

Registrar:

```text
Quem removeu

Quando removeu

Origem da remoção
```

---

# 10. Soft Delete

Aplicável a:

```text
Notas

Configurações

Objetos administrativos
```

---

Não aplicável a:

```text
Mensagens

Eventos

Logs
```

---

# 11. Imutabilidade

Os seguintes registros são considerados append-only:

```text
messages

conversation_events

provider_webhook_logs

ai_interactions
```

---

Atualizações somente em campos de controle.

---

# 12. Auditoria de IA

Registrar:

```text
Resposta automática

Sugestão

Resumo

Classificação

Sentimento

Escalonamento
```

---

# 13. Explicabilidade

Toda ação automática da IA deve responder:

```text
O que foi feito?

Por que foi feito?

Qual modelo executou?
```

---

# 14. Auditoria de Permissões

Registrar:

```text
Permissão criada

Permissão alterada

Permissão removida
```

---

Campos:

```text
Usuário

Permissão

Responsável pela alteração

Data
```

---

# 15. Auditoria de Canais

Registrar:

```text
Canal criado

Canal editado

Canal removido

Canal conectado

Canal desconectado

QR regenerado
```

---

# 16. Auditoria de Providers

Registrar:

```text
Erro Provider

Timeout

Falha autenticação

Reconexão

Troca credencial
```

---

# 17. Auditoria de Conversas

Registrar:

```text
Atribuição

Transferência

Assunção

Encerramento

Arquivamento
```

---

# 18. Auditoria de SLA

Registrar:

```text
SLA próximo

SLA violado

SLA recuperado
```

---

# 19. Histórico de Alterações

Toda alteração deve preservar:

```text
Valor anterior

Valor novo

Usuário responsável
```

---

# 20. Timeline Unificada

A conversa deve possuir timeline única contendo:

```text
Mensagens

Notas

Eventos

IA

Transferências
```

---

Exemplo:

```text
10:01 Mensagem recebida

10:02 IA classificou

10:03 João assumiu

10:05 Nota criada

10:07 Transferida para Financeiro
```

---

# 21. LGPD

A Central deve seguir:

```text
Lei Geral de Proteção de Dados
```

---

Princípios:

```text
Necessidade

Finalidade

Minimização

Segurança
```

---

# 22. Controle de Acesso

Toda consulta deve respeitar:

```text
organization_id
```

---

Nenhum usuário pode acessar:

```text
Dados de outra organização
```

---

# 23. Mascaramento de Dados

Preparação futura.

Exemplos:

```text
Telefone

CPF

Email
```

---

Exibição:

```text
(21) *****-1234
```

---

Conforme perfil.

---

# 24. Retenção de Dados

Padrão inicial:

```text
Mensagens: permanente

Eventos: permanente

Logs: permanente

IA: permanente
```

---

Futuras políticas poderão alterar prazos.

---

# 25. Exportação

Admin poderá exportar:

```text
Conversas

Eventos

Auditoria

Relatórios
```

---

Formatos:

```text
CSV

XLSX

PDF
```

---

# 26. Relatório de Auditoria

Filtros:

```text
Usuário

Inbox

Canal

Contato

Data

Tipo Evento
```

---

# 27. Monitoramento de Risco

A IA poderá sinalizar:

```text
Insatisfação

Possível evasão

Conflito

Falha operacional
```

---

Todos os alertas devem ser auditados.

---

# 28. Compliance Operacional

Indicadores:

```text
Transferências

Tempo Resposta

SLA

Atendimentos IA

Atendimentos Humanos
```

---

# 29. Segurança

Toda comunicação deve utilizar:

```text
HTTPS

TLS

Tokens seguros
```

---

Nenhuma credencial deve ser exposta ao frontend.

---

# 30. Logs de Sistema

Separados da auditoria funcional.

Exemplos:

```text
Erro aplicação

Erro banco

Erro integração

Erro provider
```

---

# 31. Observabilidade

Monitorar:

```text
Falhas

Latência

Desconexões

Mensagens perdidas

Retries
```

---

# 32. Investigação de Incidentes

Deve ser possível reconstruir:

```text
Quem fez

O que fez

Quando fez

Onde fez

Resultado
```

---

# 33. Dashboard de Compliance

Indicadores:

```text
Eventos Hoje

Falhas Provider

SLA Violados

Ações IA

Transferências

Canais Offline
```

---

# 34. Roadmap Futuro

Evoluções previstas:

```text
Assinatura Digital de Eventos

Logs Imutáveis

Data Retention Policies

Mascaramento Dinâmico

Compliance Dashboard Avançado

SIEM Integration
```

---

# 35. Decisões Arquiteturais

Consideradas definitivas:

✅ Tudo é auditável

✅ Auditoria funcional e técnica separadas

✅ provider_webhook_logs obrigatório

✅ IA auditável

✅ Mensagens não são removidas fisicamente

✅ Timeline unificada

✅ LGPD by Design

✅ Multiempresa com isolamento completo

✅ Logs append-only

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
