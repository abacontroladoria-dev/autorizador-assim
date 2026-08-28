import "server-only"

import { supabaseService } from "@/lib/supabase/service"
import {
  agruparLaudos,
  hojeBrasiliaISO,
  juntarComAcompanhamento,
  type PacienteParaAcompanhamento,
  type RegistroAcompanhamentoBruto,
} from "@/lib/laudos/acompanhamento"
import { buscarLaudosDoRelatorio } from "./relatorio"
import type { ItemAcompanhamentoLaudo, MetaAcompanhamentoLaudos } from "@/types/laudosAcompanhamento"

// A lista da tela Acompanhamento de Laudos: três fontes, uma linha por laudo.
//
//   1. `orbita_laudos_relatorio` — a LISTA. Quem está nela está na tela.
//      Reusa buscarLaudosDoRelatorio() de propósito: aquela função já carrega as
//      três armadilhas resolvidas (paginação contra o `max_rows = 1000` do
//      PostgREST, `status = 'concluido'` para não ler importação em andamento,
//      filtro por `importacao_id` para não somar snapshots de dias diferentes) e
//      ainda confere a contagem contra `total_linhas`. Reimplementar a leitura
//      aqui seria reabrir os três em silêncio.
//   2. `public.pacientes` — ENRIQUECIMENTO: `ativo` e `foto_path`. Pode faltar.
//   3. `public.laudos_acompanhamento` — o registro da recepção. Pode faltar.
//
// A ordem importa: a lista NUNCA é definida pelo cadastro. Medido em
// 28/08/2026, 58 dos 343 laudos são de paciente sem cadastro no Pulsar — 57
// deles VENCIDOS. Se o `join` fosse quem manda, 28% da fila de cobrança
// desapareceria da tela sem nenhum erro aparecer.
//
// Este módulo é `server-only`: `orbita_laudos_*` não tem GRANT para `anon` nem
// `authenticated` (medido: 401/42501), então só service_role lê. A chave nunca
// sai do servidor — a tela conversa por /api/acompanhamento-laudos.
//
// Nada aqui escreve. A escrita é do cliente, por RLS, em
// services/laudosAcompanhamento.service.ts.

/** Teto de linhas por resposta do PostgREST — o mesmo de relatorio.ts. */
const PAGE = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = any

/**
 * Lê uma tabela inteira, paginada.
 *
 * Existe porque `pacientes` e `laudos_acompanhamento` são pequenas HOJE (372 e
 * ≤343 linhas) e um `select()` sem paginação funcionaria — até a base passar de
 * 1.000, quando o PostgREST corta a resposta com HTTP 200 e sem erro. A tela
 * então perderia foto e registro de recepção de parte dos pacientes,
 * silenciosamente. É a mesma armadilha que relatorio.ts documenta; o custo de
 * não cair nela é este laço.
 */
async function lerTudo(
  sb: ClienteSupabase,
  tabela: string,
  colunas: string,
  ordem: string,
): Promise<Record<string, unknown>[]> {
  const todas: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(tabela)
      .select(colunas)
      // Ordem estável: sem ela o próprio laço pula linha entre páginas.
      .order(ordem, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`[laudos:acompanhamento] falha ao ler ${tabela}: ${error.message}`)
    const pagina = (data ?? []) as Record<string, unknown>[]
    todas.push(...pagina)
    if (pagina.length < PAGE) break
  }
  return todas
}

export async function buscarAcompanhamentoLaudos(
  cliente?: ClienteSupabase,
  agora?: Date,
): Promise<{ itens: ItemAcompanhamentoLaudo[]; meta: MetaAcompanhamentoLaudos }> {
  const sb: ClienteSupabase = cliente ?? supabaseService
  const hoje = hojeBrasiliaISO(agora)

  const { rows, meta: metaImportacao } = await buscarLaudosDoRelatorio(sb)
  const { laudos, descartadas } = agruparLaudos(rows, hoje)

  // As duas leituras de enriquecimento são independentes entre si — em paralelo.
  const [pacientesBrutos, registrosBrutos] = await Promise.all([
    lerTudo(
      sb,
      "pacientes",
      "id_paciente, tita_paciente_id, nome, ativo, ficticio, foto_path",
      "id_paciente",
    ),
    lerTudo(
      sb,
      "laudos_acompanhamento",
      "id_laudo, mensagem_enviada_em, observacao, atualizado_por_nome, atualizado_em_brasilia",
      "id_laudo",
    ),
  ])

  // O CRUZAMENTO em si é puro e mora em lib/laudos/acompanhamento.ts — é lá que
  // está documentada e testada a regra do usuário (28/08/2026) de que "avisado"
  // é do LAUDO, não do paciente: um paciente com laudo novo (id_laudo diferente)
  // volta a precisar de aviso, sem nenhuma lógica extra aqui, só porque o
  // cruzamento é por id_laudo.
  const itens = juntarComAcompanhamento(
    laudos,
    pacientesBrutos as unknown as PacienteParaAcompanhamento[],
    registrosBrutos as unknown as RegistroAcompanhamentoBruto[],
  )

  const comCamposDivergentes = laudos.filter((l) => l.camposDivergentes.length > 0).length
  const comSituacaoDivergente = laudos.filter((l) => l.situacaoDivergente).length

  // Os três contadores abaixo são 0 em dado íntegro (medido em 28/08/2026:
  // 0/0/0 em 343 laudos). Deixar de avisar quando saem de zero é como o
  // truncamento do PostgREST passou meses invisível: o número simplesmente
  // encolhe e ninguém repara.
  if (descartadas > 0) {
    console.warn(
      `[laudos:acompanhamento] ${descartadas} linha(s) do relatório sem "ID Laudo" — descartadas, sem chave estável para acompanhar.`,
    )
  }
  if (comCamposDivergentes > 0) {
    console.warn(
      `[laudos:acompanhamento] ${comCamposDivergentes} laudo(s) com campo divergente entre suas linhas — o agrupamento usou a primeira linha.`,
    )
  }
  if (comSituacaoDivergente > 0) {
    console.warn(
      `[laudos:acompanhamento] ${comSituacaoDivergente} laudo(s) onde a Situação do Órbita discorda do cálculo por Validade.`,
    )
  }

  return {
    itens,
    meta: {
      importacaoId: metaImportacao.importacaoId,
      arquivoNome: metaImportacao.arquivoNome,
      concluidoEm: metaImportacao.concluidoEm,
      linhasLidas: metaImportacao.linhasLidas,
      laudos: itens.length,
      hoje,
      descartadas,
      comCamposDivergentes,
      comSituacaoDivergente,
    },
  }
}
