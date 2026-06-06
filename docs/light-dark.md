# FEATURE: Theme Switcher (Light / Dark)

## Objetivo

Implementar alternância entre tema claro (Light) e tema escuro (Dark) na plataforma PULSAR.

A funcionalidade deve ser global para todo o sistema e persistir a escolha do usuário entre sessões.

---

## Localização

Adicionar o seletor de tema na sidebar esquerda.

Posicionamento:

* Após o último item do menu ("Administração")
* Antes da linha divisória que separa o menu do bloco do usuário

Estrutura atual:

Dashboard
Pacientes
Terapêutico
Gestão
Operações
Administração

[ THEME SWITCHER ]

---

Caio
Administrador

---

## Componente Escolhido

Utilizar o modelo:

"Segmentado com Ícones"

Opções:

☀️ Light
🌙 Dark

Sem opção "Sistema".

---

## Comportamento

### Light Mode Ativo

* Fundo do controle: branco
* Botão ativo: Light
* Ícone do Sol destacado
* Ícone da Lua neutro

### Dark Mode Ativo

* Fundo do controle: escuro
* Botão ativo: Dark
* Ícone da Lua destacado
* Ícone do Sol neutro

---

## Requisitos de UX

O usuário deve identificar instantaneamente:

* Qual tema está ativo
* Que existe uma segunda opção disponível

Evitar:

* Switches tradicionais
* Checkboxes
* Dropdowns
* Menus adicionais

O componente deve ser visível permanentemente.

---

## Persistência

Salvar a preferência no navegador.

Sugestão:

localStorage

Chave:

theme

Valores possíveis:

light
dark

Ao carregar a aplicação:

1. Ler localStorage
2. Aplicar tema salvo
3. Caso não exista valor:

   * utilizar light como padrão

---

# Ajustes do Light Mode

## Problema Atual

A sidebar possui visual excessivamente escuro.

Quando o restante da interface está clara, o contraste fica agressivo e visualmente pesado.

---

## Novo Visual da Sidebar (Light Mode)

Substituir o azul escuro por um tom neutro claro.

Exemplos:

Background:

#F8FAFC

ou

#F1F5F9

Borda:

#E2E8F0

---

## Itens de Menu

Estado normal:

Texto:
#334155

Ícones:
#64748B

---

## Item Ativo

Background:

#DBEAFE

Texto:

#1D4ED8

Ícone:

#2563EB

Border radius deve permanecer igual ao atual.

---

## Logo

Preparar suporte para duas versões:

logo-dark.svg
logo-light.svg

Troca automática conforme o tema.

---

## Escopo

Aplicar suporte a tema em:

* Sidebar
* Header
* Cards
* Inputs
* Selects
* Modais
* Tabelas
* Badges
* Botões

---

## Critérios de Aceitação

✓ Usuário consegue alternar entre Light e Dark

✓ Tema permanece após atualizar a página

✓ Tema permanece após logout/login

✓ Sidebar Light possui aparência suave e corporativa

✓ Componente de troca fica localizado acima do bloco do usuário

✓ Não existe opção "Sistema"

✓ Layout mantém identidade visual do PULSAR

✓ Contraste e acessibilidade permanecem adequados

---

## Referência Visual

Utilizar o mockup aprovado:

"Mockup 01 — Segmentado com Ícones"

Este mockup é a fonte de verdade para espaçamento, hierarquia visual e comportamento do componente.
