# Indicadores da CCO

## PRONTAS_PARA_FATURAR

Definição:

Sessões que:

- Possuem solicitação
- Possuem autorização válida
- Foram realizadas
- Foram evoluídas

E não possuem:

- Glosa
- Falta do terapeuta
- Falta do paciente

A ausência de evolução impede o faturamento da sessão.

---

## PENDENCIAS_CONCILIACAO

Definição:

Sessões bloqueadas por alguma regra da CCO.

Inclui:

- AUTORIZACAO_PENDENTE
- SESSAO_SEM_AUTORIZACAO
- EVOLUCAO_ATRASADA
- FALTA_TERAPEUTA
- FALTA_PACIENTE
- GLOSA

---

## EM_REVISAO

Atualmente inclui:

- SUBSTITUICAO

Estas sessões não compõem:

- Prontas para Faturar

Nem:

- Pendências de Conciliação

Possuem fluxo próprio de validação.

---

## EVOLUCOES_PENDENTES

Definição:

Sessões realizadas sem evolução registrada.

Objetivo:

Indicador operacional.

Não representa bloqueio definitivo.

---

## FUNIL_DE_CONCILIACAO

Etapas:

Solicitadas
↓
Autorizadas
↓
Realizadas
↓
Evoluídas
↓
Prontas para Faturar
