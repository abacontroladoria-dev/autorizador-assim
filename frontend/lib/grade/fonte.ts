// ─── Ponto único de leitura da grade ────────────────────────────────────────
//
// Toda leitura da grade sincronizada da TiTa passa por aqui. Antes eram 14
// consultas em 8 arquivos, cada uma reescrevendo o mesmo laço de paginação e
// repetindo — ou esquecendo — os mesmos filtros. O que se ganha concentrando:
//
//   • `ativo = true` deixa de ser responsabilidade de quem escreve a consulta.
//     Esquecê-lo conta uma sessão remarcada duas vezes; em remuneração, paga
//     em dobro. Já estava ausente em convenioValores.service.ts.
//   • `profissional_cpf` some de toda leitura da aplicação, porque a view não
//     projeta a coluna. Não fecha o pendente de SECURITY_CHECKLIST.md — as
//     views são security_invoker e a tabela continua legível direto — mas é o
//     passo que torna possível revogar aquele acesso sem quebrar tela.
//   • O laço `while (true) { … range(from, from + PAGE - 1) }`, hoje copiado em
//     seis arquivos com pequenas variações de ordenação, existe uma vez só.
//
// A separação entre as duas fontes é deliberada e não deve ser desfeita:
//
//   "atendimentos" (vw_grade_atendimentos) — Agendado + unidade 280. O que
//       quase todo mundo quer dizer por "a grade". Padrão.
//   "base"         (vw_grade_base)         — sem recorte de unidade ou status.
//       Necessária para dois casos legítimos: o Comparativo de Sessões, que
//       precisa de TODAS as unidades, e a busca de reposição, que consulta
//       exclusivamente slots 'Livre'.
//
// Leituras que continuam fora daqui, de propósito:
//   • buscarGradePorId / agendamento-terapia-tita — buscam UMA linha por UUID
//     para montar o payload da TiTa e precisam de `sala_id`, que a view não
//     projeta. Continuam na tabela.
//   • sync-grade-csv — é o escritor.

import { getSupabaseClient } from "@/lib/supabase/client"

/** Nome da view por trás de cada fonte. Único lugar do frontend que os conhece. */
export const VIEW_POR_FONTE = {
  atendimentos: "vw_grade_atendimentos",
  base: "vw_grade_base",
} as const

export type FonteGrade = keyof typeof VIEW_POR_FONTE

/** View de valores distintos para os selects de cadastro — ver buscarOpcoesGrade(). */
export const VIEW_OPCOES = "vw_grade_opcoes"

/** Tabela crua — só para as leituras por UUID citadas no cabeçalho. */
export const TABELA_GRADE = "csv_grades_profissionais"

const PAGE = 1000

// Padrão de dupla codificação UTF-8 (mojibake): byte líder C2/C3 seguido de byte
// de continuação (80–BF). Ex.: "Araújo" gravado como "AraÃºjo".
const MOJIBAKE_RE = /[Â-Ã][-¿]/

/**
 * Repara texto com dupla codificação UTF-8. Só atua quando o padrão está
 * presente, para não corromper texto já correto.
 *
 * Hoje é efetivamente no-op: medido contra produção, zero assinaturas de
 * mojibake nos cinco campos de texto, contra 3.495 linhas com "ã" correto e
 * 2.492 com "ç" correto. Mantido porque o custo é um teste de regex e a
 * garantia de que a API nunca mais devolverá texto malformado não existe.
 */
export function fixMojibake(s: string | null | undefined): string {
  const str = s ?? ""
  if (!str || !MOJIBAKE_RE.test(str)) return str
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      Uint8Array.from(str, c => c.charCodeAt(0) & 0xff),
    )
  } catch {
    return str
  }
}

/** Coluna a ordenar; `desc` inverte. Sem isto a paginação pode pular ou repetir linhas. */
export interface OrdemGrade {
  coluna: string
  desc?: boolean
}

// O builder do PostgREST não tem um tipo público estável que sobreviva a
// `.eq().gte().order()` encadeados; o projeto já usa `any` nesses pontos (ver
// gradeService.ts). Isolado aqui, some dos chamadores.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryGrade = any

export interface BuscaGrade {
  /** Lista de colunas do PostgREST. Peça só o que for usar. */
  campos: string
  /** Padrão: "atendimentos" (Agendado + unidade 280). */
  fonte?: FonteGrade
  /** Recorte de data, inclusivo nas duas pontas. */
  de?: string
  ate?: string
  /**
   * Só na fonte "base": restringe a unidade. `undefined` = todas as unidades.
   * Na fonte "atendimentos" a unidade 280 já vem da view.
   */
  unidade?: number
  /** Só na fonte "base": 'Livre', 'Agendado', ou uma lista. */
  status?: string | readonly string[]
  /** Ordenação. Sempre termine por uma coluna única (`id`) quando paginar. */
  ordem?: readonly OrdemGrade[]
  /** Filtros que não cabem nos campos acima (ilike, not, gt…). */
  refinar?: (q: QueryGrade) => QueryGrade
  /**
   * Cliente Supabase. Padrão: o cliente de browser. Passe explicitamente em
   * código de servidor ou quando precisar da service role.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cliente?: any
  /**
   * Teto de linhas. Sem isto a busca pagina até o fim — que é o certo para
   * consulta com recorte de data, e perigoso para consulta sem.
   */
  limite?: number
}

/**
 * Busca linhas da grade, paginando até o fim (ou até `limite`).
 *
 * Pagina porque o PostgREST corta em 1.000 linhas por resposta e a tabela tem
 * ~148 mil: uma consulta de mês inteiro sem paginação devolve resultado
 * silenciosamente truncado, que foi o defeito original de
 * buscarTerapiasDoProfissional.
 */
export async function buscarGrade<T>(cfg: BuscaGrade): Promise<T[]> {
  const sb = cfg.cliente ?? getSupabaseClient()
  const view = VIEW_POR_FONTE[cfg.fonte ?? "atendimentos"]
  const todas: T[] = []

  let from = 0
  while (true) {
    const tamanho = cfg.limite ? Math.min(PAGE, cfg.limite - todas.length) : PAGE
    if (tamanho <= 0) break

    let q: QueryGrade = sb.from(view).select(cfg.campos)

    if (cfg.de) q = q.gte("data", cfg.de)
    if (cfg.ate) q = q.lte("data", cfg.ate)
    if (cfg.unidade !== undefined) q = q.eq("unidade_id", cfg.unidade)
    if (typeof cfg.status === "string") q = q.eq("status_agendamento", cfg.status)
    else if (Array.isArray(cfg.status)) q = q.in("status_agendamento", cfg.status)
    if (cfg.refinar) q = cfg.refinar(q)

    for (const o of cfg.ordem ?? []) q = q.order(o.coluna, { ascending: !o.desc })

    const { data, error } = await q.range(from, from + tamanho - 1)
    if (error) throw new Error(error.message)

    const linhas = (data ?? []) as T[]
    todas.push(...linhas)
    if (linhas.length < tamanho) break
    from += tamanho
  }

  return todas
}

/** Uma opção de formulário vinda da agenda real. `id` é null para convênio (a fonte só tem nome). */
export interface OpcaoGrade {
  id: number | null
  nome: string
}

export interface OpcoesGrade {
  convenios: OpcaoGrade[]
  terapias: OpcaoGrade[]
  pacientes: OpcaoGrade[]
}

/**
 * Convênios, terapias e pacientes distintos vistos na agenda real — as opções
 * dos formulários de cadastro de valores, que nunca aceitam texto livre.
 *
 * UMA requisição a `vw_grade_opcoes`, que já vem deduplicada do banco. Antes
 * isto era a paginação da grade inteira, três vezes (uma por lista): em
 * produção ~444 requisições, cada uma refazendo um seq scan completo de ~148
 * mil linhas, porque OFFSET não pula leitura. São ~500 linhas no total — o
 * trabalho estava todo em transportar duplicata.
 *
 * NÃO filtra paciente fictício: `isFakePatient` casa por prefixo e vive em
 * lib/remuneracao/pacientes, compartilhado com o cálculo de remuneração. Quem
 * chama aplica.
 */
export async function buscarOpcoesGrade(cliente?: unknown): Promise<OpcoesGrade> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = cliente ?? getSupabaseClient()
  const { data, error } = await sb
    .from(VIEW_OPCOES)
    .select("tipo, id, nome")
  if (error) throw new Error(error.message)

  const out: OpcoesGrade = { convenios: [], terapias: [], pacientes: [] }
  const destino = { convenio: out.convenios, terapia: out.terapias, paciente: out.pacientes }

  for (const r of (data ?? []) as { tipo: string; id: number | null; nome: string | null }[]) {
    const lista = destino[r.tipo as keyof typeof destino]
    const nome = fixMojibake(r.nome).trim()
    if (!lista || !nome) continue
    lista.push({ id: r.id ?? null, nome })
  }

  for (const lista of Object.values(destino)) {
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }
  return out
}
