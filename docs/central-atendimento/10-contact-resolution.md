# Central de Atendimento Pulsar — Resolução e Enriquecimento de Contatos

> Documento: Contact Resolution
> Versão: 1.0
> Status: Referência oficial de identificação, vinculação e enriquecimento de contatos
>
> Este documento define como a Central de Atendimento identifica, vincula, enriquece e mantém contatos sincronizados com o ecossistema Pulsar.

---

# 1. Objetivo

A Central de Atendimento não deve tratar um contato apenas como um número de telefone.

O objetivo é transformar um identificador externo em uma entidade operacional rica e contextualizada.

Exemplo:

Não mostrar:

```text id="1m7a4t"
+55 21 99999-9999
```

Mostrar:

```text id="5d0s2f"
Maria Silva

Responsável por:
- Pedro Silva
- Lucas Silva

Convênio:
Unimed

Faltas no mês:
3

Próxima sessão:
Amanhã às 14h
```

---

# 2. Conceito Central

O telefone não é a entidade principal.

A entidade principal é:

```text id="c9t4l1"
Contato
```

---

Estrutura:

```text id="7h4mzs"
Telefone
↓
Contato
↓
Perfil
↓
Contexto
↓
Conversa
```

---

# 3. Tipos de Contato

Tipos suportados:

```text id="w4v6l9"
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

# 4. Fluxo de Identificação

Quando uma mensagem é recebida:

```text id="p7m8x2"
Mensagem
↓
Telefone
↓
Resolver contato
```

---

Processo:

```text id="r3k8y5"
Buscar identificador
↓
Encontrado?
```

---

Sim:

```text id="e8z9c1"
Associar conversa
```

---

Não:

```text id="v4q2m7"
Criar contato provisório
```

---

# 5. Contatos Provisórios

Quando o sistema não consegue identificar o remetente:

Criar:

```text id="a7n1d8"
contact_type = other

status = unidentified
```

---

Exemplo:

```text id="g2k5w9"
Contato #123

Telefone:
21999999999
```

---

# 6. Processo de Enriquecimento

Após identificação inicial:

```text id="s9j4u6"
Contato
↓
Busca contexto
↓
Enriquecimento
```

---

Fontes:

```text id="y6v8f3"
Pacientes

Responsáveis

Terapeutas

Usuários

Financeiro

Autorizações

Agenda
```

---

# 7. Contact Resolution Engine

Criar serviço dedicado:

```text id="b5c1t7"
ContactResolutionService
```

---

Responsabilidades:

* Identificação
* Vinculação
* Deduplicação
* Enriquecimento
* Atualização

---

# 8. Identificadores

Um contato pode possuir múltiplos identificadores.

Exemplos:

```text id="q2w6e4"
Telefone

Instagram

Email

Facebook
```

---

Tabela:

```text id="f9r3k1"
contact_identifiers
```

---

# 9. Prioridade de Resolução

Ordem:

```text id="t8n2a5"
1. Identificador Exato

2. Telefone

3. Email

4. Match Inteligente

5. Novo Contato
```

---

# 10. Deduplicação

Evitar múltiplos contatos para a mesma pessoa.

---

Exemplo:

```text id="d4y9m7"
Maria Silva

+55 21 99999-1111

e

Maria Silva

+55 21 99999-1111
```

↓

```text id="h8v6q3"
Mesclar
```

---

# 11. Relacionamento Responsável → Paciente

Relacionamento fundamental.

Exemplo:

```text id="u5w2r8"
Maria Silva
│
├── Pedro Silva
└── Lucas Silva
```

---

Tabela:

```text id="n7f4d1"
contact_patient_links
```

---

# 12. Tipos de Relacionamento

Valores previstos:

```text id="z4x9k2"
mother

father

guardian

grandmother

grandfather

other
```

---

# 13. Múltiplos Pacientes

Um responsável pode estar vinculado a múltiplos pacientes.

---

Exemplo:

```text id="m1s7v9"
Maria
├── Pedro
├── Lucas
└── João
```

---

# 14. Múltiplos Responsáveis

Um paciente pode possuir múltiplos responsáveis.

---

Exemplo:

```text id="w8d3r6"
Pedro
├── Mãe
├── Pai
└── Avó
```

---

# 15. Painel Contextual

Após resolução:

Exibir informações relevantes.

---

# 16. Contexto para Responsáveis

Exibir:

```text id="j2f6t9"
Pacientes

Próximas Sessões

Autorizações

Financeiro

Faltas

Observações
```

---

# 17. Contexto para Terapeutas

Exibir:

```text id="k4g8n1"
Especialidade

Agenda

Carga Horária

Pacientes

Pendências
```

---

# 18. Contexto para Médicos

Exibir:

```text id="r5h2m8"
Especialidade

Pacientes Relacionados

Relatórios

Histórico
```

---

# 19. Contexto para Leads

Exibir:

```text id="y1v7d4"
Origem

Campanha

Funil

Tags

Interações
```

---

# 20. Context Widgets

A interface deve ser dinâmica.

---

Arquitetura:

```text id="p3x8k5"
Contact Type
↓
Widget Registry
↓
Widgets
```

---

Exemplo:

```text id="c6w2t9"
guardian
↓
PatientWidget
AgendaWidget
FinanceiroWidget
```

---

# 21. Contact Confidence Score

A resolução deve possuir nível de confiança.

---

Exemplo:

```text id="d7n5v1"
100%
Telefone exato

90%
Email exato

70%
Match nome

40%
Match parcial
```

---

# 22. Resolução Automática

Quando confiança:

```text id="m4s7x2"
>= 90%
```

Vincular automaticamente.

---

# 23. Resolução Assistida

Quando confiança:

```text id="n8r3d6"
50% a 89%
```

Solicitar validação.

---

# 24. Resolução Manual

Quando confiança:

```text id="b9k1w4"
< 50%
```

Operador decide.

---

# 25. Histórico de Resolução

Registrar:

```text id="x2f8p7"
Quem vinculou

Quando vinculou

Motivo

Origem
```

---

# 26. Integração com IA

A IA depende da resolução correta.

---

Fluxo:

```text id="h5m9c3"
Contato
↓
Resolução
↓
Contexto
↓
IA
```

---

Sem resolução:

```text id="n4d6v8"
IA limitada
```

---

Com resolução:

```text id="y7w1k5"
IA contextual
```

---

# 27. Busca Global

Permitir busca por:

```text id="e1r9m4"
Nome

Telefone

Paciente

Responsável

Email
```

---

Exemplo:

Pesquisar:

```text id="g6p2v7"
Pedro Silva
```

↓

Encontrar:

```text id="m8k4t1"
Maria Silva
Responsável
```

---

# 28. Sincronização

A Central não é dona dos dados clínicos.

---

Origem oficial:

```text id="u2n7w5"
Pacientes

Responsáveis

Terapeutas
```

---

Devem permanecer nos módulos originais.

---

# 29. LGPD

Exibir apenas informações necessárias para atendimento.

---

Princípio:

```text id="q4d8x6"
Need to Know
```

---

# 30. Auditoria

Registrar:

```text id="v1m5r8"
Contato criado

Contato vinculado

Contato mesclado

Contato enriquecido

Contato corrigido
```

---

# 31. Métricas

Monitorar:

```text id="t6p3w9"
Contatos identificados

Contatos provisórios

Taxa de resolução

Taxa de duplicidade

Tempo de resolução
```

---

# 32. Roadmap Futuro

Evoluções previstas:

```text id="k9v2m7"
Resolução por IA

Resolução por CPF

Resolução por Email

Resolução por Convênio

Graph de Relacionamentos

Perfil Unificado
```

---

# 33. Decisões Arquiteturais

Consideradas definitivas:

✅ Telefone não é entidade principal

✅ Contato é entidade principal

✅ Múltiplos identificadores

✅ Responsável pode possuir múltiplos pacientes

✅ Paciente pode possuir múltiplos responsáveis

✅ Painel contextual dinâmico

✅ Contact Resolution Engine

✅ Confidence Score

✅ Integração profunda com IA

✅ Dados clínicos permanecem nos módulos de origem

Estas decisões não devem ser alteradas sem revisão arquitetural formal.
