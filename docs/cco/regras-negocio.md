# Regras de Negócio - CCO

## R1 - AUTORIZACAO_PENDENTE

Descrição:

Sessão possui solicitação registrada, porém ainda não possui autorização válida.

Impacto:

- Impede faturamento.

---

## R2 - SESSAO_SEM_AUTORIZACAO

Fonte oficial:

public.get_auditoria_assim()

Observação:

Esta regra substituiu a implementação anterior baseada em:

- session_key
- session_authorizations

Impacto:

- Impede faturamento.

---

## R3 - EVOLUCAO_ATRASADA

Descrição:

Sessão realizada sem evolução registrada.

Critério:

data_sessao < CURRENT_DATE

Observação:

Considerar apenas sessões anteriores ao dia atual.

Impacto:

- Impede faturamento.
- Sessão não pode ser considerada apta para faturamento.
- Compõe o indicador de Pendências de Conciliação.

Observação de Produto:

Apesar de compor as pendências, possui indicador próprio devido à sua relevância operacional.

## R4 - FALTA_TERAPEUTA

Descrição:

Sessão não realizada por ausência do terapeuta.

Impacto:

- Impede faturamento.

---

## R5 - SUBSTITUICAO

Descrição:

Sessão realizada por profissional substituto.

Impacto:

- Não bloqueia automaticamente.
- Deve aparecer como "Em Revisão".

Status:

EM_REVISAO

---

## R6 - FALTA_PACIENTE

Descrição:

Paciente não compareceu à sessão.

Impacto:

- Impede faturamento.

---

## R7 - GLOSA

Descrição:

Sessão identificada com glosa.

Impacto:

- Impede faturamento.

## Decisão de Produto - Substituição

Sessões com substituição não são consideradas automaticamente bloqueadas.

Sessões com substituição também não são consideradas automaticamente aptas para faturamento.

Devem ser classificadas como:

EM_REVISAO

A decisão final de faturamento depende de validação operacional.
