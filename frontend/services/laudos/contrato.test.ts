// Contrato com o banco real — os 6 casos abaixo (18 a 23, na numeração do
// plano) não testam o NOSSO código: testam se o relatório que o robô do Coolify
// grava continua sendo o relatório que este código sabe ler.
//
// O teste 18 é o mais valioso do conjunto: é o único que AVISA ANTES de o
// Órbita mudar uma coluna e o gap zerar em silêncio. Se ele reprovar, o
// problema é a montante — o robô precisa de ajuste antes de qualquer coisa
// nossa.
//
// Roda contra produção, então é pulado inteiro sem credencial (CI):
//
//   npx vitest run services/laudos/contrato.test.ts
//
// Credenciais vêm de frontend/.env.local, o mesmo arquivo que o `next dev` usa.

import { describe, test, beforeAll, expect } from "vitest"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { buscarLaudosDoRelatorio, TABELA_IMPORTACOES, TABELA_RELATORIO } from "./relatorio"
import type { LaudoRow } from "../../types/cronograma"

dotenv.config({ path: fileURLToPath(new URL("../../.env.local", import.meta.url)), quiet: true })

const URL_SB = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEM_CREDENCIAL = !!URL_SB && !!CHAVE

/**
 * Os 26 cabeçalhos do export do Órbita, na ordem exata. Mudou aqui = mudou lá.
 * NÃO "corrigir" esta lista para fazer o teste 18 passar: o certo é conferir o
 * que o Órbita passou a exportar e ajustar o robô.
 */
const HEADERS_ESPERADOS = [
  "ID Laudo", "ID Favorecido", "Paciente", "CPF", "Plano", "Data nasc.", "Idade",
  "Data laudo", "Validade", "Situação", "Autorizado em", "Comp. agressivo",
  "Paciente verbal", "Ambiente natural", "Nível suporte", "Especialidade",
  "Qtd laudo", "Qtd autorizada", "Alta", "Data alta", "Total laudo (solic.)",
  "Total laudo (aut.)", "Médico", "CRM/UF/CBO", "Coord. caso", "Nº decisão judicial",
]

/**
 * Chaves que o código de fato LÊ do LaudoRow — levantadas por varredura dos 13
 * consumidores de `lRows`. Variantes de grafia (`ALTA`, `Id Favorecido`, …) não
 * entram: são fallbacks de `??`, só uma de cada grupo precisa existir.
 */
const CHAVES_CONSUMIDAS = [
  "Paciente", "Especialidade", "Qtd autorizada", "Situação", "Plano", "Data nasc.",
  "Comp. agressivo", "Alta", "Data alta", "ID Favorecido", "Autorizado em",
  "Qtd laudo", "ID Laudo",
]

const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/

describe.skipIf(!TEM_CREDENCIAL)("contrato do relatório de laudos com o Supabase", () => {
  let sb: SupabaseClient
  let importacao: Record<string, unknown>
  let rows: LaudoRow[]
  /** Linhas cruas, para comparar jsonb × colunas desnormalizadas. */
  let cruas: Array<{ linha_numero: number; paciente: string | null; dados: Record<string, unknown> }>

  beforeAll(async () => {
    sb = createClient(URL_SB!, CHAVE!, { auth: { persistSession: false } })

    const { data, error } = await sb
      .from(TABELA_IMPORTACOES)
      .select("id, arquivo_nome, arquivo_sha256, headers, total_linhas, status, concluido_em")
      .eq("status", "concluido")
      .order("concluido_em", { ascending: false, nullsFirst: false })
      .limit(1)
    if (error) throw new Error(error.message)
    importacao = (data ?? [])[0] as Record<string, unknown>
    assert.ok(importacao, "nenhuma importação concluída no banco — nada a contratar")

    const lido = await buscarLaudosDoRelatorio(sb)
    rows = lido.rows

    // Paginado à mão, de propósito: é a leitura crua (com as colunas
    // desnormalizadas) que o serviço não expõe. Sem paginar, pararia em 1.000.
    cruas = []
    for (let from = 0; ; from += 1000) {
      const pagina = await sb
        .from(TABELA_RELATORIO)
        .select("linha_numero, paciente, dados")
        .eq("importacao_id", importacao.id as string)
        .order("linha_numero", { ascending: true })
        .range(from, from + 999)
      if (pagina.error) throw new Error(pagina.error.message)
      const lote = (pagina.data ?? []) as typeof cruas
      cruas.push(...lote)
      if (lote.length < 1000) break
    }

    console.log(
      `[contrato] importação ${importacao.id} (${importacao.arquivo_nome}) — ${rows.length} linhas, sha256 ${String(importacao.arquivo_sha256).slice(0, 16)}…`,
    )
  }, 120_000)

  test("18 · headers da última importação são os 26 esperados, na ordem — BLOQUEANTE", () => {
    // Reprovou? PARE. O Órbita mudou coluna e o robô precisa de ajuste antes de
    // qualquer mudança no frontend. Um campo que some zera gap em silêncio.
    assert.deepEqual(importacao.headers, HEADERS_ESPERADOS)
  })

  test("19 · toda chave consumida pelo código existe no jsonb de toda linha", () => {
    const faltando = new Map<string, number>()
    for (const r of rows) {
      for (const k of CHAVES_CONSUMIDAS) {
        if (!(k in r)) faltando.set(k, (faltando.get(k) ?? 0) + 1)
      }
    }
    assert.deepEqual([...faltando.entries()], [], "chave consumida ausente no jsonb")
  })

  test("20 · datas continuam DD/MM/AAAA (ou vazias), nunca ISO", () => {
    // Se o robô um dia normalizar para ISO, cFx() para de calcular faixa etária
    // e ninguém vê erro nenhum — só faixa faltando na tela.
    const fora: string[] = []
    for (const r of rows) {
      for (const campo of ["Data nasc.", "Data laudo", "Validade", "Data alta", "Autorizado em"]) {
        const v = r[campo]
        if (v === undefined || v === null || v === "") continue
        if (!DATA_BR.test(String(v))) fora.push(`${r["Paciente"]} · ${campo} = ${String(v)}`)
      }
    }
    assert.deepEqual(fora.slice(0, 10), [], `${fora.length} valores de data fora de DD/MM/AAAA`)
  })

  test("21 · coluna desnormalizada `paciente` bate com dados->>'Paciente' em toda linha", () => {
    const divergentes = cruas.filter(l => (l.paciente ?? "") !== String(l.dados["Paciente"] ?? ""))
    assert.deepEqual(
      divergentes.slice(0, 5).map(l => `linha ${l.linha_numero}: "${l.paciente}" ≠ "${l.dados["Paciente"]}"`),
      [],
      `${divergentes.length} linhas com desnormalização divergindo do jsonb`,
    )
  })

  test("22 · nenhuma linha com Paciente vazio", () => {
    // runAlgorithm faz `if (!pac) continue` — linha sem paciente é laudo
    // descartado sem aviso.
    const vazias = rows
      .map((r, i) => ({ i, pac: String(r["Paciente"] ?? "").trim() }))
      .filter(x => !x.pac)
    assert.deepEqual(vazias.slice(0, 5), [], `${vazias.length} linhas sem Paciente`)
  })

  test("23 · count(*) da importação é igual a total_linhas", async () => {
    const { count, error } = await sb
      .from(TABELA_RELATORIO)
      .select("id", { count: "exact", head: true })
      .eq("importacao_id", importacao.id as string)
    if (error) throw new Error(error.message)
    assert.equal(count, importacao.total_linhas)
    // E o que o serviço entregou é exatamente isso — a prova de que a paginação
    // não perdeu nada contra o banco real, e não só contra o mock.
    assert.equal(rows.length, count)
  })
})

// Sem credencial o arquivo inteiro é pulado; este caso registra o motivo em vez
// de o arquivo aparecer vazio no relatório da suíte.
test.skipIf(TEM_CREDENCIAL)("contrato pulado: SUPABASE_SERVICE_ROLE_KEY ausente", () => {
  expect(TEM_CREDENCIAL).toBe(false)
})
