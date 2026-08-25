// ─── Regra C: a grade da TiTa é a autoridade sobre slot comprometido ──────────
//
// Ocupação de Paciente decidia "este horário está livre" olhando SÓ
// csv_grades_profissionais (via vw_grade_base), que é o export de
// AGENDAMENTOS. Só que a TiTa tem uma segunda fonte — grade_profissionais_tita,
// o export da GRADE do terapeuta — e as duas discordam.
//
// Medido em 2026-08-25, unidade 280, janela 25/08→30/09: 233 slots em que a
// grade diz 'Agendado' e o CSV diz apenas 'Livre', espalhados por 27
// profissionais. O caso que motivou a investigação (Paula Quintanilha De
// Sousa, quinta-feira 13:40→17:00) tem a assinatura clássica: o
// grade_terapeuta_id vira 'Agendado' numa data e nunca mais volta, que é o
// rastro de uma série semanal implantada — enquanto as ocorrências
// individuais nunca chegaram ao CSV de agendamentos.
//
// Por que a grade ganha o desempate: é exatamente a tabela que a implantação
// já consulta. montarPayloadAgendamento (services/tita/payload.ts) grava
// `id_grade_terapeuta` resolvido por resolverGradeTerapeuta a partir DELA. Ou
// seja, a escrita entra no mesmo gtid que a grade já marca como ocupado — a
// sugestão é que estava lendo a fonte fraca. payload.ts:34-38 já registrava
// que "csv_grades_profissionais não é uma fonte confiável ... em linhas
// 'Livre'"; isso aqui só aplica esse mesmo conhecimento à decisão de ocupação,
// e não apenas a id_sala/id_terapia_exibicao.
//
// OLHAR PARA FRENTE é parte da regra, não refinamento: a implantação cria uma
// série semanal até DATA_FINAL_FIXA (31/12), então não basta o slot estar
// livre na data sugerida. Dos 77 slots que esta regra remove na janela real da
// tela, 33 estão livres no dia e ocupados só mais adiante — colidiriam no meio
// da série. Por isso a chave é (profissional, dia da semana, hora) sobre TODAS
// as datas visíveis a partir da janela, e não (profissional, data, hora).
//
// Custo medido na janela 01/09→07/09: de 746 slots ofertados, 77 saem (10,3%),
// sobram 669. O risco de esconder vaga boa é baixo: onde o CSV diz 'Agendado',
// a grade discorda em apenas 0,7% (22 de 3.348) — ela não superestima ocupação.

import { getSupabaseClient } from "@/lib/supabase/client"
import type { CsvRow } from "@/types/cronograma"

const PAGE = 1000
const UNIDADE = 280

/** `profissionalId|||dow|||HH:MM` */
type ChaveSlot = string

// Dia da semana derivado da DATA, não do texto `dia_semana`. As duas tabelas
// trazem o rótulo em português e hoje batem, mas casar por número elimina de
// vez a chance de um lado divergir na grafia/acentuação e a regra falhar
// aberta (deixando passar slot ocupado) sem ninguém perceber. Meio-dia evita
// a virada de fuso empurrar a data para o dia anterior.
const dowDe = (data: string): number => new Date(`${data.slice(0, 10)}T12:00:00`).getDay()

const chaveSlot = (profId: number, dow: number, hora: string): ChaveSlot =>
  `${profId}|||${dow}|||${String(hora).slice(0, 5)}`

interface LinhaGrade {
  profissional_id: number | null
  data: string | null
  hora_inicial: string | null
}

/**
 * Slots que a grade da TiTa dá como comprometidos, de `desde` em diante.
 *
 * Restringe a consulta aos profissionais recebidos porque a tabela tem ~22 mil
 * linhas no horizonte visível e só interessam os que têm alguma vaga a
 * oferecer — sem esse recorte seriam ~18 páginas de ida e volta para descartar
 * a maior parte no cliente.
 */
async function buscarSlotsComprometidos(desde: string, profissionaisIds: number[]): Promise<Set<ChaveSlot>> {
  const comprometidos = new Set<ChaveSlot>()
  if (profissionaisIds.length === 0) return comprometidos

  const sb = getSupabaseClient()
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from("grade_profissionais_tita")
      .select("profissional_id, data, hora_inicial")
      .eq("id_unidade", UNIDADE)
      .eq("status_agendamento", "Agendado")
      .gte("data", desde)
      .in("profissional_id", profissionaisIds)
      .order("id")
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`grade_profissionais_tita: ${error.message}`)

    const linhas = (data ?? []) as LinhaGrade[]
    for (const l of linhas) {
      if (l.profissional_id == null || !l.data || !l.hora_inicial) continue
      comprometidos.add(chaveSlot(l.profissional_id, dowDe(l.data), l.hora_inicial))
    }
    if (linhas.length < PAGE) break
    from += PAGE
  }

  return comprometidos
}

/**
 * Remove de `cRows` as linhas 'Livre' cujo slot a grade da TiTa já dá como
 * comprometido.
 *
 * REMOVE em vez de virar o status para 'Agendado' de propósito: meia dúzia de
 * funções conta linhas 'Agendado' como sessão real (sessoesDaCategoria em
 * ocupacaoCategoria.ts, agendaClinica, os índices de remanejamento.ts), e
 * injetar aí uma linha sem paciente inflaria silenciosamente esses números.
 * Sumindo com a linha, o slot simplesmente deixa de ser ofertado e nenhum
 * contador de sessão real é tocado.
 *
 * Como a chave ignora a terapia, some também com as linhas-irmãs do mesmo
 * profissional/dia/hora — que é o comportamento desejado e o mesmo princípio
 * da trava de profOcupado (ver o achado do caso Marcia Regina Araujo de Paula
 * em disponibilidadeInterna.ts): a TiTa mantém uma linha por terapia ofertada,
 * então bloquear só a linha que casou deixaria as outras reaparecerem como
 * disponíveis no mesmo horário.
 *
 * Linha sem ProfissionalId é mantida: sem o id não há como consultar a grade, e
 * derrubar por precaução esconderia vaga boa sem evidência nenhuma.
 */
export async function descartarLivresComprometidos(cRows: CsvRow[], desde: string): Promise<CsvRow[]> {
  const idsComVaga = new Set<number>()
  for (const r of cRows) {
    if (r["Status do Agendamento"] !== "Livre") continue
    const id = r.ProfissionalId
    if (typeof id === "number") idsComVaga.add(id)
  }
  if (idsComVaga.size === 0) return cRows

  const comprometidos = await buscarSlotsComprometidos(desde, [...idsComVaga])

  // A policy de grade_profissionais_tita só libera SELECT para `authenticated`
  // (ver 20260524120000_grade_profissionais_rls_policy.sql). Sessão anônima não
  // recebe erro — recebe zero linha, e a regra ficaria desligada em silêncio.
  // Em produção o usuário está logado; em localhost sem login, este aviso é o
  // que diferencia "não havia nada comprometido" de "não consegui ler".
  if (comprometidos.size === 0) {
    console.warn(
      "[gradeTitaOcupacao] Nenhum slot comprometido lido de grade_profissionais_tita. "
      + "Se a tela está oferecendo horário ocupado, verifique se a sessão está autenticada (RLS).",
      JSON.stringify({ desde, profissionais: idsComVaga.size }),
    )
    return cRows
  }

  return cRows.filter(r => {
    if (r["Status do Agendamento"] !== "Livre") return true
    const id = r.ProfissionalId
    if (typeof id !== "number") return true
    const data = String(r.Data ?? "")
    if (!data) return true
    return !comprometidos.has(chaveSlot(id, dowDe(data), String(r.HI_str ?? "")))
  })
}
