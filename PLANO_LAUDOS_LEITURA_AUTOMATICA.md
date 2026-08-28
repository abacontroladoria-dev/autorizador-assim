# Plano — Substituir o upload manual do relatório de Laudos pela leitura automática

**Data:** 2026-08-27
**Escopo:** trocar a origem de `lRows` (`LaudoRow[]`) do upload manual do `.xls` do Órbita
para a leitura da tabela `orbita_laudos_relatorio` no Supabase.
**Fora de escopo:** a ingestão. O robô hospedado no Coolify já popula
`orbita_laudos_importacoes` + `orbita_laudos_relatorio` diariamente. Este plano
**apenas consome** o que ele grava.

---

## 0. Resumo executivo

Hoje toda tela do módulo Cronograma que precisa de laudos depende de alguém arrastar
um `.xls` para o badge no header. O robô do Coolify já coloca esse mesmo relatório no
Supabase todo dia. O trabalho é ligar um no outro.

O caminho é curto — o `dados` jsonb da tabela tem **exatamente** os mesmos cabeçalhos do
Excel, então a conversão para `LaudoRow` é praticamente identidade. Mas existe **uma
armadilha que quebraria tudo em silêncio** e é a razão principal deste documento existir:

> O PostgREST deste projeto corta a resposta em **1.000 linhas**, e a tabela tem **1.850**.
> Um `select()` ingênuo devolve 1.000 linhas, **HTTP 200, sem erro nenhum**, e o relatório
> de gaps encolhe 46% sem que ninguém perceba.

Medido em produção hoje (27/08/2026), não é hipótese — está na seção 2.A.

O plano tem 7 etapas de implementação e um plano de testes em 5 camadas, com um
**teste de equivalência** que compara linha a linha o resultado do upload manual contra
o resultado da leitura automática. Enquanto esse teste não passar com diferença zero,
não se troca a origem em produção.

---

## 1. Situação atual

### 1.1 O arquivo

`relatorio_laudos_em_uso_AAAAMMDD_HHMMSS.xls` — exportado do Órbita.

Apesar da extensão, **não é um XLS**: é uma tabela HTML com BOM UTF-8
(`<html><head><meta charset="UTF-8"/></head><body><table border="1">…`), lida em uma
única linha física de ~880 KB. O SheetJS aceita porque detecta HTML.

- 26 colunas, 1 `<tr>` de cabeçalho + ~1.849 `<tr>` de dados.
- **Sem `rowspan`/`colspan`** — verificado no arquivo de 27/08 15:25 (`grep -c rowspan` = 0).
- Todos os valores são texto; datas em `DD/MM/AAAA`.

Colunas, na ordem:

```
ID Laudo · ID Favorecido · Paciente · CPF · Plano · Data nasc. · Idade · Data laudo ·
Validade · Situação · Autorizado em · Comp. agressivo · Paciente verbal ·
Ambiente natural · Nível suporte · Especialidade · Qtd laudo · Qtd autorizada ·
Alta · Data alta · Total laudo (solic.) · Total laudo (aut.) · Médico · CRM/UF/CBO ·
Coord. caso · Nº decisão judicial
```

### 1.2 Como o upload funciona hoje

Existem **dois** pontos de entrada, ambos produzindo `LaudoRow[]`:

| # | Onde | Arquivo | Alcance |
|---|------|---------|---------|
| 1 | Badge "Selecionar Laudos" no header | [CronogramaDataLayout.tsx:149-169](frontend/components/cronograma/CronogramaDataLayout.tsx#L149-L169) | **Todas** as páginas sob o layout |
| 2 | Dropzone "Laudos / Autorizações" | [DadosUploadPanel.tsx:331-340](frontend/components/cronograma/solicitacoes/DadosUploadPanel.tsx#L331-L340) | Solicitações |

O layout é montado por dois `layout.tsx`:

- [app/(dashboard)/cronograma/layout.tsx](frontend/app/(dashboard)/cronograma/layout.tsx)
- [app/(dashboard)/relacionamento-prestador/(cronograma)/layout.tsx](frontend/app/(dashboard)/relacionamento-prestador/(cronograma)/layout.tsx)

Os dois usam o mesmo `parseXlsx` com `raw: true` (para não deixar o SheetJS reinterpretar
`01/07/2026` como 7 de janeiro) e o layout ainda chama `desfazerMerges` antes do
`sheet_to_json`.

O estado vive em [`CronogramaDataContext`](frontend/contexts/CronogramaDataContext.tsx)
como `lRows`, exposto por `useCronogramaData()`. **Não é persistido** — some a cada
refresh, e é por isso que o upload é refeito o tempo todo.

### 1.3 Quem consome `lRows`

13 pontos. Todos passam a ser servidos pela nova origem sem alteração de código:

**Lógica (`lib/cronograma/`)**
- `runAlgorithm.ts:81-118` — monta `qtdAut`, `altaAut`, `cM` (plano), `aM` (comp. agressivo), `fxM` (faixa etária), `altaSet`
- `simulacaoNovoPrestador.ts:131` — `calcularGaps`
- `sugestaoContratacao.ts:31,104,160` — `calcularGapMap`, `calcularTodosCombos`
- `inconsistencias.ts:45` — `detectarInconsistencias`
- `saida.ts:428,483` — `buildSaidaAnalise`
- `novoCronograma.ts:61,137,235,383` — `buildSugestoesManual` e afins

**Telas (`components/cronograma/`)**
- `ocupacao/OcupacaoShell.tsx:67,131` — dispara `runAlgorithm` + inconsistências
- `solicitacoes/OcupPacMode.tsx` (2317-2614, 2960-2964) — Ocupação de Paciente
- `solicitacoes/SaidaProfMode.tsx:453-646` — Saída de Profissional
- `solicitacoes/CriarNovoCronogramaPacMode.tsx:121-377`
- `solicitacoes/SimulacaoNovoPrestadorTab.tsx:709-711`
- `solicitacoes/OcupacaoCategoriaView.tsx:379-381`
- `solicitacoes/DisponibilidadeInternaView.tsx:187-188,401-405`

**Campos efetivamente lidos** (levantados por varredura de acessos `l["…"]`):

| Campo | Onde |
|---|---|
| `Paciente` | todos |
| `Especialidade` | todos |
| `Qtd autorizada` | todos |
| `Situação` | `runAlgorithm`, `inconsistencias`, `novoCronograma` |
| `Plano` | `runAlgorithm`, `inconsistencias`, `SaidaProfMode`, `OcupPacMode` |
| `Data nasc.` | `runAlgorithm` (faixa etária) |
| `Comp. agressivo` | `runAlgorithm` |
| `Alta` / `ALTA` / `alta` | `helpers.isLaudoComAlta`, `simulacaoNovoPrestador` |
| `Data alta` / `DATA ALTA` / `Data Alta` | idem |
| `ID Favorecido` / `Id Favorecido` / `id favorecido` | `OcupPacMode`, `CriarNovoCronogramaPacMode` |
| `Autorizado em` / `Autorizado Em` / `autorizado em` | `OcupPacMode` |
| `Qtd laudo` | `novoCronograma` |
| `ID Laudo` | `services/laudos/client.ts` (caminho da API do TI) |

As variantes de capitalização existem porque o Excel já veio grafado de formas
diferentes ao longo do tempo. **O caminho novo precisa preservá-las** (seção 2.G).

### 1.4 O que já existe no banco

Confirmado por consulta direta ao projeto `wmugemamnqxjfpxrlwes` em 27/08/2026.

**`orbita_laudos_importacoes`** — 1 linha
```
id              uuid
arquivo_nome    text     'relatorio_laudos_em_uso_20260827_144148.xls'
arquivo_sha256  text     '90425b3578d65075…'
sheet_name      text     'Sheet1'
headers         text[]   os 26 cabeçalhos, na ordem exata do Excel
total_linhas    int      1850
status          text     'concluido'
erro            text     null
iniciado_em     timestamptz
concluido_em    timestamptz
```

**`orbita_laudos_relatorio`** — 1.850 linhas
```
id              uuid
importacao_id   uuid   → orbita_laudos_importacoes.id
linha_numero    int    1..1850
dados           jsonb  ← a linha inteira, chaves = cabeçalhos do Excel, valores string
paciente        text   (desnormalizado)
especialidade   text   (desnormalizado)
qtd_autorizada  text   (desnormalizado)
situacao        text   (desnormalizado)
plano           text   (desnormalizado)
criado_em       timestamptz
```

Exemplo real de `dados`:

```json
{"CPF":"21306723701","Alta":"Não","Idade":"7","Plano":"ASSIM Saúde",
 "Médico":"Tatiana Aguiar Ribeiro","ID Laudo":"477","Paciente":"Adrian Araújo Nery",
 "Validade":"01/01/2027","Data alta":"","Qtd laudo":"2",
 "CRM/UF/CBO":"CRM: 521358758 - UF: RJ - CBO: 251510","Data laudo":"01/07/2026",
 "Data nasc.":"01/01/2019","Situação":"Vigente","Coord. caso":"Aline De Miranda Costa",
 "Autorizado em":"08/07/2026","Especialidade":"Arteterapia","ID Favorecido":"11511",
 "Nível suporte":"3","Qtd autorizada":"2","Comp. agressivo":"Sim",
 "Paciente verbal":"Não","Ambiente natural":"Não","Total laudo (aut.)":"30",
 "Total laudo (solic.)":"33","Nº decisão judicial":""}
```

**`dados` já é um `LaudoRow`.** A conversão é `row.dados as LaudoRow`.

### 1.5 Histórico: a API do TI

Em 2026-07-17 a busca automática via `cronogramauniversoaba.com.br/api_laudos` foi
desativada e o upload manual voltou como fluxo principal. O código está **comentado, não
removido**, em [CronogramaDataLayout.tsx:121-147](frontend/components/cronograma/CronogramaDataLayout.tsx#L121-L147),
e o efeito ativo hoje é só um `setUploadError(...)` que força o badge para o estado de erro
e faz aparecer o botão de upload.

Continuam intactos e sem chamador:
- [app/api/laudos/route.ts](frontend/app/api/laudos/route.ts) — `GET /api/laudos?inicio&fim`, responde `{ok, rows}`
- [services/laudos/client.ts](frontend/services/laudos/client.ts) — busca paciente a paciente na API do TI, 20 em paralelo

> **Nota:** o [REATIVAR_API_LAUDOS.md](frontend/app/(dashboard)/cronograma/REATIVAR_API_LAUDOS.md)
> manda editar `cronograma/layout.tsx`. Está desatualizado — o `useEffect` mudou de
> arquivo e hoje vive em `components/cronograma/CronogramaDataLayout.tsx`. O arquivo é
> apagado na Etapa 7.

**Este plano reaproveita a casca `/api/laudos` e troca só a implementação por baixo.**
É o contrato que o `useEffect` comentado já espera consumir.

---

## 2. Achados que mudam o desenho

Esta seção existe porque cada item abaixo é um jeito de a migração falhar **sem erro
visível**. Nenhum deles aparece se a gente só "trocar o upload por um select".

### 2.A · O PostgREST corta em 1.000 linhas, em silêncio ⚠️ CRÍTICO

Medido hoje contra produção:

```
GET /rest/v1/orbita_laudos_relatorio?select=id            → 1000 linhas, HTTP 200
GET …  + header  Range: 0-4999                            → 1000 linhas, HTTP 200
GET …  + header  Range: 0-0, Prefer: count=exact          → Content-Range: 0-0/1850
```

`max_rows = 1000` está fixado em [supabase/config.toml:17](supabase/config.toml#L17) e o
header `Range` **não** levanta o teto. São **850 linhas perdidas (46%)**, sem erro,
sem warning, sem nada.

O efeito rio abaixo: `qtdAut` fica menor → gaps somem → a tela mostra menos oportunidade
do que existe. É exatamente o tipo de bug que passa em revisão porque "a tela carregou e
tinha dados".

**Consequência para o desenho:** paginação é obrigatória, e a paginação precisa de
`order` estável, senão o próprio laço pula linha. O projeto já resolveu esse problema uma
vez — [`lib/grade/fonte.ts`](frontend/lib/grade/fonte.ts) tem `PAGE = 1000` e um laço
`range(from, from + PAGE - 1)` com `ordem` obrigatória, e o comentário em
[services/laudos/client.ts:52-54](frontend/services/laudos/client.ts#L52-L54) já registra
por quê ("uma linha pulada é um paciente inteiro sem laudo consultado"). Reusar o padrão.

### 2.B · `anon` e `authenticated` não têm acesso

```
GET /rest/v1/orbita_laudos_relatorio  (anon key)
→ 401  {"code":"42501","message":"permission denied for table orbita_laudos_relatorio"}
```

Note o código: `42501` é **falta de GRANT**, não RLS negando linha. O robô grava com
`service_role`, que ignora ambos.

Ou seja: o cliente do navegador (`getSupabaseClient()`) **não consegue ler essa tabela
hoje**, e isso não se resolve escrevendo uma policy — precisa de `GRANT SELECT` antes.
Isso empurra a Decisão 1 (seção 3.1).

### 2.C · Todos os valores do jsonb são string

Igual ao que o `raw: true` produz no caminho manual. `Qtd autorizada` chega `"2"`, não `2`.

Isso é **bom**: `LaudoRow` declara `"Qtd autorizada": string | number` e todos os
consumidores fazem `parseFloat(String(...))`. Não há divergência a corrigir — mas há uma
regressão a evitar: se alguém "melhorar" a conversão fazendo `Number(...)` nos campos
numéricos, campos vazios (`""`) viram `0` em vez de `NaN`→`0`… e `Nível suporte` vazio
viraria `0` em vez de `""`. **Não converter tipos. Passar o jsonb adiante como está.**

### 2.D · Datas continuam `DD/MM/AAAA` como texto

O `raw: true` existe no caminho manual justamente porque `01/07/2026` sem ele virava
7 de janeiro. O jsonb preserva o texto original, então o caminho novo **já nasce correto** —
mas `cFx()` em `runAlgorithm` (faixa etária, a partir de `Data nasc.`) continua esperando
`DD/MM/AAAA`. Se o robô um dia normalizar para ISO no jsonb, a faixa etária quebra.
Isso vira um teste de contrato (seção 5.2).

### 2.E · `Situação` não filtra nada — e não pode voltar a filtrar

1.000 das 1.850 linhas estão `Vencido` hoje. Decisão registrada em
[runAlgorithm.ts:90-101](frontend/lib/cronograma/runAlgorithm.ts#L90-L101) e repetida em
`calcularGaps`: a renovação de laudo é controle administrativo paralelo, o paciente segue
sendo atendido, a demanda é real.

**A leitura automática NÃO pode filtrar por `situacao='Vigente'`**, por mais tentador que
seja ter a coluna desnormalizada ali disponível. Seria esconder 54% da demanda.
Vira teste (seção 5.1).

### 2.F · O relatório não tem período — a grade tem

`/api/laudos` hoje recebe `?inicio=&fim=` porque o caminho da API do TI usava a janela para
descobrir *quais pacientes* consultar. A tabela do Órbita é um **snapshot completo**: não
existe recorte de data que faça sentido aplicar nela.

**Decisão:** manter os parâmetros na assinatura da rota (ignorados, aceitos por
compatibilidade) para não ter de mexer no `useEffect` do layout nem quebrar chamador
antigo. Documentar que são ignorados. Alternativa rejeitada: remover os parâmetros — muda
duas assinaturas para ganhar nada.

### 2.G · Variantes de capitalização das chaves

O código lê `Alta`/`ALTA`/`alta`, `ID Favorecido`/`Id Favorecido`/`id favorecido`,
`Autorizado em`/`Autorizado Em`/`autorizado em`, `Data alta`/`DATA ALTA`/`Data Alta`.

O jsonb de hoje usa **uma** grafia de cada (`Alta`, `ID Favorecido`, `Autorizado em`,
`Data alta`) — que por sorte é a primeira tentada em cada `??`. Funciona.

Mas isso é sorte, não garantia: quem escreve as chaves é o robô, a partir do `<th>` do
Órbita. **Não normalizar as chaves** no caminho de leitura (normalizar quebraria as
variantes se o Órbita mudar) e **não confiar** que só a grafia atual existirá.
Teste: alimentar `isLaudoComAlta` com as 6 variantes (seção 5.1).

### 2.H · As tabelas não existem no repositório

`rg -i "orbita_laudos"` no repo inteiro: **zero ocorrências**. Sem migration, sem entrada
em `types/supabase.ts`. Foram criadas direto no banco.

Isso é o mesmo drift já registrado em memória sobre o histórico de migrations. Não é
bloqueante para consumir, mas deixa a tabela sem contrato versionado — qualquer `db reset`
ou ambiente novo nasce sem ela. A Etapa 6 fecha isso com uma migration de reconciliação
idempotente (`CREATE TABLE IF NOT EXISTS`), que **descreve** o que já existe sem
recriar nem tocar em dado.

### 2.I · `desfazerMerges` vira código morto no caminho novo

A função em [CronogramaDataLayout.tsx:31-42](frontend/components/cronograma/CronogramaDataLayout.tsx#L31-L42)
existe para desfazer célula mesclada. O export real do Órbita **não tem `rowspan`**
(verificado), e o caminho novo nem passa por SheetJS.

**Não apagar.** O fallback manual continua existindo e continua precisando dela.
Apagar é economizar 12 linhas e reintroduzir um bug já corrigido.

### 2.J · Contagem: 1.850 linhas no banco vs 1.849 `<tr>` de dados no arquivo

O arquivo de 27/08 **15:25** tem 1.850 `<tr>`, dos quais 1 é cabeçalho → 1.849 de dados.
O banco tem 1.850 linhas, mas veio do arquivo de **14:41** — export diferente, uma hora
antes. Não há discrepância a investigar; há uma **armadilha de teste**: ao comparar
manual × automático, use o **mesmo arquivo** dos dois lados (seção 5.3), senão a
diferença de um laudo cadastrado no meio do caminho vira "bug" fantasma.

---

## 3. Arquitetura proposta

### 3.1 Decisão 1 — Ler pelo servidor, não pelo navegador

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **A. Route handler `/api/laudos` com `service_role`** | Sem migration; sem GRANT; sem RLS; contrato `{ok, rows}` já esperado pelo layout; paginação num lugar só, no servidor; a chave nunca sai do servidor | Sem realtime; ~1,5 MB de JSON por request | ✅ **Escolhida** |
| B. Cliente do navegador direto na tabela | Realtime possível; menos um hop | Exige `GRANT SELECT` + policy; expõe a tabela inteira ao `authenticated`; paginação replicada no cliente; **hoje dá 401** | ❌ |
| C. RPC `SECURITY DEFINER` | Contorna o GRANT; recorte controlado no SQL | `docs/warnings-supabase` já lista `SECURITY DEFINER` executável por `authenticated` como WARN aberto — criar mais uma anda para trás | ❌ |

**Escolhida: A.** Decisiva a favor: a casca já existe, o `useEffect` que a consome já está
escrito (comentado), e `supabaseService` já é um cliente lazy pronto
([lib/supabase/service.ts](frontend/lib/supabase/service.ts)). É a opção que troca **uma
função** e não mexe em segurança de banco.

Nota de segurança: isso não agrava a rotação pendente da `service_role` — a chave já é
usada por esta mesma rota hoje, no caminho da API do TI.

### 3.2 Decisão 2 — Qual importação ler

**A mais recente com `status = 'concluido'`.** Nunca a mais recente sem filtro.

O robô grava `iniciado_em` antes de terminar. Se a leitura pegar uma importação `em_andamento`,
o frontend vê um relatório **parcial** — e um relatório parcial é indistinguível de um
relatório completo pequeno. Mesma classe de falha do item 2.A.

```sql
select id, arquivo_nome, concluido_em, total_linhas
from orbita_laudos_importacoes
where status = 'concluido'
order by concluido_em desc nulls last
limit 1
```

Se não houver nenhuma → erro explícito, badge cai para o fallback manual.

### 3.3 Decisão 3 — Onde converter `dados` → `LaudoRow`

No servidor, dentro do serviço novo. O route handler devolve `LaudoRow[]` pronto, igual ao
caminho da API do TI. O frontend não aprende o formato do banco.

### 3.4 Fluxo

```
  Robô (Coolify, diário)
        │  baixa relatorio_laudos_em_uso_*.xls do Órbita
        ▼
  orbita_laudos_importacoes (status: em_andamento → concluido)
  orbita_laudos_relatorio   (1 linha por linha do Excel, dados jsonb)
        │
        │  ◄── ESCOPO DESTE PLANO COMEÇA AQUI
        ▼
  services/laudos/relatorio.ts        [NOVO]
        │  · última importação concluída
        │  · lê TODAS as linhas, paginado, ordenado por linha_numero
        │  · row.dados → LaudoRow (identidade)
        │  · valida quantidade contra total_linhas
        ▼
  app/api/laudos/route.ts             [ALTERADO]  → { ok, rows, meta }
        │
        ▼
  CronogramaDataLayout                [ALTERADO]  useEffect religado
        │
        ▼
  CronogramaDataContext.lRows  →  13 consumidores, sem alteração

  Fallback (inalterado): se a rota falhar, badge vira "Selecionar Laudos"
                         e o parseXlsx manual continua funcionando.
```

---

## 4. Etapas de implementação

### Etapa 1 — Serviço de leitura `services/laudos/relatorio.ts` 🆕

Arquivo novo, `import "server-only"`, ao lado do `client.ts` existente.

```ts
export interface MetaImportacaoLaudos {
  importacaoId: string
  arquivoNome: string
  concluidoEm: string | null
  totalLinhas: number
  linhasLidas: number
}

/** Última importação concluída. Lança se não houver nenhuma. */
async function buscarUltimaImportacao(): Promise<…>

/** Todas as linhas da importação, paginadas, ordenadas por linha_numero. */
async function buscarLinhas(importacaoId: string): Promise<LaudoRow[]>

/** Ponto único de entrada. */
export async function buscarLaudosDoRelatorio():
  Promise<{ rows: LaudoRow[]; meta: MetaImportacaoLaudos }>
```

Requisitos não-negociáveis:

1. **`PAGE = 1000`**, laço `range(from, from + PAGE - 1)` até vir página incompleta.
   Sem isso → 2.A.
2. **`.order("linha_numero")`** — obrigatório. Paginação sem ordem estável pula linha.
3. **Filtrar por `importacao_id`** — a tabela acumula histórico; sem o filtro, a segunda
   importação duplica todos os laudos e `Math.max()` no `qtdAut` passa a misturar
   snapshots de dias diferentes.
4. **Conferir `linhasLidas === total_linhas`.** Divergiu → lançar. É a rede de segurança
   final contra 2.A e contra importação truncada. Se `total_linhas` vier nulo, avisar em
   log e seguir (não bloquear por metadado ausente).
5. **Nenhuma conversão de tipo, nenhuma normalização de chave** (2.C, 2.G).
   `row.dados as LaudoRow`, ponto.
6. **Nenhum filtro por `situacao`** (2.E).
7. Log no mesmo estilo do `client.ts`: `[laudos:relatorio] importação <id> (<arquivo>) — N/M linhas`.

### Etapa 2 — Route handler `app/api/laudos/route.ts` ✏️

```ts
// inicio/fim continuam aceitos mas são IGNORADOS: o relatório do Órbita é um
// snapshot completo, não tem recorte por período (ver plano §2.F).
export async function GET() {
  try {
    const { rows, meta } = await buscarLaudosDoRelatorio()
    return NextResponse.json({ ok: true, rows, meta })
  } catch (e) {
    console.error("[api/laudos] falha ao ler relatório de laudos", e)
    return NextResponse.json({ ok: false, error: "falha_ao_ler_relatorio_laudos" }, { status: 500 })
  }
}
```

- Deixa de exigir `inicio`/`fim` (some o `400 parametros_obrigatorios_inicio_fim`).
- `meta` é aditivo — o `useEffect` que só lê `body.rows` continua válido.
- `buscarTodosLaudos` (API do TI) **fica** no `client.ts`, sem chamador, por enquanto.
  Removê-lo é decisão separada (Etapa 7).

### Etapa 3 — Religar o carregamento automático ✏️

Em [CronogramaDataLayout.tsx:121-147](frontend/components/cronograma/CronogramaDataLayout.tsx#L121-L147),
trocar o `setUploadError(...)` pelo fetch. Estrutura já pronta no bloco comentado:

```ts
useEffect(() => {
  if (laudosFetchedRef.current || lRows.length > 0) return
  laudosFetchedRef.current = true
  setUploading(true)
  setUploadError(null)
  fetch("/api/laudos")
    .then(async res => {
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) throw new Error("Não foi possível carregar os laudos automaticamente.")
      if (!body.rows?.length) throw new Error("Nenhum laudo encontrado no relatório do Órbita.")
      setLRows(body.rows as LaudoRow[])
      setLaudosMeta(body.meta ?? null)
    })
    .catch(e => {
      laudosFetchedRef.current = false  // permite nova tentativa via upload manual
      setUploadError(e instanceof Error ? e.message : "Erro ao carregar os laudos.")
    })
    .finally(() => setUploading(false))
}, [lRows.length, setLRows])
```

`laudosFetchedRef.current = false` no `catch` é o que mantém o fallback manual vivo —
preservar.

O `getRefWeek()` sai deste efeito (não há mais período a passar).

### Etapa 4 — `DadosUploadPanel` ✏️

A tela de Solicitações tem seu próprio dropzone. Com a leitura automática, `lRows` já chega
preenchido pelo contexto e o dropzone renderiza no estado "carregado" — mas mostrando
`fileName = null`.

Ajuste mínimo: quando `lRows.length > 0` e nenhum arquivo foi selecionado nesta sessão,
exibir a origem ("Órbita · <arquivoNome>" ou "Relatório do Órbita") no lugar do nome de
arquivo vazio. O botão "Selecionar arquivo XLSX" continua disponível para sobrepor.

Sem isso a tela fica com um card verde e uma linha em branco no meio.

### Etapa 5 — Badge: mostrar o frescor do dado ✏️

Em [CronogramaUploadBadges.tsx:111](frontend/components/cronograma/CronogramaUploadBadges.tsx#L111)
o badge diz `Laudos · 1.850 registros`.

Com carga diária automática, a pergunta que a pessoa passa a ter é **"de quando?"**.
Adicionar a data de `concluido_em` no `title` do badge e, se tiver mais de 48h,
um indicador visual (âmbar) — robô parado é falha silenciosa, e um badge verde com dado
de 5 dias atrás é pior do que erro.

Prop nova opcional `laudosMeta?: MetaImportacaoLaudos | null`, passada pelo layout.
Nada quebra em quem não passar.

### Etapa 6 — Migration de reconciliação + tipos 🆕

Fechar o drift de 2.H, **sem tocar em dado**:

`supabase/migrations/2026XXXXXXXXXX_orbita_laudos_reconciliacao.sql`
- `create table if not exists` das duas tabelas, refletindo o schema real
- índices: `orbita_laudos_relatorio(importacao_id, linha_numero)` e
  `orbita_laudos_importacoes(status, concluido_em desc)` — os dois caminhos de leitura
- `alter table … enable row level security` (já deve estar), **sem** `GRANT` para
  `anon`/`authenticated`: o acesso continua sendo só `service_role`, como está hoje
- comentário no topo explicando que o **escritor é o robô do Coolify**, não o repo

Regenerar `types/supabase.ts` depois.

> Aplicar **primeiro em staging**. O histórico de migrations deste projeto está
> dessincronizado; conferir com SQL direto (não REST) se a tabela já é rastreada antes
> de rodar.

### Etapa 7 — Limpeza ✏️

Só depois de a Etapa 3 estar validada em produção:

- Apagar [REATIVAR_API_LAUDOS.md](frontend/app/(dashboard)/cronograma/REATIVAR_API_LAUDOS.md) — instruções obsoletas apontando para arquivo errado
- Decidir sobre `services/laudos/client.ts` + `types.ts` (API do TI): sem chamador desde 17/07.
  **Recomendação: manter por um ciclo**, como segunda opção caso o robô do Coolify caia,
  e reavaliar em 30 dias. Anotar a data.
- **Manter** `desfazerMerges` e `parseXlsx` (2.I) — o fallback manual depende deles.

---

## 5. Plano de testes

> "Aplique testes para as lógicas não falharem." As cinco camadas abaixo cobrem,
> respectivamente: a lógica pura, o contrato com o banco, a equivalência com o fluxo
> antigo, as telas, e o que sobra em produção.

Ferramenta: **vitest** (`npm test` em `frontend/`). Convenção do repo: `*.test.ts`
colocado ao lado do fonte, imports relativos, sem arquivo de config.
Referência de estilo: `lib/remuneracao/rotulosExecucao.test.ts`.

### 5.1 Unitários — `services/laudos/relatorio.test.ts` 🆕

Cliente Supabase mockado. Estes são os testes que impedem as falhas silenciosas.

| # | Caso | Espera | Protege contra |
|---|---|---|---|
| 1 | Tabela com 1.850 linhas, páginas de 1.000 | retorna **1.850** | **2.A — a falha crítica** |
| 2 | Exatamente 1.000 linhas | retorna 1.000, **para no segundo fetch vazio** | off-by-one na condição de parada |
| 3 | Exatamente 2.000 linhas | retorna 2.000 | idem, no múltiplo exato |
| 4 | 0 linhas | lança erro claro | importação vazia passando como sucesso |
| 5 | Banco devolve 1.700 mas `total_linhas` = 1.850 | **lança** | truncamento parcial |
| 6 | `total_linhas` nulo | não lança; loga aviso | metadado ausente virar bloqueio |
| 7 | Duas importações concluídas | usa só a de `concluido_em` mais recente | mistura de snapshots |
| 8 | Mais recente é `em_andamento`; anterior `concluido` | usa a **anterior** | 3.2 — relatório parcial |
| 9 | Nenhuma importação `concluido` | lança erro claro | tela em branco sem explicação |
| 10 | Linhas de duas importações na tabela | filtra por `importacao_id` | duplicação de laudos |
| 11 | 1.000 `Vencido` + 850 `Vigente` | retorna **1.850** | **2.E — filtro proibido** |
| 12 | `dados` com `Qtd autorizada: "2"` | sai `"2"` (string), não `2` | 2.C |
| 13 | `dados` com `Nível suporte: ""` | sai `""`, não `0`/`null` | 2.C |
| 14 | `dados` com `Data nasc.: "01/07/2026"` | sai idêntico, sem virar Date | 2.D |
| 15 | Chaves do jsonb preservadas byte a byte | nenhuma normalizada | 2.G |
| 16 | Linhas chegando fora de ordem do banco | resultado ordenado por `linha_numero` | ordem instável na paginação |
| 17 | Erro do Supabase no meio da paginação | propaga, **não** devolve resultado parcial | parcial silencioso |

### 5.2 Contrato com o banco — `services/laudos/contrato.test.ts` 🆕

Roda contra o Supabase real. **Marcar `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`**
para não quebrar CI sem credencial.

| # | Verifica | Por quê |
|---|---|---|
| 18 | `headers` da última importação == os 26 nomes esperados, na ordem | Órbita mudar coluna é a falha nº 1 previsível |
| 19 | Toda chave de `LaudoRow` consumida pelo código existe no `dados` | renomear coluna no Órbita |
| 20 | Amostra de `Data nasc.`/`Data laudo`/`Validade` casa com `^\d{2}/\d{2}/\d{4}$` ou `""` | **2.D** — robô normalizar para ISO quebra a faixa etária |
| 21 | `paciente` desnormalizado == `dados->>'Paciente'` em toda linha | desnormalização divergindo do jsonb |
| 22 | Nenhuma linha com `dados->>'Paciente'` vazio | `runAlgorithm` descarta silenciosamente (`if (!pac) continue`) |
| 23 | `count(*)` da importação == `total_linhas` | integridade da carga do robô |

O teste 18 é o mais valioso do plano inteiro: é o único que **avisa antes** de o Órbita
mudar e quebrar tudo.

### 5.3 Equivalência manual × automático — `services/laudos/equivalencia.test.ts` 🆕

**O teste que autoriza a troca.** Prova que ninguém perde nada na migração.

Fixture: o `.xls` que originou a importação atual, commitado em
`frontend/services/laudos/__fixtures__/` (ou lido de caminho por env var, se o arquivo
for grande demais para o repo — decidir no momento).

```
1. Parse do .xls pelo MESMO caminho da produção
   (parseXlsx com raw:true + desfazerMerges)                        → manual[]
2. buscarLaudosDoRelatorio() da mesma importacao_id                 → auto[]
3. Assertivas:
   a) manual.length === auto.length
   b) para cada i: Object.keys(manual[i]) igual a Object.keys(auto[i])
   c) para cada i, cada chave: String(manual[i][k]) === String(auto[i][k])
4. E, o que realmente importa — mesmo resultado de negócio:
   runAlgorithm(cRowsFixo, manual, [], [], cfg)
     ≡ runAlgorithm(cRowsFixo, auto,   [], [], cfg)
   comparando allGaps ordenado por (pac, esp): aut, of, gap, prio, isAlta
   e também calcularGaps() e detectarInconsistencias()
```

⚠️ **Usar o arquivo exato da importação** (`arquivo_nome` + conferir `arquivo_sha256`).
Comparar contra um export de outra hora produz diferenças reais que parecem bug (2.J).

### 5.4 Testes manuais por tela

Depois de `npm run build` limpo. Para cada uma, **sem subir arquivo nenhum**:

| Tela | Verificar |
|---|---|
| `/cronograma/ocupacao` (Diferença: Laudo e Oferta) | badge verde sozinho; nº de gaps ≈ igual ao de antes com upload manual |
| `/cronograma/ocupacao` → Inconsistências | lista carrega |
| `/cronograma/ocupacao-paciente` | gaps por paciente; badge "Período" continua com `getJanelaOcupacaoPaciente()` |
| `/cronograma/saida-profissional` | análise de saída monta |
| Solicitações → Novo Cronograma | dropzone mostra origem, não linha em branco |
| Solicitações → Simulação de Novo Prestador | ⚠️ **não alterar nada nesta tela** (proibida por decisão anterior) — só conferir que os gaps aparecem |
| Solicitações → Ocupação por Categoria / Disponibilidade Interna | gapMap preenchido |
| `/cronograma/ocupacao-salas` | badge "Laudos" continua **oculto** (`showLaudos={false}`) |
| `/cronograma/indicadores` | segue gerenciando o próprio `rightContent` |
| `/relacionamento-prestador/*` | mesmo layout, mesmo comportamento |

**Teste de fallback:** derrubar a rota (renomear a tabela num banco de teste, ou forçar
500) e confirmar que o botão "Selecionar Laudos" volta e o upload manual ainda funciona
ponta a ponta.

**Teste de regressão de contagem:** anotar `lRows.length` e o total de gaps com upload
manual **antes** de trocar, e comparar depois. Se o número de linhas cair para 1.000,
é 2.A escapando.

### 5.5 Guard rails em produção

Testes não pegam robô parado. Três defesas em runtime:

1. **Conferência de contagem** no serviço (Etapa 1, item 4) — falha alto, não em silêncio.
2. **Badge com idade do dado** (Etapa 5) — âmbar acima de 48h.
3. **Log estruturado** em toda leitura: `importacao_id`, `arquivo_nome`, `concluido_em`,
   `linhas`. Sem isso, "os gaps estão estranhos" não tem como ser investigado depois.

---

## 6. Rollout

1. Etapas 1 + 2 (serviço + rota). Testes 5.1 verdes.
2. Teste 5.2 contra produção. Se o 18 falhar, **parar** — o Órbita mudou e o robô precisa
   de ajuste antes de qualquer coisa.
3. Teste 5.3 (equivalência). **Diferença zero é requisito de entrada** para a Etapa 3.
4. Etapa 3 em branch própria. `npm run build` real. Bateria 5.4 em localhost.
5. Validação do usuário. Build limpo é "pronto para testar", não "pronto para produção".
6. Etapas 4 e 5 (UX).
7. Etapa 6 (migration) — staging antes de produção, conferida por SQL direto.
8. Etapa 7 (limpeza) só após um ciclo estável.

**Rollback:** reverter a Etapa 3 (uma função no `CronogramaDataLayout`). O fallback manual
volta a ser o caminho principal na hora, sem migration para desfazer e sem dado para
restaurar. O risco desta mudança é baixo justamente por isso.

**Higiene de commit** (conforme prática registrada): `git status` arquivo a arquivo,
`git add` explícito, nunca `-A`/`.`. O working tree tem hoje `campos.tsx` e
`date-picker.tsx` modificados e um `APLICAR_1_pacientes_public_2026-08-26.sql` não
rastreado, **alheios a este esforço** — não podem entrar nos commits.

---

## 7. Riscos e pontos em aberto

| Risco | Impacto | Mitigação |
|---|---|---|
| Órbita muda/renomeia coluna | Campo some, gap zera em silêncio | Teste 18 (contrato de `headers`) |
| Robô do Coolify para | Dado congela, tela mostra verde | Badge com idade (Etapa 5) + guard rail 5.5 |
| Robô grava importação parcial | Menos gaps, sem erro | Filtro `status='concluido'` + conferência de contagem |
| Paginação esquecida em código futuro | −46% dos laudos | Teste 1 + `buscarLaudosDoRelatorio` como ponto único |
| Tabela cresce (histórico de importações) | Consulta lenta | Índice `(importacao_id, linha_numero)` na Etapa 6; avaliar retenção depois |
| `service_role` na rota | Superfície de chave | Já era assim antes; não agrava a rotação pendente |

**Em aberto, a decidir na execução:**

1. **Retenção do histórico.** A tabela acumula uma importação por dia (~1.850 linhas/dia
   ≈ 675 mil/ano). Precisa de política de expurgo? É do robô, não deste plano — mas
   convém combinar com quem o mantém.
2. **`arquivo_sha256`.** Já é gravado. Vale usá-lo para detectar "robô rodou mas o Órbita
   devolveu o mesmo arquivo de ontem"? Barato e útil, mas é escopo adicional.
3. **Fixture do teste 5.3.** O `.xls` tem ~880 KB. Commitar no repo ou apontar por env var?
4. **Sobreposição com `cadastros_pacientes_laudos`.** O cadastro de pacientes tem laudos
   próprios (PDF por paciente, com `em_uso`), alimentados à mão. É uma segunda fonte de
   verdade sobre a mesma realidade. Fora de escopo aqui, mas merece uma conversa depois.

---

## 8. Checklist

- [ ] **E1** `services/laudos/relatorio.ts` — paginado, ordenado, filtrado por importação, com conferência de contagem
- [ ] **T1** `relatorio.test.ts` — 17 casos, verde
- [ ] **E2** `app/api/laudos/route.ts` — nova implementação, `meta` no retorno
- [ ] **T2** `contrato.test.ts` — 6 casos contra produção; **teste 18 é bloqueante**
- [ ] **T3** `equivalencia.test.ts` — diferença zero, incluindo `runAlgorithm`
- [ ] **E3** `CronogramaDataLayout.tsx` — `useEffect` religado, fallback preservado
- [ ] **T4** `npm run build` limpo + bateria manual das 10 telas + teste de fallback
- [ ] Validação do usuário
- [ ] **E4** `DadosUploadPanel.tsx` — origem no card
- [ ] **E5** `CronogramaUploadBadges.tsx` — idade do dado
- [ ] **E6** Migration de reconciliação (staging → produção) + `types/supabase.ts`
- [ ] **E7** Apagar `REATIVAR_API_LAUDOS.md`; decidir sobre `client.ts` (rever em 30 dias)
