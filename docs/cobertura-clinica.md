# Modal de Substituição de Terapeutas

C:\Users\UNIVERSO\projeto_automacao\assim-autorizacao\frontend-autorizador\app(dashboard)\central-terapeutas\page.tsx

## Sugestão de Substitutos

Quando uma sessão ficar descoberta, o sistema deve listar terapeutas compatíveis para substituição.

A compatibilidade deve ser determinada exclusivamente pela **Terapia Real** do profissional.

A coluna **Terapia de Exibição** não deve ser utilizada para determinar compatibilidade ou elegibilidade.

---

## Classificações

### Livre

Profissional possui terapia compatível, grade de trabalho no dia e horário analisado e não possui agendamento conflitante.

### Ocupado

Profissional possui terapia compatível, grade de trabalho no dia e horário analisado, porém possui agendamento conflitante.

### Não trabalha hoje

Profissional possui terapia compatível e trabalha no mesmo turno, mas não possui grade no dia analisado.

---

## Compatibilidade de Terapias

### Grupo ABA

As seguintes terapias são consideradas equivalentes para substituição:

* Aplicador ABA (EF)
* Aplicador ABA (AE)
* Aplicador ABA (PS)
* Aplicador ABA (SF)

Profissionais dessas terapias podem substituir uns aos outros.

### Coordenador de Caso

O Coordenador de Caso não faz parte do grupo principal de substituição.

Ele somente poderá ser considerado quando não existir nenhum profissional livre pertencente ao Grupo ABA.

### Demais Terapias

As demais terapias somente poderão ser substituídas por profissionais que possuam exatamente a mesma Terapia Real:

* Arteterapia
* Fisioterapia
* Fisioterapia Aquática
* Fonoaudiologia
* Musicoterapia
* Psicologia
* Psicomotricidade
* Psicopedagogia
* Terapia Alimentar
* Terapia Ocupacional

---

## Regra de Exibição

Todos os profissionais compatíveis devem ser exibidos.

Nenhuma categoria deve ser ocultada.

A ordenação deve ser:

1. Livres
2. Ocupados
3. Não trabalha hoje

---

## Regra de Exclusão

Um profissional somente pode ser removido da lista quando:

* estiver inativo;
* não possuir compatibilidade com a terapia requerida;
* não possuir permissão para atuar na unidade analisada.

Profissionais ocupados devem continuar aparecendo na lista.

Profissionais livres devem continuar aparecendo na lista.

Profissionais classificados como "não trabalha hoje" devem continuar aparecendo na lista.

---

## Recomendação Automática

## Recomendação Automática

As regras de recomendação e pré-seleção automática de substitutos são definidas em documento próprio.

Consultar:

`recomendacao-automatica-substituicoes.md`

A separação foi realizada para permitir evolução independente das regras de elegibilidade e das regras de distribuição automática.