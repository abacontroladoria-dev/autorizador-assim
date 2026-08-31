// ─── Ocupação de uma categoria (Unidade + Dia + Especialidade) ─────────────
// Mesma pergunta de ocupacaoProfissional.ts, só que a partir da lente inversa:
// em vez de "dado o profissional P, quais vagas ele tem?", aqui é "dada a
// combinação Unidade+Dia+Especialidade, quais vagas existem ali, com QUALQUER
// profissional que já tenha um horário 'Livre' real nessa combinação?".
// Reaproveita o mesmo motor (disponibilidadeInterna.ts + remanejamento.ts),
// só trocando o agrupamento de "por profissional" pra "por categoria" — nunca
// mexe na agenda de ninguém, é só visualização.

import { listarOportunidadesDiretas, listarSlotsLivres, unidadeDominanteDoDia, type OportunidadeDireta } from "./disponibilidadeInterna"
import { encontrarCandidatosRemanejamento, construirIndiceRemanejamento, type IndiceRemanejamento } from "./remanejamento"
import { listarOportunidadesNovoDia, construirIndiceNovoDia, type OportunidadeNovoDia } from "./novoDia"
import { filtrarCapacidadeLivreReservada, turnoFromHora } from "./helpers"
import { hiStr, type GapItem, type Turno } from "./simulacaoNovoPrestador"
import { DIAS_UTIL, TERAPIA_TO_ESP, TODAS_ESP, UNID_COR } from "./constants"
import type { FaixaCascata, ModoCascataOcupacao } from "./sugestaoContratacao"
import type { RemanejamentoDetalhe } from "./sugestaoContratacaoTypes"
import type { CsvRow } from "@/types/cronograma"

const TURNOS: Turno[] = ["manha", "tarde"]

// Mesma cascata 70/60/50 das sugestões automáticas de contratação
// (sugestaoContratacao.ts) — usada só pra colorir o badge de aproveitamento
// (BadgeOcupacao), não mais como filtro de corte do ranking (ver
// rankearOportunidadesInternas: hoje ordena por quantidade de sessões).
const FAIXAS_CASCATA: readonly FaixaCascata[] = [70, 60, 50]

/** Teto de sessões possíveis por período — 6 horários de manhã + 7 de tarde
 *  em HORAS_GRID (constants.ts) = 13 no dia inteiro. */
export const MAX_SESSOES_PERIODO: Record<Turno | "diaInteiro", number> = {
  manha: 6, tarde: 7, diaInteiro: 13,
}

export interface VagaCategoria {
  hora: string
  turno: Turno
  /** Profissional dono desse horário "Livre" específico — pode haver mais de
   *  um profissional livre na mesma hora dentro da mesma categoria. */
  profissional: string
  terapia: string
  /** "remanejamento-mesmo-dia": a sessão realocada fica no mesmo dia da vaga
   *  (RemanejamentoDetalhe.de.dia === .para.dia). "remanejamento-outro-dia":
   *  vai pra outro dia que o paciente já frequenta (ver remanejamento.ts,
   *  passo 2 de tentarRemanejamento). Distinção só de exibição — nenhuma das
   *  duas muda a lógica de elegibilidade, só o rótulo/cor/prioridade
   *  mostrados ao usuário. */
  status: "livre" | "direto" | "remanejamento-mesmo-dia" | "remanejamento-outro-dia" | "novo-dia"
  paciente?: { pac: string; gap: number; aut: number; of: number }
  /** Só presente quando status começa com "remanejamento". */
  remanejamento?: RemanejamentoDetalhe
  /** Só presente quando status === "novo-dia". */
  novoDia?: OportunidadeNovoDia
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
  novoDiaPrecalculadas?: OportunidadeNovoDia[],
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
    // R5.4: a unidade da vaga precisa ser a que já concentra a maioria das
    // sessões do paciente nesse dia — sem isso, um paciente com 1 sessão
    // isolada numa unidade (ex.: troca pontual de agenda) vira candidato pra
    // qualquer vaga dessa unidade minoritária, mesmo o resto do dia dele
    // sendo noutra unidade. Ver unidadeDominanteDoDia (disponibilidadeInterna.ts).
    const dominante = direta ? unidadeDominanteDoDia(direta.paciente.pac, dia, cRows) : null
    if (direta && (!dominante || dominante === unidade)) {
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
      // Mesma regra R5.4 aplicada à modalidade "direto" acima — remanejamento
      // não pode empurrar o paciente pra uma unidade minoritária do dia dele.
      const dominante = unidadeDominanteDoDia(candidato.paciente, dia, cRows)
      if (dominante && dominante !== unidade) continue
      const lista = candidatosPorHora.get(hora) ?? []
      lista.push({ pac: candidato.paciente, gap: candidato.gap, aut: candidato.aut, of: candidato.of, remanejamento: candidato.remanejamento })
      candidatosPorHora.set(hora, lista)
    }
  }

  const slotsSemNada: typeof slots = []
  for (const s of slotsSemDireta) {
    const disponiveis = candidatosPorHora.get(s.hora)
    const candidato = disponiveis?.shift()
    if (candidato) {
      const mesmoDia = candidato.remanejamento.de.dia === candidato.remanejamento.para.dia
      vagas.push({
        hora: s.hora, turno: turnoFromHora(s.hora), profissional: s.profissional, terapia: s.terapia,
        status: mesmoDia ? "remanejamento-mesmo-dia" : "remanejamento-outro-dia",
        paciente: { pac: candidato.pac, gap: candidato.gap, aut: candidato.aut, of: candidato.of },
        remanejamento: candidato.remanejamento,
      })
    } else {
      slotsSemNada.push(s)
    }
  }

  // Modalidade "Novo Dia": só tentada nos slots que sobraram sem Direto nem
  // Remanejamento — as duas primeiras resolvem a MESMA terapia sem exigir
  // mudança de rotina do paciente, sempre preferíveis quando existem.
  const todasNovoDia = (novoDiaPrecalculadas ?? listarOportunidadesNovoDia(cRows, gapMap))
    .filter(o => o.dia === dia && o.unidade === unidade && o.ancora.especialidade === especialidade)
  const novoDiaPorSlot = new Map(todasNovoDia.map(o => [`${o.ancora.profissional}|||${o.ancora.hora}`, o]))

  for (const s of slotsSemNada) {
    const oportunidade = novoDiaPorSlot.get(`${s.profissional}|||${s.hora}`)
    if (oportunidade) {
      const g = oportunidade.gapPorEspecialidade[especialidade]
      vagas.push({
        hora: s.hora, turno: turnoFromHora(s.hora), profissional: s.profissional, terapia: s.terapia,
        status: "novo-dia",
        paciente: { pac: oportunidade.paciente, gap: (g?.aut ?? 0) - (g?.of ?? 0), aut: g?.aut ?? 0, of: g?.of ?? 0 },
        novoDia: oportunidade,
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
  /** "diaInteiro" quando `modo` agrupa manhã+tarde numa linha só; senão o turno isolado. */
  periodo: Turno | "diaInteiro"
  especialidade: string
  qtdDireto: number
  qtdRemanejamentoMesmoDia: number
  qtdRemanejamentoOutroDia: number
  qtdNovoDia: number
  qtdLivre: number
  /** direto + remanejamento (mesmo dia + outro dia) + novo-dia — métrica principal do ranking. */
  qtdOportunidade: number
  /** Teto de sessões possíveis nesse período (MAX_SESSOES_PERIODO). */
  maxSessoes: number
  /** % da capacidade "Livre" já existente nesse período que já virou
   *  oportunidade — só usado hoje pra colorir o badge, não filtra mais nada. */
  pctAproveitamento: number
  /** Maior faixa da cascata 70/60/50 que pctAproveitamento atinge. */
  faixa: FaixaCascata
}

export interface RankearOportunidadesInternasOpts {
  /** Unidades a varrer; omitido/vazio = compara as 3 unidades juntas. */
  unidades?: ReadonlySet<string>
  /** "diaInteiro" agrupa manhã+tarde numa linha por dia; "porTurno" mantém uma linha por turno isolado. */
  modo: ModoCascataOcupacao
  /** Especialidades a considerar; omitido/vazio = todas (TODAS_ESP). */
  especialidades?: ReadonlySet<string>
}

/** Varre Unidade × Dia × (Turno ou dia inteiro, conforme `modo`) ×
 *  Especialidade (mesmo espírito de calcularTodosCombos em
 *  sugestaoContratacao.ts, só que sem simular contratação nova — é
 *  aproveitamento com quem já está contratado) e ranqueia por quantidade de
 *  sessões de oportunidade (direto + remanejamento + novo-dia) —
 *  equivalente ao painel "Sugestões automáticas de contratação" da
 *  Simulação de Novo Prestador, só que apontando pra onde já dá pra
 *  aproveitar internamente, sem precisar contratar. Só entram combinações
 *  com pelo menos 1 oportunidade — combinação sem nenhuma não ajuda o
 *  usuário a decidir onde olhar. */
export function rankearOportunidadesInternas(
  cRowsBrutos: CsvRow[], gapMap: Record<string, GapItem>,
  opts: RankearOportunidadesInternasOpts,
): CategoriaComOportunidade[] {
  const { unidades: unidadesFiltro, modo, especialidades } = opts
  const unidades = unidadesFiltro?.size ? [...unidadesFiltro] : Object.keys(UNID_COR)
  const listaEspecialidades = especialidades?.size ? [...especialidades] : TODAS_ESP

  // Pré-calculados UMA VEZ pra toda a varredura — sem isso, gerarVagasCategoria
  // recomputava listarOportunidadesDiretas (o dataset inteiro) e refazia
  // todo scan de remanejamento a cada combinação, multiplicando o custo pelo
  // nº de combinações e travando a aba antes do primeiro paint.
  const cRows = filtrarCapacidadeLivreReservada(cRowsBrutos)
  const diretasGlobais = listarOportunidadesDiretas(cRows, gapMap)
  const indiceRemanejamento = construirIndiceRemanejamento(cRows)
  const indiceNovoDia = construirIndiceNovoDia(cRows, gapMap)
  const novoDiaGlobais = listarOportunidadesNovoDia(cRows, gapMap, indiceNovoDia)

  const resultado: CategoriaComOportunidade[] = []
  for (const unid of unidades) {
    for (const dia of DIAS_UTIL) {
      for (const especialidade of listaEspecialidades) {
        const vagas = gerarVagasCategoria(unid, dia, especialidade, cRows, gapMap, diretasGlobais, indiceRemanejamento, novoDiaGlobais)
        if (!vagas.length) continue

        const grupos: { periodo: Turno | "diaInteiro"; doGrupo: typeof vagas }[] = modo === "diaInteiro"
          ? [{ periodo: "diaInteiro", doGrupo: vagas }]
          : TURNOS.map(turno => ({ periodo: turno, doGrupo: vagas.filter(v => v.turno === turno) }))

        for (const { periodo, doGrupo } of grupos) {
          if (!doGrupo.length) continue
          const qtdDireto = doGrupo.filter(v => v.status === "direto").length
          const qtdRemanejamentoMesmoDia = doGrupo.filter(v => v.status === "remanejamento-mesmo-dia").length
          const qtdRemanejamentoOutroDia = doGrupo.filter(v => v.status === "remanejamento-outro-dia").length
          const qtdNovoDia = doGrupo.filter(v => v.status === "novo-dia").length
          const qtdOportunidade = qtdDireto + qtdRemanejamentoMesmoDia + qtdRemanejamentoOutroDia + qtdNovoDia
          if (qtdOportunidade === 0) continue
          const qtdLivre = doGrupo.filter(v => v.status === "livre").length
          const pctAproveitamento = (qtdOportunidade / doGrupo.length) * 100
          const faixa = FAIXAS_CASCATA.find(f => pctAproveitamento >= f) ?? 50
          const maxSessoes = MAX_SESSOES_PERIODO[periodo]
          resultado.push({ unidade: unid, dia, periodo, especialidade, qtdDireto, qtdRemanejamentoMesmoDia, qtdRemanejamentoOutroDia, qtdNovoDia, qtdLivre, qtdOportunidade, maxSessoes, pctAproveitamento, faixa })
        }
      }
    }
  }
  return resultado.sort((a, b) => b.qtdOportunidade - a.qtdOportunidade || b.pctAproveitamento - a.pctAproveitamento)
}

export interface UnidadeComOportunidade {
  unidade: string
  qtdDireto: number
  qtdRemanejamentoMesmoDia: number
  qtdRemanejamentoOutroDia: number
  qtdNovoDia: number
  qtdLivre: number
}

/** Compara as 3 unidades pra um mesmo recorte de dia(s)/turno(s)/especialidade
 *  — equivalente a "Ou fixe numa unidade única" da Simulação de Novo
 *  Prestador (ranquearUnidades em simulacaoNovoPrestador.ts), só que pra
 *  oportunidade JÁ existente com quem está contratado, não uma contratação
 *  hipotética. Sempre varre as 3 unidades, independente de qual (se alguma)
 *  está selecionada no filtro de "Ocupar por unidade, dia e especialidade" —
 *  o usuário precisa ver o comparativo mesmo já tendo fixado uma unidade. */
export function compararUnidadesOportunidade(
  periodos: { dia: string; turno: Turno }[], especialidade: string, cRows: CsvRow[], gapMap: Record<string, GapItem>,
): UnidadeComOportunidade[] {
  const diasPresentes = [...new Set(periodos.map(p => p.dia))]
  if (!diasPresentes.length || !especialidade) return []

  const cRowsFiltradas = filtrarCapacidadeLivreReservada(cRows)
  const diretasGlobais = listarOportunidadesDiretas(cRowsFiltradas, gapMap)
  const indiceRemanejamento = construirIndiceRemanejamento(cRowsFiltradas)
  const novoDiaGlobais = listarOportunidadesNovoDia(cRowsFiltradas, gapMap, construirIndiceNovoDia(cRowsFiltradas, gapMap))

  return Object.keys(UNID_COR).map(unidade => {
    let qtdDireto = 0, qtdRemanejamentoMesmoDia = 0, qtdRemanejamentoOutroDia = 0, qtdNovoDia = 0, qtdLivre = 0
    for (const dia of diasPresentes) {
      const turnosDoDia = new Set(periodos.filter(p => p.dia === dia).map(p => p.turno))
      const vagas = gerarVagasCategoria(unidade, dia, especialidade, cRowsFiltradas, gapMap, diretasGlobais, indiceRemanejamento, novoDiaGlobais)
        .filter(v => turnosDoDia.has(v.turno))
      qtdDireto += vagas.filter(v => v.status === "direto").length
      qtdRemanejamentoMesmoDia += vagas.filter(v => v.status === "remanejamento-mesmo-dia").length
      qtdRemanejamentoOutroDia += vagas.filter(v => v.status === "remanejamento-outro-dia").length
      qtdNovoDia += vagas.filter(v => v.status === "novo-dia").length
      qtdLivre += vagas.filter(v => v.status === "livre").length
    }
    return { unidade, qtdDireto, qtdRemanejamentoMesmoDia, qtdRemanejamentoOutroDia, qtdNovoDia, qtdLivre }
  })
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
