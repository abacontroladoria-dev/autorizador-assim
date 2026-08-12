// ─── Ocupação de uma categoria (Unidade + Dia + Especialidade) ─────────────
// Mesma pergunta de ocupacaoProfissional.ts, só que a partir da lente inversa:
// em vez de "dado o profissional P, quais vagas ele tem?", aqui é "dada a
// combinação Unidade+Dia+Especialidade, quais vagas existem ali, com QUALQUER
// profissional que já tenha um horário 'Livre' real nessa combinação?".
// Reaproveita o mesmo motor (disponibilidadeInterna.ts + remanejamento.ts),
// só trocando o agrupamento de "por profissional" pra "por categoria" — nunca
// mexe na agenda de ninguém, é só visualização.

import { listarOportunidadesDiretas, listarSlotsLivres, type OportunidadeDireta } from "./disponibilidadeInterna"
import { encontrarCandidatosRemanejamento, construirIndiceRemanejamento, type IndiceRemanejamento } from "./remanejamento"
import { filtrarCapacidadeLivreReservada, turnoFromHora } from "./helpers"
import { hiStr, type GapItem, type Turno } from "./simulacaoNovoPrestador"
import { DIAS_UTIL, TERAPIA_TO_ESP, TODAS_ESP, UNID_COR } from "./constants"
import type { RemanejamentoDetalhe } from "./sugestaoContratacaoTypes"
import type { CsvRow } from "@/types/cronograma"

const TURNOS: Turno[] = ["manha", "tarde"]

export interface VagaCategoria {
  hora: string
  turno: Turno
  /** Profissional dono desse horário "Livre" específico — pode haver mais de
   *  um profissional livre na mesma hora dentro da mesma categoria. */
  profissional: string
  terapia: string
  status: "livre" | "direto" | "remanejamento"
  paciente?: { pac: string; gap: number; aut: number; of: number }
  /** Só presente quando status === "remanejamento". */
  remanejamento?: RemanejamentoDetalhe
}

/** Gera as vagas de uma categoria (Unidade+Dia+Especialidade), direto +
 *  remanejamento + livres sem oportunidade, com teto de gap combinando as
 *  duas modalidades dentro do próprio grupo — mesmo princípio de
 *  limitarPorGap em ocupacaoProfissional.ts, só que aqui o escopo é a
 *  categoria inteira (todos os profissionais livres nela), não um profissional só. */
export function gerarVagasCategoria(
  unidade: string, dia: string, especialidade: string,
  cRowsBrutos: CsvRow[], gapMap: Record<string, GapItem>,
  /**
   * Pré-calculados opcionais — quando informados, poupam recomputar do zero
   * o que NÃO depende da combinação unidade/dia/especialidade sendo avaliada.
   * Essenciais quando esta função é chamada em varredura (ex.:
   * rankearOportunidadesInternas, abaixo, que testa toda combinação
   * unidade×dia×especialidade): sem eles, cada chamada recalculava
   * `listarOportunidadesDiretas` (o dataset INTEIRO) e o índice de
   * remanejamento do zero, multiplicando o custo pelo nº de combinações. Uma
   * chamada isolada (ex.: a grade de UMA combinação em OcupacaoCategoriaView)
   * segue funcionando igual sem informar nada.
   */
  diretasPrecalculadas?: OportunidadeDireta[], indiceRemanejamento?: IndiceRemanejamento,
): VagaCategoria[] {
  const cRows = filtrarCapacidadeLivreReservada(cRowsBrutos)
  const slots = listarSlotsLivres(cRows).filter(
    s => s.unidade === unidade && s.dia === dia && s.especialidade === especialidade,
  )
  if (!slots.length) return []

  const todasDiretas = diretasPrecalculadas ?? listarOportunidadesDiretas(cRows, gapMap)
  const diretas = todasDiretas.filter(
    o => o.unidade === unidade && o.dia === dia && o.especialidade === especialidade,
  )

  // Casa cada direta com o slot exato (profissional+hora) que ela preenche —
  // listarOportunidadesDiretas já garante no máximo 1 direta por slot livre.
  const diretaPorSlot = new Map<string, typeof diretas[number]>()
  for (const o of diretas) diretaPorSlot.set(`${o.profissional}|||${o.hora}`, o)

  const vagas: VagaCategoria[] = []
  const slotsSemDireta: typeof slots = []
  for (const s of slots) {
    const direta = diretaPorSlot.get(`${s.profissional}|||${s.hora}`)
    if (direta) {
      vagas.push({
        hora: s.hora, turno: turnoFromHora(s.hora), profissional: s.profissional, terapia: s.terapia,
        status: "direto",
        paciente: { pac: direta.paciente.pac, gap: direta.paciente.gap, aut: direta.paciente.aut, of: direta.paciente.of },
      })
    } else {
      slotsSemDireta.push(s)
    }
  }

  // Candidatos de remanejamento, 1 chamada por turno presente entre os slots
  // ainda sem direta — encontrarCandidatosRemanejamento já varre todas as
  // horas do turno de uma vez.
  const turnosPresentes = [...new Set(slotsSemDireta.map(s => turnoFromHora(s.hora)))]
  const candidatosPorHora = new Map<string, { pac: string; gap: number; aut: number; of: number; remanejamento: RemanejamentoDetalhe }[]>()
  for (const turno of turnosPresentes) {
    for (const { hora, candidato } of encontrarCandidatosRemanejamento(dia, turno, unidade, especialidade, cRows, gapMap, indiceRemanejamento)) {
      if (!candidato.remanejamento) continue
      const lista = candidatosPorHora.get(hora) ?? []
      lista.push({ pac: candidato.paciente, gap: candidato.gap, aut: candidato.aut, of: candidato.of, remanejamento: candidato.remanejamento })
      candidatosPorHora.set(hora, lista)
    }
  }

  for (const s of slotsSemDireta) {
    const disponiveis = candidatosPorHora.get(s.hora)
    const candidato = disponiveis?.shift()
    if (candidato) {
      vagas.push({
        hora: s.hora, turno: turnoFromHora(s.hora), profissional: s.profissional, terapia: s.terapia,
        status: "remanejamento",
        paciente: { pac: candidato.pac, gap: candidato.gap, aut: candidato.aut, of: candidato.of },
        remanejamento: candidato.remanejamento,
      })
    } else {
      vagas.push({ hora: s.hora, turno: turnoFromHora(s.hora), profissional: s.profissional, terapia: s.terapia, status: "livre" })
    }
  }

  return limitarPorGapCategoria(vagas, gapMap, especialidade)
}

/** Mesmo princípio de limitarPorGap (ocupacaoProfissional.ts): um paciente
 *  não pode aparecer como oportunidade além do que o gap dele permite —
 *  corta primeiro onde ele tem mais alternativas nesta categoria. Vagas
 *  cortadas voltam a "livre" (o slot em si continua existindo, só perde o
 *  candidato). */
function limitarPorGapCategoria(
  vagas: VagaCategoria[], gapMap: Record<string, GapItem>, especialidade: string,
): VagaCategoria[] {
  interface Ocorrencia { idx: number; alternativas: number }

  const porVaga = new Map<string, number>()
  for (const v of vagas) {
    if (!v.paciente) continue
    porVaga.set(v.hora, (porVaga.get(v.hora) ?? 0) + 1)
  }

  const ocorrenciasPorPaciente = new Map<string, Ocorrencia[]>()
  vagas.forEach((v, idx) => {
    if (!v.paciente) return
    const lista = ocorrenciasPorPaciente.get(v.paciente.pac) ?? []
    lista.push({ idx, alternativas: (porVaga.get(v.hora) ?? 1) - 1 })
    ocorrenciasPorPaciente.set(v.paciente.pac, lista)
  })

  const rebaixar = new Set<number>()
  for (const [pac, ocorrencias] of ocorrenciasPorPaciente) {
    const gap = gapMap[`${pac}|||${especialidade}`]?.gap ?? 0
    if (ocorrencias.length <= gap) continue
    const excedentes = [...ocorrencias].sort((a, b) => a.alternativas - b.alternativas).slice(gap)
    for (const e of excedentes) rebaixar.add(e.idx)
  }
  if (!rebaixar.size) return vagas

  return vagas.map((v, idx) => (rebaixar.has(idx) ? { hora: v.hora, turno: v.turno, profissional: v.profissional, terapia: v.terapia, status: "livre" as const } : v))
}

export interface CategoriaComOportunidade {
  unidade: string
  dia: string
  turno: Turno
  especialidade: string
  qtdDireto: number
  qtdRemanejamento: number
  qtdLivre: number
}

/** Varre TODA combinação Unidade × Dia × Turno × Especialidade (mesmo
 *  espírito de calcularTodosCombos em sugestaoContratacao.ts, só que sem
 *  simular contratação nova — é aproveitamento com quem já está contratado)
 *  e ranqueia por quantidade de oportunidade (direto + remanejamento) —
 *  equivalente ao painel "Sugestões automáticas de contratação" da
 *  Simulação de Novo Prestador, só que apontando pra onde já dá pra
 *  aproveitar internamente, sem precisar contratar. Só entram combinações
 *  com pelo menos 1 oportunidade — combinação sem nenhuma não ajuda o
 *  usuário a decidir onde olhar. */
export function rankearOportunidadesInternas(
  cRowsBrutos: CsvRow[], gapMap: Record<string, GapItem>,
): CategoriaComOportunidade[] {
  // Pré-calculados UMA VEZ pra toda a varredura (3 unidades × 5 dias × 13
  // especialidades = ~195 combinações) — sem isso, gerarVagasCategoria
  // recomputava listarOportunidadesDiretas (o dataset inteiro) e refazia
  // todo scan de remanejamento a cada combinação, multiplicando o custo por
  // ~195x e travando a aba antes do primeiro paint.
  const cRows = filtrarCapacidadeLivreReservada(cRowsBrutos)
  const diretasGlobais = listarOportunidadesDiretas(cRows, gapMap)
  const indiceRemanejamento = construirIndiceRemanejamento(cRows)

  const resultado: CategoriaComOportunidade[] = []
  for (const unidade of Object.keys(UNID_COR)) {
    for (const dia of DIAS_UTIL) {
      for (const especialidade of TODAS_ESP) {
        const vagas = gerarVagasCategoria(unidade, dia, especialidade, cRows, gapMap, diretasGlobais, indiceRemanejamento)
        if (!vagas.length) continue
        for (const turno of TURNOS) {
          const doTurno = vagas.filter(v => v.turno === turno)
          if (!doTurno.length) continue
          const qtdDireto = doTurno.filter(v => v.status === "direto").length
          const qtdRemanejamento = doTurno.filter(v => v.status === "remanejamento").length
          if (qtdDireto + qtdRemanejamento === 0) continue
          resultado.push({
            unidade, dia, turno, especialidade, qtdDireto, qtdRemanejamento,
            qtdLivre: doTurno.filter(v => v.status === "livre").length,
          })
        }
      }
    }
  }
  return resultado.sort((a, b) => (b.qtdDireto + b.qtdRemanejamento) - (a.qtdDireto + a.qtdRemanejamento))
}

/** Quantas sessões "Agendado" já existem nessa Unidade+Especialidade, dentro
 *  dos dias/turnos selecionados — base do "ocupado" no gráfico de projeção
 *  de ocupação (ProjecaoOcupacaoDonut). Mesma convenção de filtro de
 *  listarSlotsLivres, só que pra Status "Agendado" em vez de "Livre". */
export function contarOcupadosCategoria(
  unidade: string, periodos: { dia: string; turno: Turno }[], especialidade: string, cRows: CsvRow[],
): number {
  const periodosSet = new Set(periodos.map(p => `${p.dia}|||${p.turno}`))
  return cRows.filter(r =>
    r["Status do Agendamento"] === "Agendado" &&
    String(r.Unidade || "Desconhecida") === unidade &&
    TERAPIA_TO_ESP[r.Terapia] === especialidade &&
    periodosSet.has(`${r["Dia da Semana"]}|||${turnoFromHora(hiStr(r))}`),
  ).length
}
