// Cruza a grade de evolução (relatório csv_grade_profissionais, upload manual) com
// fila_autorizacoes — mesma tabela usada por cronograma/reposicao para faltas — para
// saber se a recepção realmente registrou falta do paciente. O relatório de evolução
// não carrega essa informação, então presencaOrbita ("Presença Recep.") saía sempre
// fixa em "Sim" (ver normalizarGradeParaSessao em relatorio.ts).
//
// Casamento em duas camadas — mesmo padrão do protótipo em calculadora-remuneracao
// (utils/faltasPacientes.js): por tita_agendamento_id quando a fila tem esse dado
// (mais confiável, imune a nome/hora ligeiramente diferentes), caindo para
// paciente+data+hora só quando a fila não registrou o id do agendamento.

import { getSupabaseClient } from "@/lib/supabase/client"
import { normKey } from "./constants"
import { dataParaISO } from "./datas"

const PAGE = 1000

function horaChave(hora: unknown): string {
  return String(hora ?? "").slice(0, 5)
}

export function chavePresenca(paciente: unknown, data: unknown, hora: unknown): string {
  return `${normKey(paciente)}|${dataParaISO(data)}|${horaChave(hora)}`
}

export type PresencaIndice = {
  porId: Map<string, boolean>
  porChave: Map<string, boolean>
}

/**
 * Índice de presença (true = compareceu/concluído, false = falta) construído a
 * partir de fila_autorizacoes no intervalo de datas informado. Uma sessão ausente
 * dos dois mapas significa "sem registro na fila" — quem consome deve manter o
 * fallback atual (presença assumida) nesse caso, igual ao comportamento anterior
 * à checagem.
 */
/**
 * Erro do supabase-js em texto legível.
 *
 * `console.error("...", error)` imprimia `{}`: PostgrestError e os erros de rede
 * do fetch trazem as informações em propriedades não-enumeráveis, então o objeto
 * cru não diz nada. Um erro que ninguém consegue ler é um erro que ninguém
 * conserta — este foi visto em produção como `{}` e só deu para diagnosticar
 * reproduzindo a consulta por fora.
 */
/** O recorte de fila_autorizacoes que estas duas funções leem. */
interface LinhaPresenca {
  tita_agendamento_id: number | string | null
  paciente_nome: string | null
  data_atendimento: string | null
  horario: string | null
  status: string | null
  falta_revertida_em: string | null
}

function descreverErro(e: unknown): string {
  if (!e) return "erro desconhecido"
  if (e instanceof Error) return e.message
  const o = e as { message?: string; code?: string; details?: string; hint?: string }
  const partes = [o.message, o.code && `code=${o.code}`, o.details, o.hint].filter(Boolean)
  return partes.length ? partes.join(" | ") : JSON.stringify(e)
}

export async function buscarPresencaFilaAutorizacoes(dataInicio: string, dataFim: string): Promise<PresencaIndice> {
  const porId = new Map<string, boolean>()
  const porChave = new Map<string, boolean>()
  if (!dataInicio || !dataFim) return { porId, porChave }

  const sb = getSupabaseClient()
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from("fila_autorizacoes")
      .select("tita_agendamento_id, paciente_nome, data_atendimento, horario, status, falta_revertida_em")
      .in("status", ["falta", "concluido", "glosa"])
      .gte("data_atendimento", dataInicio)
      .lte("data_atendimento", dataFim)
      // `order` não é preferência de exibição, é correção. `range` vira
      // LIMIT/OFFSET, e sem uma ordem total o Postgres não promete a mesma
      // sequência entre as páginas — linha nunca devolvida some do índice, e
      // sessão ausente do índice cai no fallback "presente". Medido contra
      // produção em julho/2026: 8.413 linhas em 9 páginas devolviam 7.071
      // distintas, ou seja **1.342 perdidas (16%)**, de forma reprodutível.
      // Com o desempate, 8.413. `id` é uuid: ordem sem significado, mas total.
      .order("id")
      .range(from, from + PAGE - 1)

    // Falhar alto, não devolver índice pela metade.
    //
    // Antes daqui saía um `return` com o que tinha dado tempo de carregar, e o
    // chamador guardava aquilo como se fosse o índice completo. Sessão que não
    // está no índice cai no fallback "presente" (ver presencaDaSessao), então
    // uma falta desaparecida virava sessão paga — em silêncio. É a mesma classe
    // do bug de 16% que o `.order("id")` acima conserta, só que disparada por
    // qualquer erro transitório: bastou o banco ficar lento durante um backfill
    // para a página logar `{}` e seguir calculando pagamento com dado faltando.
    if (error) throw new Error(`fila_autorizacoes (presença): ${descreverErro(error)}`)

    const rows = (data ?? []) as LinhaPresenca[]
    rows.forEach(r => {
      // falta_revertida_em: a falta foi desfeita — não deve contar como ausência.
      if (r.status === "falta" && r.falta_revertida_em) return
      const presente = r.status !== "falta"
      if (r.tita_agendamento_id != null) {
        porId.set(String(r.tita_agendamento_id), presente)
      } else {
        porChave.set(chavePresenca(r.paciente_nome, r.data_atendimento, r.horario), presente)
      }
    })

    if (rows.length < PAGE) break
    from += PAGE
  }

  return { porId, porChave }
}

/**
 * IDs de agendamento (tita_agendamento_id) com falta registrada em
 * fila_autorizacoes no intervalo de datas informado, usados na Previsão de
 * Receitas para deduzir da receita mensal projetada. Mesmo critério de
 * "falta real" de buscarPresencaFilaAutorizacoes: falta_revertida_em
 * preenchido não conta (foi desfeita, virou presença normal de novo). Sessões
 * sem tita_agendamento_id não entram aqui — não há como cruzar com segurança
 * contra csv_grades_profissionais sem esse id.
 */
export async function buscarFaltasFilaAutorizacoes(dataInicio: string, dataFim: string): Promise<Set<number>> {
  const faltas = new Set<number>()
  if (!dataInicio || !dataFim) return faltas

  const sb = getSupabaseClient()
  let from = 0

  while (true) {
    const { data, error } = await sb
      .from("fila_autorizacoes")
      .select("tita_agendamento_id, falta_revertida_em")
      .eq("status", "falta")
      .is("falta_revertida_em", null)
      .not("tita_agendamento_id", "is", null)
      .gte("data_atendimento", dataInicio)
      .lte("data_atendimento", dataFim)
      // Mesmo defeito e mesma correção da função acima. Aqui são 1.963 linhas
      // em julho, 2 páginas: falta perdida é dedução que a Previsão de Receitas
      // não aplica, e a receita projetada sai alta.
      .order("id")
      .range(from, from + PAGE - 1)

    // Mesma razão da função acima: conjunto pela metade é pior que exceção.
    // Falta que não entra aqui é dedução que a Previsão de Receitas não aplica,
    // e a receita projetada sai alta sem ninguém notar.
    if (error) throw new Error(`fila_autorizacoes (faltas): ${descreverErro(error)}`)

    const rows = (data ?? []) as Pick<LinhaPresenca, "tita_agendamento_id">[]
    rows.forEach(r => {
      if (r.tita_agendamento_id != null) faltas.add(Number(r.tita_agendamento_id))
    })

    if (rows.length < PAGE) break
    from += PAGE
  }

  return faltas
}

/**
 * Resolve a presença de uma sessão da grade: tenta pelo id do agendamento
 * (SessaoReal.id, o mesmo tita_agendamento_id) antes de cair para
 * paciente+data+hora. Retorna undefined quando não há registro em nenhum dos
 * dois mapas — o chamador decide o fallback (hoje: assume presença).
 */
export function presencaDaSessao(
  sessaoId: string | undefined,
  paciente: unknown,
  data: unknown,
  hora: unknown,
  indice: PresencaIndice
): boolean | undefined {
  const id = String(sessaoId ?? "").trim()
  if (id && indice.porId.has(id)) return indice.porId.get(id)
  return indice.porChave.get(chavePresenca(paciente, data, hora))
}
