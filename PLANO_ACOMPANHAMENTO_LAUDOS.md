# Acompanhamento de Laudos — plano

Branch: `Acompanhamento-laudos`. Rota nova: `/acompanhamento/laudos`.

Objetivo: dar à RECEPÇÃO uma fila de laudos **vencidos** e um lugar para
registrar **quando ela avisou o responsável** — com trilha completa de quem
mexeu, quando e o que mudou.

---

## 1. O que os dados dizem (medido em 28/08/2026, não suposto)

Sondagem direta em `orbita_laudos_relatorio` / `orbita_laudos_importacoes`
(service_role, PostgREST paginado). Números reais da importação
`relatorio_laudos_em_uso_20260828_092347.xls`:

| Fato | Valor | Por que importa |
|---|---|---|
| Linhas | 1.849 | O `max_rows = 1000` do PostgREST corta em silêncio — paginar é obrigatório |
| `ID Laudo` distintos | **343** | A tela tem 343 cards, não 1.849 |
| `ID Favorecido` distintos | **343** | **1 laudo por paciente**, 1:1 — nenhum favorecido com 2 laudos |
| Linhas por laudo | até 11 | Uma linha por especialidade; o laudo é o mesmo |
| Campos uniformes dentro de um `ID Laudo` | **100%** | `Data laudo`, `Validade`, `Autorizado em`, `Situação`, `Paciente`, `ID Favorecido` não variam entre as linhas de um laudo. O card pode ler qualquer linha do grupo sem ambiguidade |
| `Situação` por laudo | 140 Vigente / **203 Vencido** | A fila de trabalho é 203 |
| `Situação` × cálculo por `Validade` | **0 divergências** | O rótulo do Órbita bate com `Validade >= hoje` em 343/343 |
| Campos vazios (`Data laudo`, `Validade`, `Autorizado em`, `Paciente`, `ID Favorecido`) | **0** | Não há caso de dado ausente a tratar |
| `ID Laudo` estável entre as duas importações | **343 de 343**, nenhum só numa | 👈 **é isto que sustenta o plano** |
| `ID Favorecido` que casa com `pacientes.tita_paciente_id` | 285 de 343 | 58 laudos são de paciente sem cadastro no Pulsar — **57 deles vencidos** |
| Pacientes casados inativos | 0 | "ATIVO" hoje é uniforme; o campo fica, porque amanhã não será |
| Pacientes com foto | 1 | A foto compartilhada funciona, mas é quase toda de iniciais hoje |

### A chave estável

O desafio que você levantou — "o robô deleta e recria" — se resolve com um fato
medido: **`ID Laudo` sobrevive entre importações**. Ele é o id do laudo no
Órbita, não um id de linha. `orbita_laudos_relatorio.id` (uuid) e
`importacao_id` **não** sobrevivem, e por isso nada nosso vai apontar para eles.

Regra do plano: **nossa tabela referencia `id_laudo` (texto) e mais nada do
Órbita.** Se o robô apagar a importação inteira e recriar, nosso registro
continua colado no laudo certo.

E ainda assim guardamos um **snapshot** dos campos do laudo no momento do
registro (nome, validade, situação, autorizado em). Dois motivos: se o laudo
desaparecer do relatório (renovado, paciente saiu), o histórico continua
legível; e dá para mostrar "quando a recepção avisou, a validade era X".

---

## 2. Arquitetura

```
orbita_laudos_relatorio (robô, service_role, só leitura)
        │  343 laudos, agrupados por ID Laudo
        ▼
/api/acompanhamento-laudos  ← rota de servidor (a chave nunca vai ao browser)
        │  junta 3 fontes:
        ├── relatório do Órbita ....... ID PAC, ID LAU, NOME, Data laudo, Validade, Autorizado em, Situação
        ├── public.pacientes .......... ATIVO, foto_path (join por tita_paciente_id = ID Favorecido)
        └── public.laudos_acompanhamento  Mensagem enviada em, quem registrou, quando
        ▼
/acompanhamento/laudos  ← grade de cards igual a /cadastros/pacientes
```

**Por que rota de servidor:** `orbita_laudos_*` é `service_role` only (medido:
401/42501 com anon key). O browser não lê essas tabelas nem com RLS aberto —
falta GRANT. Já existe `/api/laudos` no mesmo formato; a nova rota é irmã dela,
com projeção diferente (agrupada por laudo, sem as 26 colunas).

**Foto compartilhada:** nada a construir. A foto vive em
`pacientes.foto_path` (bucket privado `pacientes-fotos`) e a tela reusa
`FotoPacienteUpload` + `getFotoUrlAssinada`. Alterar aqui altera lá porque é a
mesma coluna, a mesma linha, o mesmo bucket — não há cópia.

---

## 3. Banco de dados

### 3.1 `public.laudos_acompanhamento` — o estado atual (tabela nova)

Uma linha por laudo, criada na primeira vez que alguém registra algo.

```
id_laudo            text  PRIMARY KEY   -- ID Laudo do Órbita. A chave estável.
id_favorecido       bigint              -- ID Favorecido; cruza com pacientes.tita_paciente_id
paciente_id         bigint  → pacientes(id_paciente)  -- nulo nos 58 sem cadastro

mensagem_enviada_em date                -- ← O CAMPO. Calendário manual da recepção.
observacao          text                -- opcional, texto livre

-- snapshot do laudo no último save (não é fonte de verdade; é memória)
snap_paciente_nome  text
snap_data_laudo     date
snap_validade       date
snap_situacao       text
snap_autorizado_em  date

criado_em / criado_por_id / criado_por_nome
atualizado_em / atualizado_por_id / atualizado_por_nome
atualizado_em_brasilia text   -- trigger, igual a cadastros_auditoria
```

- **`id_laudo` como PK**: um laudo, um registro. Idempotente por construção — o
  save é upsert, não insert.
- `paciente_id` é FK **opcional**: 58 laudos não têm paciente no Pulsar, e a fila
  da recepção não pode depender de o cadastro estar completo.
- `atualizado_por_nome` denormalizado ao lado do id, mesma razão de
  `cadastros_auditoria.usuario_nome`: a trilha tem que continuar legível se o
  usuário for renomeado ou removido.
- RLS: SELECT/INSERT/UPDATE para `authenticated` com
  `usuario_tem_permissao('acompanhamento_laudos')`.
  ⚠️ Lembrete do projeto: **RLS bloqueando write não gera erro visível** — a
  gravação "funciona" e não grava. Testar o save com um usuário real de recepção
  antes de dizer que está pronto, e pré-checar quem tem override explícito
  (`usuario_tem_permissao` ignora `roleDefaults`).

### 3.2 Histórico — **reusar `cadastros_auditoria`**, não criar tabela nova

A tabela de trilha certa já existe e já é a que abastece o modal de
`/cadastros/pacientes` (`20260826120000`): `tabela` discrimina a entidade,
`antes`/`depois` em jsonb, `resumo` legível gravado pronto, `criado_em_brasilia`
por trigger, **insert-only sem policy de UPDATE/DELETE**.

Criar uma segunda tabela significaria duas consultas e uma ordenação no cliente
para responder "o que aconteceu com este paciente" — exatamente o que o
comentário daquela migration diz que ela existe para evitar. E o histórico do
laudo *é* histórico do paciente.

Migration aditiva:
1. `tabela` ganha o valor `'laudo_acompanhamento'` no CHECK.
2. As policies de SELECT/INSERT ganham o ramo
   `tabela = 'laudo_acompanhamento' and usuario_tem_permissao('acompanhamento_laudos')`.

⚠️ Precedente que essa migration precisa respeitar: o CHECK de `tabela` em
produção já ficou semanas sem conhecer `'laudo'` e `'alta_individualidade'`, e
**todo insert de trilha era rejeitado em silêncio** (morria em `console.error`).
Hoje há `avisarFalhaDeTrilha` com toast — mas o teste de aceite abaixo confere o
CHECK aplicado, não só o código.

Com isso, cada mínima alteração fica registrada: quem, quando (data/hora de
Brasília), campo a campo `antes → depois`, e o `resumo` pronto na linha.

### 3.3 Nada é escrito em `orbita_laudos_*`

Nem coluna, nem trigger, nem update. Aquelas tabelas são do robô — a migration
`20260828100000` já grava isso no banco. Nosso lado é 100% leitura.

---

## 4. Tela

### 4.1 Card — molde de `/cadastros/pacientes`

Mesmo `<li>` clicável, mesmo hover (`-translate-y-1.5`), avatar 96px com foto
assinada ou iniciais pastel (`getTomAvatar`/`iniciaisDe`), `<hr>`, `<dl>` de
linhas ícone + rótulo + valor. Grid `sm:2 lg:3 xl:4 2xl:5`, 75 por página, busca
com debounce de 200ms no header — tudo idêntico, porque é a mesma tela irmã.

Campos (os seus, na ordem pedida):

```
┌──────────────────────────────────────┐
│ ID PAC 11511          [Vencido] [Ativo]   ← selos: situação do laudo + do paciente
│ LAU 477                              │
│            ( foto 96px )             │
│        Adrian Araújo Nery            │
│ ──────────────────────────────────── │
│ 📅 Data laudo      01/07/2026        │
│ ⏳ Validade        01/01/2027        │
│ ✔️ Autorizado em   08/07/2026        │
│ ──────────────────────────────────── │
│ ✉️ Avisado em      —  (ou 14/08/2026)│
└──────────────────────────────────────┘
```

- **Vigente/Vencido**: selo em destaque. Fonte = `Situação` do relatório
  (confere com `Validade` em 343/343), com o cálculo por `Validade` como
  conferência — divergir vira aviso, não silêncio.
- **ATIVO (PACIENTE)**: verde/vermelho como no cadastro. Nos 58 sem cadastro,
  selo neutro **"Sem cadastro"** — eles aparecem porque a fila vem do relatório,
  e 57 deles estão vencidos.
- **Avisado em** é a linha que a recepção olha: `—` grita pendência aberta.
- ⚠️ Não repetir o erro da barra de unidade: o número do selo e o número do
  filtro têm que ser a MESMA contagem, medida no mesmo lugar.

### 4.2 Filtros — molde de `auditoria-assim?tab=auditoria`

Barra `rounded-2xl` com `bg-white/90 backdrop-blur`, controles `h-11`, ícone
`lucide` embutido à esquerda, grid que só vira faixa única em `xl`.

- **KPI cards clicáveis são o filtro de situação** (padrão já decidido lá: o
  card é o número que motiva o filtro, então um `<select>` paralelo seria a
  segunda porta que ninguém usa):
  `Vencidos 203` · `Vigentes 140` · `Vencidos sem aviso` · `Avisados`
- Busca por nome / ID PAC / ID LAU (debounce, sobre a lista inteira — nunca
  sobre a página).
- Janela de `Validade` (de/até) e de `Avisado em`.
- Situação do paciente: Ativos / Inativos / Sem cadastro (complementares, como
  o `FiltroSituacao` do cadastro).
- Ordenação: Validade ↑ (default — mais vencido primeiro), Nome, Avisado em.

**Default da tela: `Vencidos`.** É o objetivo principal; abrir em "todos"
faria a recepção filtrar a mesma coisa todo dia.

### 4.3 Registrar o aviso

Clicar no card abre modal (`ScheduleModal`, o mesmo do resto):

- `<input type="date">` **Mensagem enviada em** (o calendário manual).
- Observação opcional.
- Rodapé: **quem registrou e quando** — `Registrado por Fulano · 14/08/2026 14:32`.
- Botão **Histórico** → `HistoricoCadastrosModal` filtrado neste laudo, com toda
  alteração de todo usuário.

Salvar faz upsert em `laudos_acompanhamento` + insert em `cadastros_auditoria`
(ação `criar` na primeira vez, `editar` depois). Auditoria **nunca derruba a
ação principal** e nunca é silenciosa — `avisarFalhaDeTrilha` já resolve os dois.

### 4.4 Sidebar

Grupo **Pacientes**, no fim (depois de Autorizações Avulsas), rótulo
**"Acompanhamento de Laudos"**, ícone `FileClock`. Código de permissão novo
`acompanhamento_laudos → ['/acompanhamento/laudos']` em `CODIGO_PARA_ROTAS`,
mais entrada no `pathIconMap`.

---

## 5. Etapas

| # | Entrega | Arquivos |
|---|---|---|
| 1 | Migration: `laudos_acompanhamento` + RLS | `supabase/migrations/2026082815xxxx_create_laudos_acompanhamento.sql` |
| 2 | Migration aditiva: `'laudo_acompanhamento'` no CHECK e nas policies de `cadastros_auditoria` | `…_cadastros_auditoria_laudo_acompanhamento.sql` |
| 3 | Leitura agrupada por `ID Laudo` + junção com `pacientes` e com o acompanhamento | `services/laudos/acompanhamento.ts`, `app/api/acompanhamento-laudos/route.ts` |
| 4 | Escrita (upsert) + trilha | `services/laudosAcompanhamento.service.ts`, labels em `lib/cadastros/auditoriaFormat.ts`, `types/auditoria.ts` |
| 5 | Tela: página, grade de cards, KPIs/filtros, modal | `app/(dashboard)/acompanhamento/laudos/page.tsx`, `components/acompanhamento/laudos/*` |
| 6 | Sidebar + permissão | `components/Sidebar.tsx`, `lib/permissions/routes.ts` |
| 7 | Testes: agrupamento, vigente/vencido, sobrevivência à troca de importação | `services/laudos/acompanhamento.test.ts` |

Etapas 1–2 são migration; aplicar exige o canal de sempre (sem SQL direto nesta
máquina — validar com `libpg-query` e aplicar pelo caminho combinado).

## 6. Aceite

1. Abrir a tela → 203 cards vencidos, ordenados por validade mais antiga.
2. Registrar aviso num laudo → card mostra a data; recarregar mantém.
3. Trocar a data com OUTRO usuário → histórico mostra as duas linhas, com nome,
   data/hora de Brasília e `antes → depois`.
4. **Rodar o robô (nova importação)** → o aviso continua no laudo certo. É o
   teste que valida a chave estável; sem ele o plano é só teoria.
5. Trocar a foto aqui → aparece em `/cadastros/pacientes`, e vice-versa.
6. Um laudo que sai do relatório → não aparece na tela, e o histórico dele
   continua consultável.
