// ─── Motor de sugestão automática de contratação (Tarefa 1) ────────────────────
// Cascata de ocupação prevista: tenta 70%, depois 60%, depois 50% — só desce de
// faixa se a faixa anterior não render nenhuma sugestão. Sempre prioriza cobrir
// o dia inteiro (manhã+tarde), caindo para turno avulso só quando isso rende
// mais ocupação do que o dia inteiro. Reaproveita 100% do motor de
// simulacaoNovoPrestador.ts — nenhuma regra de encaixe é duplicada aqui.

import {
  avaliarPeriodo, calcularGaps, construirAgendaNovoProfissional, gapsParaMapa, limitarCandidatosPorGap, listarEspecialidades, UNIDADES_SIMULACAO,
  type GapItem, type Turno,
} from "./simulacaoNovoPrestador"
import { DIAS_UTIL, ESP_CLINICO, EXCLUIR_OCUP, NOME_PARA_TERAPIA_ID, normTxt } from "./constants"
import { capacidadeDiretaRestante } from "./disponibilidadeInterna"
import { dowDeDiaSemana } from "./salas"
import { normalizarUnidadeOcupacao } from "./ocupacaoProf"
import { resolverValorSessao } from "./faturamentoProjecao"
import { getCalendario, type CalendarioResult } from "../remuneracao/datas"
import { encontrarCandidatosRemanejamento } from "./remanejamento"
import type { CsvRow, LaudoRow } from "@/types/cronograma"
import type { ConvenioValor, ConvenioValorPaciente } from "./convenioValoresTypes"
import type { FeriadoInfo } from "@/types/feriados"
import type { CandidatoNaSugestao, ProjecaoRemuneracaoSugestao, SalaVinculada, SugestaoContratacao } from "./sugestaoContratacaoTypes"
import type { SalaComOcupacao, SalaTerapiaExclusiva } from "./salasTypes"
import { construirIndiceExclusividadeTerapia, type IndiceExclusividadeTerapia } from "./exclusividadeTerapia"

const FAIXAS_CASCATA = [70, 60, 50] as const

/** Reaproveitado pelo hook de composição do pipeline (útil pra estágios que
 *  rodam fora de gerarCandidatosPorOcupacao, ex.: anexarModalidadeERemanejamento). */
export function calcularGapMap(lRows: LaudoRow[], cRows: CsvRow[]): Record<string, GapItem> {
  return gapsParaMapa(calcularGaps(lRows, cRows))
}

function idSugestao(unidade: string, especialidade: string, dia: string, turnos: Turno[]): string {
  return `${unidade}|||${especialidade}|||${dia}|||${turnos.join(",")}`
}

function avaliarCombo(
  unidade: string, especialidade: string, dia: string, turnos: Turno[],
  cRows: CsvRow[], gapMap: Record<string, GapItem>,
): { pct: number; candidatos: CandidatoNaSugestao[] } {
  const periodosBrutos = turnos.map(turno => avaliarPeriodo(dia, turno, unidade, especialidade, cRows, gapMap))
  // Sem isso, um paciente com gap=1 elegível em 3 horas do mesmo turno (ex.:
  // KYLIAN) apareceria como candidato nas 3, inflando ocupação e receita como
  // se fosse aceitar as 3 sessões — quando na real só pode aceitar 1.
  const periodos = limitarCandidatosPorGap(periodosBrutos, gapMap, especialidade)
  const agenda = construirAgendaNovoProfissional(periodos)
  const pct = agenda.porDia[0]?.pct ?? 0
  const candidatos: CandidatoNaSugestao[] = periodos.flatMap(p =>
    p.slots.flatMap(s => s.candidatos.map(c => ({
      paciente: c.pac, gap: c.gap, aut: c.aut, of: c.of, turno: p.turno, hora: s.hora,
      modalidade: "adjacente" as const,
      valorSessaoProjetado: null,
      ordemNaVaga: 1,
    }))),
  )
  return { pct, candidatos }
}

interface MelhorCombo { turnos: Turno[]; pct: number; candidatos: CandidatoNaSugestao[] }

/** "porTurno" — filtro 1: escolhe o que render mais % entre manhã, tarde ou dia
 *  inteiro isoladamente (comportamento original — pode ranquear alto mesmo que
 *  só o turno sozinho bata 70%, sem o profissional aceitar os dois turnos).
 *  "diaInteiro" — filtro 2: sempre avalia manhã+tarde JUNTOS, simulando que o
 *  profissional aceita os dois turnos do dia — a % cai quando um dos turnos é
 *  bem mais ocioso que o outro, e é exatamente essa % combinada que entra na
 *  cascata 70/60/50. */
export type ModoCascataOcupacao = "porTurno" | "diaInteiro"

function melhorComboDoDia(
  unidade: string, especialidade: string, dia: string, cRows: CsvRow[], gapMap: Record<string, GapItem>,
  modo: ModoCascataOcupacao,
): MelhorCombo {
  const diaInteiro = avaliarCombo(unidade, especialidade, dia, ["manha", "tarde"], cRows, gapMap)
  if (modo === "diaInteiro") return { turnos: ["manha", "tarde"], ...diaInteiro }

  const manha = avaliarCombo(unidade, especialidade, dia, ["manha"], cRows, gapMap)
  const tarde = avaliarCombo(unidade, especialidade, dia, ["tarde"], cRows, gapMap)
  const melhorTurnoAvulso: MelhorCombo = manha.pct >= tarde.pct
    ? { turnos: ["manha"], ...manha }
    : { turnos: ["tarde"], ...tarde }

  return melhorTurnoAvulso.pct > diaInteiro.pct
    ? melhorTurnoAvulso
    : { turnos: ["manha", "tarde"], ...diaInteiro }
}

export type FaixaCascata = (typeof FAIXAS_CASCATA)[number]

/** Todas as faixas de ocupação prevista (70/60/50), cada combo classificado
 *  na maior faixa que atinge — usado como valor padrão de `faixasSelecionadas`
 *  em gerarCandidatosPorOcupacao, mostrando tudo até o usuário filtrar. */
export const TODAS_FAIXAS_CASCATA: ReadonlySet<FaixaCascata> = new Set(FAIXAS_CASCATA)

/** Varre unidade × especialidade × dia avaliando ocupação prevista — a parte
 *  cara do motor (cada combo chama avaliarPeriodo, que varre cRows). Não
 *  recebe `faixasSelecionadas` de propósito: o resultado não depende de quais
 *  faixas o usuário marcou, só de `modo`/cRows/lRows, então dá pra memoizar
 *  esse cálculo separado do filtro e não repeti-lo toda vez que o usuário só
 *  troca quais faixas (70/60/50) quer ver (ver useSugestoesContratacao.ts). */
export function calcularTodosCombos(
  lRows: LaudoRow[], cRows: CsvRow[], modo: ModoCascataOcupacao = "porTurno",
): SugestaoContratacao[] {
  if (!cRows.length || !lRows.length) return []

  const gapMap = gapsParaMapa(calcularGaps(lRows, cRows))
  const especialidades = listarEspecialidades()

  const combos: SugestaoContratacao[] = []
  for (const unidade of UNIDADES_SIMULACAO) {
    for (const especialidade of especialidades) {
      for (const dia of DIAS_UTIL) {
        const { turnos, pct, candidatos } = melhorComboDoDia(unidade, especialidade, dia, cRows, gapMap, modo)
        if (!candidatos.length) continue
        const faixaCascata = FAIXAS_CASCATA.find(f => pct >= f)
        if (!faixaCascata) continue
        combos.push({
          id: idSugestao(unidade, especialidade, dia, turnos),
          unidade, especialidade, dia, turnos,
          pctOcupacaoPrevista: pct,
          faixaCascata,
          candidatos,
          modalidadeDominante: "adjacente",
          salaVinculada: null,
          projecaoRemuneracao: null,
        })
      }
    }
  }
  return combos
}

/** Filtra os combos já calculados pelas faixas selecionadas — leve, não repete
 *  nenhum cálculo de ocupação, só filtra e ordena. */
export function filtrarCombosPorFaixa(
  combos: SugestaoContratacao[], faixasSelecionadas: ReadonlySet<FaixaCascata> = TODAS_FAIXAS_CASCATA,
): SugestaoContratacao[] {
  if (!faixasSelecionadas.size) return []
  return combos
    .filter(c => faixasSelecionadas.has(c.faixaCascata))
    .sort((a, b) =>
      b.pctOcupacaoPrevista - a.pctOcupacaoPrevista ||
      a.unidade.localeCompare(b.unidade) ||
      a.especialidade.localeCompare(b.especialidade),
    )
}

/** Gera sugestões de contratação por faixa de ocupação prevista: cada combo
 *  (unidade+especialidade+dia) entra na MAIOR faixa que atinge (70%, senão
 *  60%, senão 50%) — `faixasSelecionadas` filtra quais dessas faixas o
 *  usuário quer ver, podendo escolher uma, duas ou as três juntas. `modo`
 *  decide se a % considerada é a do melhor turno isolado ("porTurno") ou
 *  sempre a de manhã+tarde combinados ("diaInteiro") — ver ModoCascataOcupacao.
 *  Combina calcularTodosCombos + filtrarCombosPorFaixa; prefira as duas
 *  funções separadas quando quiser memoizar a parte cara independente da
 *  seleção de faixas (ver useSugestoesContratacao.ts). */
export function gerarCandidatosPorOcupacao(
  lRows: LaudoRow[], cRows: CsvRow[], modo: ModoCascataOcupacao = "porTurno",
  faixasSelecionadas: ReadonlySet<FaixaCascata> = TODAS_FAIXAS_CASCATA,
): SugestaoContratacao[] {
  return filtrarCombosPorFaixa(calcularTodosCombos(lRows, cRows, modo), faixasSelecionadas)
}

/** Complementa os candidatos por adjacência com candidatos por remanejamento
 *  (Tarefa 5) nos horários do turno que ainda não têm candidato — nunca
 *  substitui um candidato por adjacência já encontrado nesse horário. Define
 *  modalidadeDominante pela modalidade mais frequente entre os candidatos.
 *  Aplica o teto de gap por cima do conjunto JÁ COMBINADO (ver
 *  limitarCandidatosPorGapNaSugestao) — sem isso um paciente já no limite do
 *  gap na camada de adjacência ainda ganharia candidatos extras de
 *  remanejamento em outras vagas, ultrapassando quantas sessões ele pode
 *  aceitar. */
export function anexarModalidadeERemanejamento(
  sugestoes: SugestaoContratacao[], cRows: CsvRow[], gapMap: Record<string, GapItem>,
): SugestaoContratacao[] {
  const comRemanejamento = sugestoes.map(s => {
    const horasCobertas = new Set(s.candidatos.map(c => `${c.turno}|||${c.hora}`))

    const candidatosRemanejamento = s.turnos
      .flatMap(turno => encontrarCandidatosRemanejamento(s.dia, turno, s.unidade, s.especialidade, cRows, gapMap))
      .filter(({ hora, candidato }) => {
        const chave = `${candidato.turno}|||${hora}`
        if (horasCobertas.has(chave)) return false
        horasCobertas.add(chave)
        return true
      })
      .map(({ candidato }) => candidato)

    if (!candidatosRemanejamento.length) return s

    const candidatos = [...s.candidatos, ...candidatosRemanejamento]
    const qtdAdjacente = candidatos.filter(c => c.modalidade === "adjacente").length
    const modalidadeDominante = qtdAdjacente >= candidatosRemanejamento.length ? "adjacente" as const : "remanejamento" as const

    return { ...s, candidatos, modalidadeDominante }
  })

  return limitarCandidatosPorGapNaSugestao(comRemanejamento, gapMap)
}

/** Mesmo teto de limitarCandidatosPorGap (simulacaoNovoPrestador.ts), mas
 *  sobre candidatos já enriquecidos com adjacência + remanejamento juntos,
 *  possivelmente espalhados por várias vagas (SugestaoContratacao[]) — sem
 *  isso um paciente com gap=1 pode acabar candidato em 2+ horários ao mesmo
 *  tempo, um por adjacência e outro por remanejamento, cada camada calculada
 *  isoladamente sem saber da outra. Mesma prioridade "menos alternativas
 *  primeiro" do teto original: corta onde o paciente tem MAIS concorrentes
 *  (mais fácil de substituir), mantendo onde ele é mais insubstituível.
 *  Agrupa por paciente+especialidade, já que o gap é por especialidade —
 *  cada `SugestaoContratacao` carrega a sua própria (s.especialidade). */
function limitarCandidatosPorGapNaSugestao(
  sugestoes: SugestaoContratacao[], gapMap: Record<string, GapItem>,
): SugestaoContratacao[] {
  interface Ocorrencia { sugestaoIdx: number; vagaChave: string; alternativas: number }

  const porVaga = new Map<string, number>()
  sugestoes.forEach((s, sugestaoIdx) => {
    for (const c of s.candidatos) {
      const chave = `${sugestaoIdx}|||${c.turno}|||${c.hora}`
      porVaga.set(chave, (porVaga.get(chave) ?? 0) + 1)
    }
  })

  const ocorrenciasPorPacienteEsp = new Map<string, Ocorrencia[]>()
  sugestoes.forEach((s, sugestaoIdx) => {
    for (const c of s.candidatos) {
      const vagaChave = `${sugestaoIdx}|||${c.turno}|||${c.hora}`
      const chavePac = `${c.paciente}|||${s.especialidade}`
      const lista = ocorrenciasPorPacienteEsp.get(chavePac) ?? []
      lista.push({ sugestaoIdx, vagaChave, alternativas: (porVaga.get(vagaChave) ?? 1) - 1 })
      ocorrenciasPorPacienteEsp.set(chavePac, lista)
    }
  })

  const remover = new Set<string>() // vagaChave|||paciente
  for (const [chavePac, ocorrencias] of ocorrenciasPorPacienteEsp) {
    const [paciente, especialidade] = chavePac.split("|||")
    const gap = gapMap[`${paciente}|||${especialidade}`]?.gap ?? 0
    if (ocorrencias.length <= gap) continue
    const excedentes = [...ocorrencias].sort((a, b) => a.alternativas - b.alternativas).slice(gap)
    for (const e of excedentes) remover.add(`${e.vagaChave}|||${paciente}`)
  }
  if (!remover.size) return sugestoes

  return sugestoes
    .map((s, sugestaoIdx) => ({
      ...s,
      candidatos: s.candidatos.filter(c => !remover.has(`${sugestaoIdx}|||${c.turno}|||${c.hora}|||${c.paciente}`)),
    }))
    .filter(s => s.candidatos.length > 0)
}

/** Reduz a fila de candidatos de cada vaga pela capacidade interna AINDA
 *  disponível (Tarefa 4) — não é tudo-ou-nada: 1 profissional interno livre
 *  nesse exato dia/hora/unidade/especialidade cobre 1 paciente da fila, não a
 *  vaga inteira. Ex.: 4 candidatos disputando uma vaga e 1 profissional já
 *  livre → sobram 3 candidatos que realmente precisariam de contratação
 *  nova; só quando a capacidade cobre TODOS os candidatos da vaga ela some de
 *  vez. A capacidade vem de `capacidadeDiretaRestante`, a MESMA fonte usada
 *  pela tela "Ocupar Profissionais Disponíveis" — já descontando os
 *  pacientes reais que essa tela já casou com esses profissionais livres,
 *  pra não contar a mesma vaga livre como cobertura duas vezes. Os
 *  candidatos restantes de uma vaga parcialmente coberta ganham
 *  `cobertosInternamente` com quantos já têm cobertura, pra UI avisar sem
 *  esconder a necessidade real de contratação. Descarta a sugestão inteira
 *  só quando todas as suas vagas somem. */
export function filtrarPorDisponibilidadeInterna(
  sugestoes: SugestaoContratacao[], cRows: CsvRow[], gapMap: Record<string, GapItem>,
): SugestaoContratacao[] {
  const capacidadePorGrupo = capacidadeDiretaRestante(cRows, gapMap)
  return sugestoes
    .map(s => {
      const porVaga = new Map<string, CandidatoNaSugestao[]>()
      for (const c of s.candidatos) {
        const chave = chaveVaga(c)
        if (!porVaga.has(chave)) porVaga.set(chave, [])
        porVaga.get(chave)!.push(c)
      }
      const candidatos = [...porVaga.values()].flatMap(daVaga => {
        const capacidade = capacidadePorGrupo.get(`${s.dia}|||${daVaga[0].hora}|||${s.unidade}|||${s.especialidade}`) ?? 0
        if (capacidade <= 0) return daVaga
        const restantes = daVaga.slice(0, Math.max(0, daVaga.length - capacidade))
        const cobertos = daVaga.length - restantes.length
        return cobertos > 0 ? restantes.map(c => ({ ...c, cobertosInternamente: cobertos })) : restantes
      })
      return { ...s, candidatos }
    })
    .filter(s => s.candidatos.length > 0)
}

const TURNO_PARA_ALOCACAO: Record<Turno, "Manhã" | "Tarde"> = { manha: "Manhã", tarde: "Tarde" }

/** Sala livre em TODOS os turnos exigidos pela sugestão (mesma unidade),
 *  respeitando exclusividade de sala×terapia: salas reservadas só entram como
 *  candidatas pra terapias que constam na sua lista; terapias com regra
 *  'obrigatoria' só podem usar as salas reservadas pra elas. Entre as
 *  candidatas restantes, prioriza as reservadas pra essa terapia (regra
 *  'preferencial') e por fim a de menor pctOcupacaoSemanal (mais ociosa). */
function encontrarSalaLivre(
  unidade: string, dia: string, turnos: Turno[], salasComOcupacao: SalaComOcupacao[],
  terapiaId: number | null, indiceExclusividade: IndiceExclusividadeTerapia,
): SalaVinculada | null {
  const unidadeAlvo = normalizarUnidadeOcupacao(unidade)
  const dow = dowDeDiaSemana(dia)
  if (dow === null) return null
  const turnosAlocacao = turnos.map(t => TURNO_PARA_ALOCACAO[t])

  const livres = salasComOcupacao.filter(({ sala, slots }) => {
    if (normalizarUnidadeOcupacao(sala.unidade_nome) !== unidadeAlvo) return false
    return turnosAlocacao.every(turno =>
      slots.some(s => s.dow === dow && s.turno === turno && s.status === "livre"),
    )
  })
  if (!livres.length) return null

  const { salaParaTerapias, terapiasObrigatorias } = indiceExclusividade
  const ehExclusivaDaTerapia = (salaId: string) => terapiaId !== null && (salaParaTerapias.get(salaId)?.has(terapiaId) ?? false)
  const ehSalaReservada = (salaId: string) => (salaParaTerapias.get(salaId)?.size ?? 0) > 0

  const permitidas = livres.filter(({ sala }) => {
    if (ehSalaReservada(sala.id)) return ehExclusivaDaTerapia(sala.id)
    return terapiaId === null || !terapiasObrigatorias.has(terapiaId)
  })
  if (!permitidas.length) return null

  const preferidas = permitidas.filter(({ sala }) => ehExclusivaDaTerapia(sala.id))
  const pool = preferidas.length ? preferidas : permitidas

  const melhor = pool.sort((a, b) => (a.pctOcupacaoSemanal ?? 0) - (b.pctOcupacaoSemanal ?? 0))[0]
  return {
    salaId: melhor.sala.id,
    nomeExibicao: melhor.sala.nome_exibicao,
    numeroSala: melhor.sala.numero_sala,
    unidade: melhor.sala.unidade_nome,
    pctOcupacaoSemanalAtual: melhor.pctOcupacaoSemanal,
  }
}

/** Vincula a melhor sala livre disponível a cada sugestão (Tarefa 2),
 *  respeitando exclusividade de sala×terapia (Tarefa 6 — ver
 *  ExclusividadeTerapiaModal.tsx). Nunca bloqueia a sugestão — sem sala
 *  livre compatível, salaVinculada fica null. */
export function anexarSala(
  sugestoes: SugestaoContratacao[], salasComOcupacao: SalaComOcupacao[],
  exclusividades: SalaTerapiaExclusiva[] = [],
): SugestaoContratacao[] {
  const indiceExclusividade = construirIndiceExclusividadeTerapia(exclusividades)
  return sugestoes.map(s => {
    const terapiaNome = terapiaDaEspecialidade(s.especialidade)
    const terapiaId = NOME_PARA_TERAPIA_ID[normTxt(terapiaNome)] ?? null
    return {
      ...s,
      salaVinculada: encontrarSalaLivre(s.unidade, s.dia, s.turnos, salasComOcupacao, terapiaId, indiceExclusividade),
    }
  })
}

/** Especialidade → nome de terapia representativo (mesma escolha usada no
 *  detalhe da simulação: primeira terapia clínica da especialidade que não é
 *  administrativa). */
export function terapiaDaEspecialidade(especialidade: string): string {
  return (ESP_CLINICO[especialidade] || [especialidade]).filter(t => !EXCLUIR_OCUP.has(t))[0] || especialidade
}

export function primeiroConvenioDoPaciente(paciente: string, cRows: CsvRow[]): string {
  const row = cRows.find(r => r["Nome Favorecido"] === paciente && r["Convênio"])
  return row?.["Convênio"] || "Não informado"
}

/** ID estável do paciente (csv_grades_profissionais.paciente_id) — sem isso,
 *  resolverValorSessao nunca casa uma exceção de valor por paciente que tenha
 *  paciente_id cadastrado (o caso normal, via tela de cadastro): a checagem
 *  por ID só cai pro nome quando a exceção NÃO tem ID, e passar null aqui
 *  fazia toda exceção com ID real ser ignorada, mesmo com o nome batendo. */
function pacienteIdDoPaciente(paciente: string, cRows: CsvRow[]): number | null {
  const row = cRows.find(r => r["Nome Favorecido"] === paciente && r.PacienteId != null)
  return row?.PacienteId ?? null
}

function pacienteTemPsicologiaAba(paciente: string, cRows: CsvRow[]): boolean {
  return cRows.some(r => r["Nome Favorecido"] === paciente && r.Terapia === "Psicologia ABA")
}

function projetarReceitaCandidato(
  candidato: CandidatoNaSugestao, dia: string, especialidade: string, cRows: CsvRow[],
  regrasGerais: ConvenioValor[], excecoesPaciente: ConvenioValorPaciente[], cal: CalendarioResult | null,
): { valorSemana: number; valorMes: number; convenio: string; semValor: boolean } {
  const convenio = primeiroConvenioDoPaciente(candidato.paciente, cRows)
  const terapiaNome = terapiaDaEspecialidade(especialidade)
  const temPsicologiaAba = pacienteTemPsicologiaAba(candidato.paciente, cRows)
  const pacienteId = pacienteIdDoPaciente(candidato.paciente, cRows)
  const terapiaId = NOME_PARA_TERAPIA_ID[normTxt(terapiaNome)] ?? null

  const { valor, origem } = resolverValorSessao(regrasGerais, excecoesPaciente, {
    convenio, pacienteId, paciente: candidato.paciente, terapiaId, terapiaNome, temPsicologiaAba,
  })

  const dow = dowDeDiaSemana(dia)
  const ocorrenciasMes = dow !== null ? (cal?.counts[dow as 1 | 2 | 3 | 4 | 5] ?? 0) : 0
  const valorSemana = valor ?? 0
  return { valorSemana, valorMes: valorSemana * ocorrenciasMes, convenio, semValor: origem === "sem_valor" }
}

function chaveVaga(c: { turno: Turno; hora: string }): string {
  return `${c.turno}|||${c.hora}`
}

/** Quantas sessões (qualquer terapia, qualquer dia) o paciente já tem agendadas
 *  na semana — proxy de "quanto frequenta a clínica", usado só como desempate
 *  quando dois candidatos da mesma vaga têm o mesmo valor de sessão. */
function frequenciaSemanalPorPaciente(cRows: CsvRow[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const r of cRows) {
    if (r["Status do Agendamento"] !== "Agendado") continue
    const pac = r["Nome Favorecido"]
    if (!pac) continue
    mapa.set(pac, (mapa.get(pac) ?? 0) + 1)
  }
  return mapa
}

/** Projeta a receita de cada sugestão (Tarefa 3) e ordena por lucratividade
 *  (com % de ocupação como desempate). Quando mais de um paciente disputa a
 *  MESMA vaga (mesmo turno+hora), só o mais rentável entra na receita
 *  projetada — a vaga só pode ser ocupada por um paciente por vez, então
 *  somar o valor de todos os concorrentes superestimaria a receita. Entre
 *  candidatos com o MESMO valor de sessão, desempata por frequência semanal
 *  na clínica (quem já frequenta mais tende a gerar mais receita ao longo do
 *  tempo). Cada candidato ganha `ordemNaVaga` (1 = deveria ser ofertado
 *  primeiro) pra a UI deixar essa priorização explícita. Sessões sem regra de
 *  valor cadastrada contam à parte em sessoesSemValor — não derrubam a
 *  sugestão pro fim da lista. */
export function anexarRemuneracaoEOrdenar(
  sugestoes: SugestaoContratacao[], cRows: CsvRow[],
  regrasGerais: ConvenioValor[], excecoesPaciente: ConvenioValorPaciente[],
  mesReferencia: { ano: number; mes: number } | null,
  feriados: Record<string, FeriadoInfo> = {},
): SugestaoContratacao[] {
  const cal = mesReferencia ? getCalendario(mesReferencia.ano, mesReferencia.mes, feriados) : null
  const frequenciaPorPaciente = frequenciaSemanalPorPaciente(cRows)

  const comProjecao = sugestoes.map(s => {
    const comValor = s.candidatos.map(candidato => {
      const { valorSemana, valorMes, convenio, semValor } = projetarReceitaCandidato(
        candidato, s.dia, s.especialidade, cRows, regrasGerais, excecoesPaciente, cal,
      )
      return { candidato, valorSemana, valorMes, convenio, semValor }
    })

    const porVaga = new Map<string, typeof comValor>()
    for (const item of comValor) {
      const chave = chaveVaga(item.candidato)
      if (!porVaga.has(chave)) porVaga.set(chave, [])
      porVaga.get(chave)!.push(item)
    }

    const porConvenioMap = new Map<string, number>()
    let receitaSemanalProjetada = 0
    let receitaMensalProjetada = 0
    let sessoesSemValor = 0
    const candidatosComOrdem: CandidatoNaSugestao[] = []

    for (const itensDaVaga of porVaga.values()) {
      const valorOrdenacao = (item: (typeof itensDaVaga)[number]) => item.semValor ? -Infinity : item.valorSemana
      const ordenados = [...itensDaVaga].sort((a, b) =>
        valorOrdenacao(b) - valorOrdenacao(a) ||
        (frequenciaPorPaciente.get(b.candidato.paciente) ?? 0) - (frequenciaPorPaciente.get(a.candidato.paciente) ?? 0),
      )
      ordenados.forEach((item, i) => {
        const ordemNaVaga = i + 1
        candidatosComOrdem.push({ ...item.candidato, valorSessaoProjetado: item.semValor ? null : item.valorSemana, ordemNaVaga })
        if (ordemNaVaga !== 1) return // só a melhor oferta da vaga conta na receita — a vaga só é ocupada uma vez
        if (item.semValor) sessoesSemValor++
        receitaSemanalProjetada += item.valorSemana
        receitaMensalProjetada += item.valorMes
        porConvenioMap.set(item.convenio, (porConvenioMap.get(item.convenio) ?? 0) + item.valorMes)
      })
    }

    const projecaoRemuneracao: ProjecaoRemuneracaoSugestao = {
      receitaSemanalProjetada, receitaMensalProjetada, sessoesSemValor,
      porConvenio: [...porConvenioMap.entries()]
        .map(([convenio, receita]) => ({ convenio, receitaMensalProjetada: receita }))
        .sort((a, b) => b.receitaMensalProjetada - a.receitaMensalProjetada),
    }
    return { ...s, candidatos: candidatosComOrdem, projecaoRemuneracao }
  })

  return comProjecao.sort((a, b) =>
    (b.projecaoRemuneracao?.receitaMensalProjetada ?? 0) - (a.projecaoRemuneracao?.receitaMensalProjetada ?? 0) ||
    b.pctOcupacaoPrevista - a.pctOcupacaoPrevista,
  )
}
