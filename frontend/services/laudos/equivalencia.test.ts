// Equivalência entre o upload manual do .xls e a leitura automática do banco —
// O TESTE QUE AUTORIZA A TROCA. Diferença zero é requisito para religar o
// carregamento automático no CronogramaDataLayout.
//
//   npx vitest run services/laudos/equivalencia.test.ts
//
// ─── Por que são TRÊS camadas, e não a comparação única do plano §5.3 ────────
//
// O plano §5.3 pede: parse do .xls que originou a importação × leitura do banco,
// diferença zero. Medido em 27/08/2026, esse arquivo é INALCANÇÁVEL por
// construção — não é um arquivo perdido:
//
//   • quem baixa o export do Órbita é o robô, e ele baixa o SEU export
//     (`relatorio_laudos_em_uso_20260827_144148.xls`, sha256 90425b35…);
//   • todo download manual gera um export NOVO, com outro timestamp e outro
//     conteúdo (medido: o de 15:25 tem 1.849 linhas contra 1.850 do banco —
//     um laudo do paciente 437 mudou de quantidade no meio do caminho);
//   • o robô guarda o sha256, não o arquivo.
//
// Então a camada A prova a MESMA coisa sem depender de qual snapshot é: ela
// injeta o .xls no formato que o robô grava e o lê de volta pelo serviço,
// exigindo diferença zero ESTRITA. É o que está sob nosso controle — paginação,
// ordem, identidade da conversão, ausência de coerção de tipo — e roda com
// QUALQUER export recente, offline, determinístico.
//
// A camada B é a comparação literal do plano, e só roda se algum dia o arquivo
// exato estiver à mão (sha256 conferido). Enquanto não estiver, pula avisando.
//
// A camada C é o que a A não alcança: o banco REAL, com o que o robô de fato
// gravou. Não pode exigir diferença zero (snapshots de horas diferentes), então
// exige as invariantes que não dependem do snapshot — mesma grafia de chave em
// toda linha, todo valor string, e divergência de conteúdo confinada a um
// limite pequeno. Truncamento de 46% (o risco de 2.A) reprova aqui na hora.
//
// A fidelidade da INGESTÃO daquele snapshot específico (xls do robô → jsonb) é
// o único elo que nenhuma das três fecha — é fora de escopo por desenho do
// plano, e está coberto de lado por contrato.test.ts contra o dado real.
//
// ─── Fixture ─────────────────────────────────────────────────────────────────
//
// Caminho em `LAUDOS_XLS_FIXTURE`, ou o default abaixo. NÃO é commitado, e não
// é por tamanho: o relatório traz nome de paciente e CPF de ~1.850 laudos, e
// isso não entra em repositório. Decide a pergunta aberta §7.3 do plano.

import { describe, test, beforeAll } from "vitest"
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import * as XLSX from "xlsx"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { buscarLaudosDoRelatorio, TABELA_IMPORTACOES } from "./relatorio"
import { runAlgorithm } from "../../lib/cronograma/runAlgorithm"
import { calcularGaps } from "../../lib/cronograma/simulacaoNovoPrestador"
import { detectarInconsistencias } from "../../lib/cronograma/inconsistencias"
import type { CsvRow, LaudoRow } from "../../types/cronograma"

dotenv.config({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)), quiet: true })

const URL_SB = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEM_BANCO = !!URL_SB && !!CHAVE

const FIXTURE = process.env.LAUDOS_XLS_FIXTURE
  ?? "C:/Users/Maquina001/Downloads/relatorio_laudos_em_uso_20260827_152528.xls"
const TEM_FIXTURE = existsSync(FIXTURE)

// ─── O caminho de produção do upload manual, replicado ───────────────────────
//
// `desfazerMerges` e `parseXlsx` vivem em components/cronograma/
// CronogramaDataLayout.tsx — client component, funções não exportadas, e
// `parseXlsx` recebe um `File` (FileReader), que não existe aqui. Réplica byte a
// byte de propósito: o valor deste teste depende de o lado "manual" ser
// exatamente o que a produção faz, então mudança lá tem de ser espelhada aqui.
// `raw: true` e `defval: ""` são a parte que não pode mudar — sem `raw`,
// "01/07/2026" é reinterpretado como 7 de janeiro.

function desfazerMerges(ws: XLSX.WorkSheet) {
  for (const m of ws["!merges"] ?? []) {
    const anchor = ws[XLSX.utils.encode_cell(m.s)]
    if (!anchor) continue
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (!ws[addr]) ws[addr] = { ...anchor }
      }
    }
  }
}

function parseXlsBuffer(buf: Uint8Array): LaudoRow[] {
  const wb = XLSX.read(buf, { type: "array", raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  desfazerMerges(ws)
  return XLSX.utils.sheet_to_json<LaudoRow>(ws, { defval: "" })
}

// ─── Banco fake para a camada A ──────────────────────────────────────────────

/**
 * Reordena as chaves como o Postgres faz ao guardar jsonb: por tamanho, depois
 * alfabética. Não é detalhe cosmético — é a diferença real entre os dois lados
 * (o `sheet_to_json` mantém a ordem das colunas do Excel) e o round-trip só
 * prova algo se carregar essa diferença de verdade.
 */
function comoJsonb(row: LaudoRow): LaudoRow {
  const chaves = Object.keys(row).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
  const out: Record<string, unknown> = {}
  for (const k of chaves) out[k] = row[k]
  return out as LaudoRow
}

const IMPORTACAO_FAKE = "0f0f0f0f-0000-4000-8000-000000000001"

/**
 * Cliente que devolve exatamente o que o robô teria gravado a partir deste
 * .xls, paginando de 1.000 em 1.000 como o PostgREST real e honrando o `order`
 * e o `eq(importacao_id)` pedidos. É o outro lado do round-trip.
 */
function bancoFake(rows: LaudoRow[]) {
  const linhas = rows.map((r, i) => ({ linha_numero: i + 1, dados: comoJsonb(r) }))
  const importacoes = [{
    id: IMPORTACAO_FAKE,
    arquivo_nome: FIXTURE.split(/[/\\]/).pop(),
    concluido_em: "2026-08-27T18:25:28.000Z",
    total_linhas: linhas.length,
    status: "concluido",
  }]

  const query = (tabela: string) => {
    const st = { filtros: {} as Record<string, unknown>, ordem: [] as string[], limite: 0, range: [0, 0] as [number, number] }
    const obj = {
      select() { return obj },
      eq(c: string, v: unknown) { st.filtros[c] = v; return obj },
      order(c: string) { st.ordem.push(c); return obj },
      limit(n: number) { st.limite = n; return obj },
      range(de: number, ate: number) { st.range = [de, ate]; return obj },
      then<R>(ok: (r: { data: unknown; error: null }) => R) {
        return Promise.resolve().then(() => {
          if (tabela === TABELA_IMPORTACOES) {
            const d = importacoes.filter(i => i.status === st.filtros["status"]).slice(0, st.limite || 1)
            return ok({ data: d, error: null })
          }
          assert.equal(st.filtros["importacao_id"], IMPORTACAO_FAKE, "leitura sem filtro de importação")
          assert.ok(st.ordem.includes("linha_numero"), "leitura sem order(linha_numero)")
          // Devolvida DESORDENADA de propósito dentro da página: a ordem final é
          // contrato do serviço, não sorte do banco.
          const pagina = linhas.slice(st.range[0], st.range[1] + 1)
          return ok({ data: [...pagina].reverse(), error: null })
        })
      },
    }
    return obj
  }

  return { from: (tabela: string) => query(tabela) }
}

// ─── Comparadores ────────────────────────────────────────────────────────────

const chavesOrdenadas = (o: LaudoRow) => Object.keys(o).sort()

function compararLinhas(a: LaudoRow[], b: LaudoRow[], estrito: boolean) {
  assert.equal(a.length, b.length, "quantidade de linhas")

  const chavesRuins: string[] = []
  const valoresRuins: string[] = []
  for (let i = 0; i < a.length; i++) {
    const ka = chavesOrdenadas(a[i]), kb = chavesOrdenadas(b[i])
    if (ka.join("\u0000") !== kb.join("\u0000")) {
      chavesRuins.push(`linha ${i + 1}: [${ka.join(", ")}] ≠ [${kb.join(", ")}]`)
      continue
    }
    for (const k of ka) {
      // Estrito compara tipo também. Medido no export de 27/08: `raw: true`
      // devolve string nos 26 campos, sem exceção — então o jsonb (string
      // sempre) é type-identical e não há razão para afrouxar para String().
      const iguais = estrito ? a[i][k] === b[i][k] : String(a[i][k] ?? "") === String(b[i][k] ?? "")
      if (!iguais) valoresRuins.push(`linha ${i + 1} · ${k}: ${JSON.stringify(a[i][k])} ≠ ${JSON.stringify(b[i][k])}`)
    }
  }
  assert.deepEqual(chavesRuins.slice(0, 5), [], `${chavesRuins.length} linhas com chaves divergentes`)
  assert.deepEqual(valoresRuins.slice(0, 10), [], `${valoresRuins.length} valores divergentes`)
}

/**
 * Uma grade sintética, usada IGUAL nos dois lados.
 *
 * `calcularGaps` devolve [] com cRows vazio, então uma grade é necessária para
 * o comparativo ter conteúdo. Derivada de UM dos lados e reutilizada no outro:
 * o que está sob teste é a origem dos laudos, e grade diferente entre os lados
 * inventaria diferença que não é de laudo. Cobre um terço das linhas, de
 * propósito — assim o resultado tem gap positivo, gap zerado e oferta sem
 * autorização, em vez de um único caso.
 */
function gradeSintetica(base: LaudoRow[]): CsvRow[] {
  const rows: CsvRow[] = []
  base.forEach((l, i) => {
    if (i % 3 !== 0) return
    const pac = String(l["Paciente"] ?? "").trim()
    if (!pac) return
    rows.push({
      "Nome Favorecido": pac,
      "Profissional": `Profissional ${i % 17}`,
      "Terapia": "Psicologia",
      "Dia da Semana": ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"][i % 5],
      "Hora Inicial": `${8 + (i % 8)}:00`,
      "Status do Agendamento": "Agendado",
      "Sala": "Unidade 1 - Sala 1",
    } as unknown as CsvRow)
  })
  return rows
}

const ordenarGaps = (gaps: ReturnType<typeof runAlgorithm>["allGaps"]) =>
  [...gaps]
    .sort((a, b) => a.pac.localeCompare(b.pac) || a.esp.localeCompare(b.esp))
    .map(g => ({ pac: g.pac, esp: g.esp, aut: g.aut, of: g.of, gap: g.gap, prio: g.prio, isAlta: !!g.isAlta }))

/** Compara o resultado de NEGÓCIO — o número que aparece na tela. */
function compararNegocio(manual: LaudoRow[], auto: LaudoRow[], grade: CsvRow[]) {
  const rM = runAlgorithm(grade, manual, [], [], {})
  const rA = runAlgorithm(grade, auto, [], [], {})
  assert.deepEqual(ordenarGaps(rA.allGaps), ordenarGaps(rM.allGaps))
  // cM (plano), fxM (faixa etária) e altaCount saem inteiramente dos laudos —
  // fxM é o que pegaria uma data normalizada para ISO.
  assert.deepEqual(rA.cM, rM.cM)
  assert.deepEqual(rA.fxM, rM.fxM)
  assert.equal(rA.altaCount, rM.altaCount)

  const gM = calcularGaps(manual, grade), gA = calcularGaps(auto, grade)
  assert.ok(gM.length > 0, "grade sintética não produziu gap nenhum — comparação vazia não prova nada")
  assert.deepEqual(gA, gM)

  assert.deepEqual(detectarInconsistencias(grade, auto), detectarInconsistencias(grade, manual))
}

// ─── Camada A · Round-trip determinístico, sem rede ──────────────────────────

describe.skipIf(!TEM_FIXTURE)("A · round-trip: .xls → formato do robô → serviço de leitura", () => {
  let manual: LaudoRow[]
  let auto: LaudoRow[]
  let grade: CsvRow[]

  beforeAll(async () => {
    const bytes = readFileSync(FIXTURE)
    manual = parseXlsBuffer(new Uint8Array(bytes))
    assert.ok(manual.length > 1000, `fixture com ${manual.length} linhas — precisa passar de 1.000 para exercitar a paginação`)
    auto = (await buscarLaudosDoRelatorio(bancoFake(manual))).rows
    grade = gradeSintetica(auto)
    console.log(`[equivalência A] ${FIXTURE.split(/[/\\]/).pop()} — ${manual.length} linhas, sha256 ${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}…`)
  }, 180_000)

  test("24 · mesma quantidade de linhas, mesmas chaves, mesmos valores — estrito", () => {
    // Estrito: mesmo tipo, não só mesmo texto. E a ordem sobrevive à
    // reordenação de chave do jsonb e à página devolvida invertida.
    compararLinhas(manual, auto, true)
  })

  test("25 · nenhum valor deixou de ser string no caminho", () => {
    // A regressão que 2.C descreve: `Number("")` viraria 0 e "sem nível de
    // suporte" passaria a ser "nível 0".
    const naoString: string[] = []
    for (let i = 0; i < auto.length; i++) {
      for (const [k, v] of Object.entries(auto[i])) {
        if (typeof v !== "string") naoString.push(`linha ${i + 1} · ${k}: ${typeof v}`)
      }
    }
    assert.deepEqual(naoString.slice(0, 10), [], `${naoString.length} valores fora de string`)
  })

  test("26 · resultado de negócio idêntico (runAlgorithm, calcularGaps, inconsistências)", () => {
    compararNegocio(manual, auto, grade)
  })
})

// ─── Camada B · A comparação literal do plano §5.3 ───────────────────────────

describe.skipIf(!TEM_BANCO || !TEM_FIXTURE)("B · o .xls exato da importação × o banco real", () => {
  let sb: SupabaseClient
  let importacao: Record<string, unknown> | undefined
  let shaFixture = ""
  let confere = false

  beforeAll(async () => {
    sb = createClient(URL_SB!, CHAVE!, { auth: { persistSession: false } })
    const { data, error } = await sb
      .from(TABELA_IMPORTACOES)
      .select("id, arquivo_nome, arquivo_sha256, total_linhas")
      .eq("status", "concluido")
      .order("concluido_em", { ascending: false, nullsFirst: false })
      .limit(1)
    if (error) throw new Error(error.message)
    importacao = (data ?? [])[0] as Record<string, unknown> | undefined
    shaFixture = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex")
    confere = !!importacao && shaFixture === importacao.arquivo_sha256
  }, 120_000)

  test("27 · diferença zero contra a importação que originou o arquivo", async () => {
    if (!confere) {
      // NÃO reprova: o arquivo do robô não é obtenível por download manual (ver
      // o cabeçalho). Reprovar deixaria a suíte vermelha para sempre por um
      // motivo que não é defeito. A camada A cobre o que é nosso.
      console.warn(
        `[equivalência B] PULADO — o fixture não é o arquivo desta importação.\n` +
        `  banco:   ${importacao?.arquivo_nome} · sha256 ${importacao?.arquivo_sha256}\n` +
        `  fixture: ${FIXTURE.split(/[/\\]/).pop()} · sha256 ${shaFixture}\n` +
        `  Para rodar: reingerir por LAUDOS_XLS_FIXTURE um arquivo que você tenha, ou apontar o do robô.`,
      )
      return
    }
    const manual = parseXlsBuffer(new Uint8Array(readFileSync(FIXTURE)))
    const auto = (await buscarLaudosDoRelatorio(sb)).rows
    compararLinhas(manual, auto, true)
    compararNegocio(manual, auto, gradeSintetica(auto))
  }, 180_000)
})

// ─── Camada C · Invariantes contra o banco real, com drift tolerado ──────────

describe.skipIf(!TEM_BANCO || !TEM_FIXTURE)("C · o banco real × um export de outra hora", () => {
  let manual: LaudoRow[]
  let auto: LaudoRow[]
  /** `ID Laudo` que mudou entre os dois exports — linha somada, retirada ou editada. */
  let laudosComDrift: Set<string>
  let pacientesComDrift: Set<string>
  /** Pares (ID Laudo, Especialidade) comparados campo a campo fora do drift. */
  let paresConferidos = 0

  /** Um laudo é identificado por `ID Laudo`; uma LINHA, pelo par com a especialidade. */
  const idLaudo = (r: LaudoRow) => String(r["ID Laudo"] ?? "")
  const par = (r: LaudoRow) => `${idLaudo(r)}¦${String(r["Especialidade"] ?? "")}`

  beforeAll(async () => {
    const sb = createClient(URL_SB!, CHAVE!, { auth: { persistSession: false } })
    manual = parseXlsBuffer(new Uint8Array(readFileSync(FIXTURE)))
    auto = (await buscarLaudosDoRelatorio(sb)).rows

    // O drift é apurado por LAUDO, não por linha: quando o Órbita edita um
    // laudo entre um export e outro, ele muda várias linhas de uma vez (as
    // quantidades de cada especialidade e os totais do laudo). Confinar a
    // tolerância ao laudo inteiro é o que permite exigir identidade ESTRITA em
    // todo o resto — que é onde está o valor deste caso.
    const porParM = new Map(manual.map(r => [par(r), r]))
    const porParA = new Map(auto.map(r => [par(r), r]))
    laudosComDrift = new Set<string>()

    for (const [k, m] of porParM) {
      const a = porParA.get(k)
      if (!a) { laudosComDrift.add(idLaudo(m)); continue }
      for (const campo of chavesOrdenadas(m)) {
        if (m[campo] !== a[campo]) { laudosComDrift.add(idLaudo(m)); break }
      }
    }
    for (const [k, a] of porParA) if (!porParM.has(k)) laudosComDrift.add(idLaudo(a))

    pacientesComDrift = new Set(
      [...manual, ...auto].filter(r => laudosComDrift.has(idLaudo(r))).map(r => String(r["Paciente"] ?? "")),
    )

    console.log(
      `[equivalência C] manual ${manual.length} × banco ${auto.length} linhas · ` +
      `drift em ${laudosComDrift.size} laudo(s) / ${pacientesComDrift.size} paciente(s): ` +
      `${[...pacientesComDrift].join(", ") || "nenhum"}`,
    )
  }, 180_000)

  test("28 · mesma grafia de chave em toda linha, dos dois lados", () => {
    // Independe de snapshot: chave renomeada no Órbita reprova aqui.
    const esperadas = chavesOrdenadas(manual[0]).join("\u0000")
    const ruins: string[] = []
    for (const [rotulo, lista] of [["manual", manual], ["banco", auto]] as const) {
      lista.forEach((r, i) => {
        if (chavesOrdenadas(r).join("\u0000") !== esperadas) ruins.push(`${rotulo} linha ${i + 1}`)
      })
    }
    assert.deepEqual(ruins.slice(0, 5), [], `${ruins.length} linhas com conjunto de chaves diferente`)
  })

  test("29 · contagem do banco não pode encolher para o teto do PostgREST", () => {
    // A rede contra 2.A na comparação com o dado real: 1.000 redondo, ou uma
    // diferença grande contra o arquivo, é truncamento — não drift de uma hora.
    assert.notEqual(auto.length, 1000, "1.000 linhas exatas é a assinatura do corte do PostgREST")
    const diferenca = Math.abs(auto.length - manual.length)
    assert.ok(
      diferenca <= Math.ceil(manual.length * 0.01),
      `banco ${auto.length} × arquivo ${manual.length} linhas: diferença de ${diferenca} passa de 1% e não é explicável por drift entre exports`,
    )
  })

  test("30 · divergência confinada a um punhado de laudos, não sistêmica", () => {
    // Tolerância deliberada e limitada: entre o export do robô e o download
    // manual passa tempo, e laudo mexido nesse intervalo é diferença REAL. O
    // que este caso garante é que a divergência tem TAMANHO de drift — qualquer
    // mudança sistêmica (formato de data, coerção de tipo, chave normalizada,
    // filtro de situação, truncamento) atinge laudo demais e reprova.
    const linhasAfetadas = [...manual, ...auto].filter(r => laudosComDrift.has(idLaudo(r))).length
    const total = manual.length + auto.length
    assert.ok(
      linhasAfetadas <= Math.ceil(total * 0.01) && pacientesComDrift.size <= 5,
      `${laudosComDrift.size} laudo(s) / ${pacientesComDrift.size} paciente(s) / ${linhasAfetadas} linha(s) ` +
      `divergentes de ${total} — esperado drift pontual entre exports, não mudança sistêmica. ` +
      `Pacientes: ${[...pacientesComDrift].slice(0, 8).join(", ")}`,
    )
  })

  test("31 · fora dos laudos com drift, todo campo de toda linha bate — estrito", () => {
    // O complemento do 30, e a parte forte: tolerar drift NÃO é tolerar
    // divergência de campo. Todo laudo que não mudou entre os exports tem de
    // estar idêntico nos 26 campos, com o mesmo tipo. Hoje isso vale para ~99%
    // do relatório — é a prova de equivalência que o arquivo do robô, se
    // estivesse à mão, daria para 100%.
    const porPar = new Map(auto.map(r => [par(r), r]))
    const ruins: string[] = []
    paresConferidos = 0

    for (const m of manual) {
      if (laudosComDrift.has(idLaudo(m))) continue
      const a = porPar.get(par(m))
      assert.ok(a, `par ${par(m)} sem drift registrado mas ausente do banco — apuração de drift furada`)
      paresConferidos++
      for (const k of chavesOrdenadas(m)) {
        if (m[k] !== a![k]) ruins.push(`${par(m)} · ${k}: ${JSON.stringify(m[k])} ≠ ${JSON.stringify(a![k])}`)
      }
    }

    assert.deepEqual(ruins.slice(0, 10), [], `${ruins.length} campos divergentes fora do drift`)
    assert.ok(
      paresConferidos >= manual.length * 0.95,
      `só ${paresConferidos} de ${manual.length} linhas conferidas campo a campo — cobertura insuficiente para provar equivalência`,
    )
    console.log(`[equivalência C] ${paresConferidos} linhas conferidas campo a campo, zero divergência`)
  })
})

test.skipIf(TEM_FIXTURE)("equivalência pulada: fixture .xls ausente", () => {
  assert.ok(!TEM_FIXTURE)
  console.warn(`[equivalência] pulado — .xls não encontrado: ${FIXTURE}. Aponte um export recente em LAUDOS_XLS_FIXTURE.`)
})
