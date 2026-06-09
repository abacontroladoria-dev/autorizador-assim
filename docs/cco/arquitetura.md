# Arquitetura - CCO

## Fonte Principal

TITA

Endpoint:

POST /integracao/csv_grade_profissionais

Filtro obrigatório:

{
  "unidade": 280
}

## Convênio

ASSIM

A CCO não deve misturar dados de outros convênios.

---

## Fonte R2

Função:

public.get_auditoria_assim()

Responsável por:

SESSAO_SEM_AUTORIZACAO

Fonte oficial da verdade.

---

## Fonte R5

Tabela:

session_substitutions

Responsável por:

SUBSTITUICAO

---

## Fonte R6

Tabela:

session_mutations

Tipo:

FALTA_PACIENTE

---

## Fonte R4

Tabela:

session_mutations

Tipo:

FALTA_TERAPEUTA

---

## Fonte R7

Tabela:

session_mutations

Tipo:

GLOSA

---

## Snapshot

Tabela:

dashboard_snapshots

Objetivo:

Armazenar métricas agregadas para consulta rápida.
