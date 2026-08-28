// Leitura do relatório de laudos do Órbita: os 17 casos abaixo existem porque
// CADA UM deles é um jeito de a migração do upload manual para a leitura
// automática falhar SEM ERRO VISÍVEL. Nenhum aparece se a gente só "trocar o
// upload por um select".
//
// O caso 1 é o mais caro: o PostgREST deste projeto corta em 1.000 linhas
// (max_rows em supabase/config.toml) e o relatório tem ~1.850. Sem paginação a
// resposta vem com 1.000 linhas e HTTP 200 — 850 laudos somem, os gaps encolhem
// 46% e a tela parece perfeitamente carregada.
//
// Roda no `npm test` (vitest), a partir de `frontend/`:
//
//   npx vitest run services/laudos/relatorio.test.ts
//
// O cliente Supabase é mockado — nenhum teste aqui toca a rede. O contrato com
// o banco real é assunto de contrato.test.ts.

import { test, expect, vi, afterEach } from "vitest"
import assert from "node:assert/strict"

import {
  buscarLaudosDoRelatorio, TABELA_IMPORTACOES, TABELA_RELATORIO,
} from "./relatorio"
import { isLaudoComAlta } from "../../lib/cronograma/helpers"
import type { LaudoRow } from "../../types/cronograma"

// ─── Mock do cliente ─────────────────────────────────────────────────────────

interface EstadoQuery {
  tabela: string
  colunas: string
  filtros: Record<string, unknown>
  ordem: Array<{ coluna: string; ascending?: boolean; nullsFirst?: boolean }>
  limite: number | null
  range: [number, number] | null
}

interface Resposta { data: unknown; error: { message: string } | null }

/**
 * Builder chainable e "thenable" — imita o suficiente do PostgREST para este
 * serviço: `.select().eq().order().limit()` e `.range()`, resolvendo com
 * `{data, error}` quando aguardado.
 */
function query(tabela: string, resolver: (e: EstadoQuery) => Resposta) {
  const estado: EstadoQuery = { tabela, colunas: "", filtros: {}, ordem: [], limite: null, range: null }
  const obj = {
    estado,
    select(colunas: string) { estado.colunas = colunas; return obj },
    eq(coluna: string, valor: unknown) { estado.filtros[coluna] = valor; return obj },
    order(coluna: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
      estado.ordem.push({ coluna, ...(opts ?? {}) }); return obj
    },
    limit(n: number) { estado.limite = n; return obj },
    range(de: number, ate: number) { estado.range = [de, ate]; return obj },
    then<R>(ok: (r: Resposta) => R, falha?: (e: unknown) => R) {
      return Promise.resolve().then(() => resolver(estado)).then(ok, falha)
    },
  }
  return obj
}

interface LinhaBanco { importacao_id: string; linha_numero: number; dados: LaudoRow }

interface Cenario {
  importacoes: Array<Record<string, unknown>>
  linhas: LinhaBanco[]
  /** Erro a devolver na N-ésima página (1-indexado) de orbita_laudos_relatorio. */
  erroNaPagina?: { pagina: number; message: string }
  erroImportacoes?: string
  /** Devolve as linhas na ordem crua do array, sem honrar o `.order` pedido. */
  ignorarOrdem?: boolean
}

/** Registra o que o serviço pediu ao banco — algumas asserções olham isto. */
interface Espiao { queries: EstadoQuery[] }

function clienteFake(cenario: Cenario): { cliente: unknown; espiao: Espiao } {
  const espiao: Espiao = { queries: [] }
  let paginas = 0

  const cliente = {
    from(tabela: string) {
      return query(tabela, estado => {
        espiao.queries.push(estado)

        if (tabela === TABELA_IMPORTACOES) {
          if (cenario.erroImportacoes) return { data: null, error: { message: cenario.erroImportacoes } }
          let linhas = cenario.importacoes
          // O serviço filtra por status e ordena por concluido_em desc.
          for (const [coluna, valor] of Object.entries(estado.filtros)) {
            linhas = linhas.filter(l => l[coluna] === valor)
          }
          const desc = estado.ordem.find(o => o.coluna === "concluido_em")?.ascending === false
          linhas = [...linhas].sort((a, b) => {
            const x = String(a.concluido_em ?? ""), y = String(b.concluido_em ?? "")
            return desc ? y.localeCompare(x) : x.localeCompare(y)
          })
          if (estado.limite !== null) linhas = linhas.slice(0, estado.limite)
          return { data: linhas, error: null }
        }

        if (tabela === TABELA_RELATORIO) {
          paginas++
          if (cenario.erroNaPagina && cenario.erroNaPagina.pagina === paginas) {
            return { data: null, error: { message: cenario.erroNaPagina.message } }
          }
          let linhas = cenario.linhas
          for (const [coluna, valor] of Object.entries(estado.filtros)) {
            linhas = linhas.filter(l => (l as unknown as Record<string, unknown>)[coluna] === valor)
          }
          if (!cenario.ignorarOrdem) {
            const asc = estado.ordem.find(o => o.coluna === "linha_numero")?.ascending !== false
            linhas = [...linhas].sort((a, b) => (asc ? 1 : -1) * (a.linha_numero - b.linha_numero))
          }
          const [de, ate] = estado.range ?? [0, linhas.length - 1]
          return { data: linhas.slice(de, ate + 1).map(l => ({ linha_numero: l.linha_numero, dados: l.dados })), error: null }
        }

        throw new Error(`tabela inesperada no teste: ${tabela}`)
      })
    },
  }

  return { cliente, espiao }
}

// ─── Fábricas de dado ────────────────────────────────────────────────────────

const IMPORTACAO = "11111111-1111-1111-1111-111111111111"

function importacao(over: Record<string, unknown> = {}) {
  return {
    id: IMPORTACAO,
    arquivo_nome: "relatorio_laudos_em_uso_20260827_144148.xls",
    concluido_em: "2026-08-27T14:42:00.000Z",
    total_linhas: 1850,
    status: "concluido",
    ...over,
  }
}

/** Linha realista — mesma forma do jsonb medido em produção. */
function linha(n: number, over: Partial<LaudoRow> = {}, importacaoId = IMPORTACAO): LinhaBanco {
  return {
    importacao_id: importacaoId,
    linha_numero: n,
    dados: {
      "ID Laudo": String(400 + n),
      "ID Favorecido": String(11000 + n),
      "Paciente": `Paciente ${n}`,
      "Plano": "ASSIM Saúde",
      "Data nasc.": "01/01/2019",
      "Situação": "Vigente",
      "Especialidade": "Arteterapia",
      "Qtd autorizada": "2",
      "Alta": "Não",
      "Data alta": "",
      ...over,
    } as LaudoRow,
  }
}

function linhas(quantidade: number, over: Partial<LaudoRow> = {}): LinhaBanco[] {
  return Array.from({ length: quantidade }, (_, i) => linha(i + 1, over))
}

function cenario(over: Partial<Cenario> = {}): Cenario {
  return { importacoes: [importacao()], linhas: [], ...over }
}

async function ler(c: Cenario) {
  const { cliente, espiao } = clienteFake(c)
  const resultado = await buscarLaudosDoRelatorio(cliente)
  return { ...resultado, espiao }
}

afterEach(() => { vi.restoreAllMocks() })

// ─── 1-3 · Paginação: a falha crítica ────────────────────────────────────────

test("1 · 1.850 linhas voltam TODAS as 1.850, não as 1.000 do teto do PostgREST", async () => {
  // O teste mais importante do arquivo. Sem paginação isto devolveria 1.000
  // linhas com HTTP 200 e ninguém saberia: 46% dos laudos perdidos em silêncio.
  const { rows, meta, espiao } = await ler(cenario({ linhas: linhas(1850) }))
  assert.equal(rows.length, 1850)
  assert.equal(meta.linhasLidas, 1850)

  const paginas = espiao.queries.filter(q => q.tabela === TABELA_RELATORIO)
  assert.deepEqual(paginas.map(p => p.range), [[0, 999], [1000, 1999]])
  // Ordem estável em TODA página — sem ela a própria paginação pula linha.
  for (const p of paginas) assert.ok(p.ordem.some(o => o.coluna === "linha_numero"), "faltou order(linha_numero)")
})

test("2 · exatamente 1.000 linhas: pede a segunda página e para no vazio", async () => {
  const { rows, espiao } = await ler(cenario({
    linhas: linhas(1000), importacoes: [importacao({ total_linhas: 1000 })],
  }))
  assert.equal(rows.length, 1000)
  // Página cheia é indistinguível de "acabou exatamente aqui": só a página
  // seguinte, vazia, prova o fim. Parar em `length === PAGE` seria o off-by-one.
  assert.equal(espiao.queries.filter(q => q.tabela === TABELA_RELATORIO).length, 2)
})

test("3 · exatamente 2.000 linhas (múltiplo exato) voltam completas", async () => {
  const { rows, espiao } = await ler(cenario({
    linhas: linhas(2000), importacoes: [importacao({ total_linhas: 2000 })],
  }))
  assert.equal(rows.length, 2000)
  assert.equal(espiao.queries.filter(q => q.tabela === TABELA_RELATORIO).length, 3)
})

// ─── 4-6 · Conferência de contagem ───────────────────────────────────────────

test("4 · importação sem nenhuma linha lança, não passa como sucesso", async () => {
  await expect(ler(cenario({ linhas: [], importacoes: [importacao({ total_linhas: 0 })] })))
    .rejects.toThrow(/nenhuma linha|vazia/i)
})

test("5 · lidas 1.700 mas total_linhas 1.850: lança", async () => {
  // Truncamento parcial — a rede final. Vale tanto para leitura truncada quanto
  // para carga do robô interrompida no meio.
  await expect(ler(cenario({ linhas: linhas(1700) })))
    .rejects.toThrow(/1700.*1850|lidas/i)
})

test("6 · total_linhas nulo não bloqueia: avisa em log e segue", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const { rows, meta } = await ler(cenario({
    linhas: linhas(1234), importacoes: [importacao({ total_linhas: null })],
  }))
  assert.equal(rows.length, 1234)
  assert.equal(meta.totalLinhas, null)
  assert.equal(meta.linhasLidas, 1234)
  assert.ok(warn.mock.calls.length > 0, "metadado ausente tem de deixar rastro no log")
})

// ─── 7-10 · Qual importação ──────────────────────────────────────────────────

test("7 · duas importações concluídas: usa só a de concluido_em mais recente", async () => {
  const antiga = "22222222-2222-2222-2222-222222222222"
  const { rows, meta } = await ler({
    importacoes: [
      importacao({ id: antiga, concluido_em: "2026-08-26T14:00:00.000Z", total_linhas: 3, arquivo_nome: "ontem.xls" }),
      importacao({ total_linhas: 2, arquivo_nome: "hoje.xls" }),
    ],
    linhas: [
      linha(1, { "Paciente": "De ontem 1" }, antiga),
      linha(2, { "Paciente": "De ontem 2" }, antiga),
      linha(3, { "Paciente": "De ontem 3" }, antiga),
      linha(1, { "Paciente": "De hoje 1" }),
      linha(2, { "Paciente": "De hoje 2" }),
    ],
  })
  assert.equal(meta.importacaoId, IMPORTACAO)
  assert.equal(meta.arquivoNome, "hoje.xls")
  assert.deepEqual(rows.map(r => r["Paciente"]), ["De hoje 1", "De hoje 2"])
})

test("8 · mais recente em_andamento: usa a anterior concluída", async () => {
  // O robô grava `iniciado_em` antes de terminar. Um relatório parcial é
  // indistinguível de um relatório completo pequeno — mesma classe de falha da
  // paginação esquecida.
  const emAndamento = "33333333-3333-3333-3333-333333333333"
  const { rows, meta } = await ler({
    importacoes: [
      importacao({ id: emAndamento, status: "em_andamento", concluido_em: "2026-08-28T09:00:00.000Z", total_linhas: 1, arquivo_nome: "parcial.xls" }),
      importacao({ total_linhas: 2, arquivo_nome: "completa.xls" }),
    ],
    linhas: [linha(1, { "Paciente": "Parcial" }, emAndamento), linha(1), linha(2)],
  })
  assert.equal(meta.arquivoNome, "completa.xls")
  assert.equal(rows.length, 2)
  assert.ok(!rows.some(r => r["Paciente"] === "Parcial"))
})

test("9 · nenhuma importação concluída lança erro explicativo", async () => {
  await expect(ler({ importacoes: [importacao({ status: "em_andamento" })], linhas: [linha(1)] }))
    .rejects.toThrow(/nenhuma importação/i)
  await expect(ler({ importacoes: [], linhas: [] }))
    .rejects.toThrow(/nenhuma importação/i)
})

test("10 · linhas de duas importações na tabela: filtra por importacao_id", async () => {
  const outra = "44444444-4444-4444-4444-444444444444"
  const { rows, espiao } = await ler({
    importacoes: [importacao({ total_linhas: 2 })],
    // Sem o filtro, o Math.max() do qtdAut misturaria snapshots de dias
    // diferentes e todo laudo apareceria duas vezes.
    linhas: [linha(1), linha(2), linha(1, { "Qtd autorizada": "99" }, outra), linha(2, {}, outra)],
  })
  assert.equal(rows.length, 2)
  assert.ok(!rows.some(r => r["Qtd autorizada"] === "99"))
  for (const q of espiao.queries.filter(q => q.tabela === TABELA_RELATORIO)) {
    assert.equal(q.filtros["importacao_id"], IMPORTACAO)
  }
})

// ─── 11 · O filtro proibido ──────────────────────────────────────────────────

test("11 · 1.000 Vencido + 850 Vigente voltam as 1.850 — 'Situação' não recorta nada", async () => {
  // Filtrar por situacao='Vigente' esconderia 54% da demanda real: a renovação
  // de laudo é controle administrativo PARALELO, o paciente segue sendo
  // atendido. Mesma decisão registrada em runAlgorithm.ts e calcularGaps.
  const todas = [
    ...Array.from({ length: 1000 }, (_, i) => linha(i + 1, { "Situação": "Vencido" })),
    ...Array.from({ length: 850 }, (_, i) => linha(1001 + i, { "Situação": "Vigente" })),
  ]
  const { rows, espiao } = await ler(cenario({ linhas: todas }))
  assert.equal(rows.length, 1850)
  assert.equal(rows.filter(r => r["Situação"] === "Vencido").length, 1000)
  for (const q of espiao.queries) {
    assert.ok(!("situacao" in q.filtros), "leitura NÃO pode filtrar por situacao")
    assert.ok(!("Situação" in q.filtros))
  }
})

// ─── 12-15 · O jsonb passa adiante como está ─────────────────────────────────

test("12 · 'Qtd autorizada' sai string \"2\", não número 2", async () => {
  const { rows } = await ler(cenario({
    linhas: [linha(1, { "Qtd autorizada": "2" })], importacoes: [importacao({ total_linhas: 1 })],
  }))
  assert.strictEqual(rows[0]["Qtd autorizada"], "2")
  assert.equal(typeof rows[0]["Qtd autorizada"], "string")
})

test("13 · campo vazio sai \"\", nunca 0 nem null", async () => {
  // `Number("")` é 0. Converter tipo aqui transformaria "sem nível de suporte"
  // em "nível 0" — e o mesmo vale para toda coluna vazia do relatório.
  const { rows } = await ler(cenario({
    linhas: [linha(1, { "Nível suporte": "", "Data alta": "", "Nº decisão judicial": "" })],
    importacoes: [importacao({ total_linhas: 1 })],
  }))
  assert.strictEqual(rows[0]["Nível suporte"], "")
  assert.strictEqual(rows[0]["Data alta"], "")
  assert.strictEqual(rows[0]["Nº decisão judicial"], "")
})

test("14 · datas continuam DD/MM/AAAA como texto, sem virar Date", async () => {
  // É o que `raw: true` garante no caminho manual e o que cFf/cFx esperam para
  // calcular faixa etária. "01/07/2026" reinterpretado seria 7 de janeiro.
  const { rows } = await ler(cenario({
    linhas: [linha(1, { "Data nasc.": "01/07/2026", "Data laudo": "01/07/2026", "Validade": "01/01/2027" })],
    importacoes: [importacao({ total_linhas: 1 })],
  }))
  assert.strictEqual(rows[0]["Data nasc."], "01/07/2026")
  assert.strictEqual(rows[0]["Data laudo"], "01/07/2026")
  assert.strictEqual(rows[0]["Validade"], "01/01/2027")
  assert.equal(typeof rows[0]["Data nasc."], "string")
})

test("15 · chaves do jsonb preservadas byte a byte, incluindo variantes de grafia", async () => {
  // O código lê `Alta`/`ALTA`/`alta` e `Data alta`/`DATA ALTA`/`Data Alta` com
  // `??`, porque o Excel já veio grafado de formas diferentes ao longo do tempo.
  // Quem escreve as chaves é o robô, a partir do `<th>` do Órbita: normalizar
  // aqui quebraria as variantes no dia em que o Órbita mudar a grafia.
  const CHAVES = [
    "ID Laudo", "ID Favorecido", "Paciente", "CPF", "Plano", "Data nasc.", "Idade",
    "Data laudo", "Validade", "Situação", "Autorizado em", "Comp. agressivo",
    "Paciente verbal", "Ambiente natural", "Nível suporte", "Especialidade",
    "Qtd laudo", "Qtd autorizada", "Alta", "Data alta", "Total laudo (solic.)",
    "Total laudo (aut.)", "Médico", "CRM/UF/CBO", "Coord. caso", "Nº decisão judicial",
  ]
  const dados = Object.fromEntries(CHAVES.map(k => [k, `v:${k}`])) as unknown as LaudoRow
  const { rows } = await ler(cenario({
    linhas: [{ importacao_id: IMPORTACAO, linha_numero: 1, dados }],
    importacoes: [importacao({ total_linhas: 1 })],
  }))
  assert.deepEqual(Object.keys(rows[0]), CHAVES)
  for (const k of CHAVES) assert.strictEqual(rows[0][k], `v:${k}`)

  // E as 6 variantes continuam chegando legíveis a quem as consome.
  for (const chave of ["Alta", "ALTA", "alta"]) {
    assert.equal(isLaudoComAlta({ [chave]: "Sim" }), true, chave)
  }
  for (const chave of ["Data alta", "DATA ALTA", "Data Alta"]) {
    assert.equal(isLaudoComAlta({ [chave]: "10/08/2026" }), true, chave)
  }
})

// ─── 16-17 · Ordem e erro no meio ────────────────────────────────────────────

test("16 · banco devolvendo fora de ordem: resultado sai ordenado por linha_numero", async () => {
  const { rows } = await ler({
    importacoes: [importacao({ total_linhas: 4 })],
    ignorarOrdem: true,
    linhas: [
      linha(3, { "Paciente": "Terceiro" }), linha(1, { "Paciente": "Primeiro" }),
      linha(4, { "Paciente": "Quarto" }), linha(2, { "Paciente": "Segundo" }),
    ],
  })
  assert.deepEqual(rows.map(r => r["Paciente"]), ["Primeiro", "Segundo", "Terceiro", "Quarto"])
})

test("17 · erro do Supabase no meio da paginação propaga, sem resultado parcial", async () => {
  // Devolver as 1.000 primeiras linhas "porque já tenho" é justamente o
  // resultado parcial silencioso que este serviço existe para impedir.
  await expect(ler(cenario({
    linhas: linhas(1850),
    erroNaPagina: { pagina: 2, message: "canceling statement due to statement timeout" },
  }))).rejects.toThrow(/timeout/)

  // E também na primeira página, e na leitura das importações.
  await expect(ler(cenario({ linhas: linhas(10), erroNaPagina: { pagina: 1, message: "boom" } })))
    .rejects.toThrow(/boom/)
  await expect(ler(cenario({ erroImportacoes: "sem permissão" })))
    .rejects.toThrow(/sem permissão/)
})
