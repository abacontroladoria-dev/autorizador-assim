import "server-only"

import { supabaseService } from "@/lib/supabase/service"
import type { LaudoRow, MetaImportacaoLaudos } from "@/types/cronograma"

// Reexportado por conveniência de quem já importa daqui; o tipo mora em
// types/cronograma.ts porque o badge do header (componente cliente) também o
// consome, e este módulo é `server-only`.
export type { MetaImportacaoLaudos }

// ─── Leitura do relatório de laudos do Órbita gravado no Supabase ────────────
//
// Quem ESCREVE estas duas tabelas é um robô hospedado no Coolify, diariamente:
// ele baixa o `relatorio_laudos_em_uso_*.xls` do Órbita e grava uma linha por
// linha do Excel. Este arquivo só LÊ. Nada aqui cria, atualiza ou apaga dado, e
// as tabelas não têm migration no repo (foram criadas direto no banco).
//
// Substitui o upload manual do .xls como origem de `lRows` (LaudoRow[]). O
// upload manual continua existindo como fallback — ver CronogramaDataLayout.
//
// Três armadilhas que fariam esta leitura falhar EM SILÊNCIO, e por isso são
// tratadas aqui e não em quem chama:
//
//   1. O PostgREST deste projeto corta a resposta em 1.000 linhas
//      (`max_rows = 1000` em supabase/config.toml) e o relatório tem ~1.850.
//      Um `select()` ingênuo devolve 1.000 linhas com HTTP 200, sem erro nenhum
//      — 46% dos laudos desaparecem, `qtdAut` encolhe e a tela mostra menos
//      oportunidade do que existe. Daí a paginação obrigatória, com ordem
//      estável (sem `order`, o próprio laço pula linha), e daí a conferência de
//      contagem contra `total_linhas` no fim: é a rede que grita se algum dia
//      alguém "simplificar" o laço. Mesmo defeito, mesma solução, que
//      lib/grade/fonte.ts já resolveu para a grade.
//
//   2. A importação mais recente pode estar EM ANDAMENTO. O robô grava
//      `iniciado_em` antes de terminar, e um relatório parcial é
//      indistinguível de um relatório completo pequeno. Só `status =
//      'concluido'` entra.
//
//   3. A tabela ACUMULA histórico (uma importação por dia). Sem filtrar por
//      `importacao_id`, todo laudo aparece N vezes e o `Math.max()` do
//      `qtdAut` passa a misturar snapshots de dias diferentes.
//
// E duas coisas que este arquivo deliberadamente NÃO faz:
//
//   • Não filtra por `situacao`. Tentador — a coluna está desnormalizada ali —
//     e errado: 1.000 das 1.850 linhas estão 'Vencido', e a renovação de laudo
//     é controle administrativo PARALELO (o paciente segue sendo atendido).
//     Filtrar esconderia 54% da demanda. Mesma decisão registrada em
//     runAlgorithm.ts e calcularGaps.
//   • Não converte tipo nem normaliza chave do jsonb. `dados` JÁ É um
//     `LaudoRow`: as chaves são os cabeçalhos do Excel, os valores são todos
//     string (igual ao que `raw: true` produz no caminho manual) e as datas
//     continuam "DD/MM/AAAA" como texto — que é o que `cFx()` espera para a
//     faixa etária. "Melhorar" isso com `Number(...)` transformaria
//     `Nível suporte: ""` em `0`, e normalizar chave quebraria as variantes de
//     grafia que o código lê com `??` (`Alta`/`ALTA`/`alta`,
//     `ID Favorecido`/`Id Favorecido`/…), cuja fonte é o `<th>` do Órbita e
//     pode mudar sem aviso. A conversão é identidade: `row.dados as LaudoRow`.

/** Teto de linhas por resposta do PostgREST — ver armadilha 1 no cabeçalho. */
const PAGE = 1000

export const TABELA_IMPORTACOES = "orbita_laudos_importacoes"
export const TABELA_RELATORIO = "orbita_laudos_relatorio"

// O builder do PostgREST não tem tipo público estável que sobreviva a
// `.select().eq().order().range()` encadeados; o projeto já usa `any` nesses
// pontos (ver lib/grade/fonte.ts). Isolado aqui, some dos chamadores.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = any

interface ImportacaoLaudos {
  id: string
  arquivo_nome: string | null
  concluido_em: string | null
  total_linhas: number | null
}

/**
 * A importação mais recente CONCLUÍDA. Nunca a mais recente sem filtro — ver
 * armadilha 2 no cabeçalho. Lança se não houver nenhuma: tela em branco sem
 * explicação é pior do que erro, e o erro é o que devolve o upload manual.
 */
async function buscarUltimaImportacao(sb: ClienteSupabase): Promise<ImportacaoLaudos> {
  const { data, error } = await sb
    .from(TABELA_IMPORTACOES)
    .select("id, arquivo_nome, concluido_em, total_linhas")
    .eq("status", "concluido")
    .order("concluido_em", { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) throw new Error(`[laudos:relatorio] falha ao ler ${TABELA_IMPORTACOES}: ${error.message}`)

  const importacao = (data ?? [])[0] as ImportacaoLaudos | undefined
  if (!importacao?.id) {
    throw new Error(
      "[laudos:relatorio] nenhuma importação de laudos concluída encontrada — o robô do Órbita pode não ter rodado.",
    )
  }
  return importacao
}

interface LinhaRelatorio {
  linha_numero: number | null
  dados: LaudoRow | null
}

/**
 * TODAS as linhas da importação, paginadas e ordenadas por `linha_numero`.
 *
 * A ordenação é pedida ao banco (ela é o que torna a paginação estável) e
 * reaplicada no fim sobre o resultado inteiro: a ordem é contrato desta função,
 * não detalhe de como o banco respondeu.
 */
async function buscarLinhas(sb: ClienteSupabase, importacaoId: string): Promise<LaudoRow[]> {
  const todas: LinhaRelatorio[] = []

  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from(TABELA_RELATORIO)
      .select("linha_numero, dados")
      .eq("importacao_id", importacaoId)
      .order("linha_numero", { ascending: true })
      .range(from, from + PAGE - 1)

    // Propaga em vez de devolver o que já tem: resultado parcial silencioso é
    // exatamente a falha que este arquivo existe para impedir.
    if (error) throw new Error(`[laudos:relatorio] falha ao ler ${TABELA_RELATORIO}: ${error.message}`)

    const pagina = (data ?? []) as LinhaRelatorio[]
    todas.push(...pagina)
    if (pagina.length < PAGE) break
    from += PAGE
  }

  todas.sort((a, b) => (a.linha_numero ?? 0) - (b.linha_numero ?? 0))
  // Identidade — ver o cabeçalho. Nenhuma conversão, nenhuma normalização.
  return todas.map(l => (l.dados ?? {}) as LaudoRow)
}

/** Ponto único de entrada. Passar `cliente` só em teste ou fora de request. */
export async function buscarLaudosDoRelatorio(
  cliente?: ClienteSupabase,
): Promise<{ rows: LaudoRow[]; meta: MetaImportacaoLaudos }> {
  const sb: ClienteSupabase = cliente ?? supabaseService

  const importacao = await buscarUltimaImportacao(sb)
  const rows = await buscarLinhas(sb, importacao.id)

  const arquivoNome = importacao.arquivo_nome ?? "(sem nome)"
  const totalLinhas = importacao.total_linhas ?? null

  if (rows.length === 0) {
    throw new Error(
      `[laudos:relatorio] importação ${importacao.id} (${arquivoNome}) não tem nenhuma linha — importação vazia não é sucesso.`,
    )
  }

  // A rede de segurança final contra truncamento (armadilha 1) e contra carga
  // interrompida do robô. Metadado ausente não bloqueia — só avisa.
  if (totalLinhas === null) {
    console.warn(
      `[laudos:relatorio] importação ${importacao.id} (${arquivoNome}) sem total_linhas — seguindo com ${rows.length} linhas, sem conferência de contagem.`,
    )
  } else if (rows.length !== totalLinhas) {
    throw new Error(
      `[laudos:relatorio] importação ${importacao.id} (${arquivoNome}): lidas ${rows.length} linhas, esperadas ${totalLinhas}. Leitura truncada ou carga incompleta — abortando para não encolher o relatório em silêncio.`,
    )
  }

  console.log(
    `[laudos:relatorio] importação ${importacao.id} (${arquivoNome}) — ${rows.length}/${totalLinhas ?? "?"} linhas, concluída em ${importacao.concluido_em ?? "(sem data)"}`,
  )

  return {
    rows,
    meta: {
      importacaoId: importacao.id,
      arquivoNome,
      concluidoEm: importacao.concluido_em ?? null,
      totalLinhas,
      linhasLidas: rows.length,
    },
  }
}
