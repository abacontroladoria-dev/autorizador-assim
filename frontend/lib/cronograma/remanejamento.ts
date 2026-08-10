// ─── Modalidade "remanejamento" (Tarefa 5) ─────────────────────────────────────
// Além do encaixe por horário adjacente (slotValidoParaPaciente), tenta abrir
// espaço num horário-alvo já ocupado por OUTRO paciente/terapia, realocando essa
// sessão pra uma ponta adjacente do PRÓPRIO cronograma dela — sem trocar o
// profissional que a atende. Tenta primeiro o mesmo dia; se não achar vaga lá,
// tenta outro dia que o paciente já frequenta (mesma ideia de "Alterar dia,
// mesmos profissionais" de saida.ts/buildDiaMigracao, mas aqui só UMA sessão
// muda de dia — não o dia inteiro — pousando adjacente ao bloco que já existe
// no destino, em vez de exigir um dia totalmente livre). Como é sempre uma
// REALOCAÇÃO (nunca uma sessão nova), a quantidade autorizada da terapia
// remanejada nunca é alterada. Reaproveita as mesmas regras de sequenciamento e
// os mesmos conjuntos de exclusão de candidatos.ts/simulacaoNovoPrestador.ts —
// nenhuma regra de negócio é duplicada aqui, só recombinada.

import { pm, turnoFromHora } from "./helpers"
import { ABA_EXT, HORAS_GRID } from "./constants"
import { IGNORAR_NO_SEQUENCIAMENTO } from "./candidatos"
import { hiStr, pacientesDaUnidadeNoDia, type GapItem, type Turno } from "./simulacaoNovoPrestador"
import type { CsvRow } from "@/types/cronograma"
import type { CandidatoNaSugestao, RemanejamentoDetalhe } from "./sugestaoContratacaoTypes"

function rowUnidade(r: CsvRow): string { return String(r.Unidade || "Desconhecida") }

function movivel(terapia: string): boolean {
  return !IGNORAR_NO_SEQUENCIAMENTO.has(terapia) && !ABA_EXT.has(terapia)
}

function sequenciaValida(horasPm: number[]): boolean {
  const s = [...new Set(horasPm)].sort((a, b) => a - b)
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] !== 40) return false
  return true
}

/** O profissional tem, ele mesmo, um horário "Livre" cadastrado nesse dia/hora/
 *  unidade — não só "sem conflito", mas de fato presente na própria grade dele
 *  (mesmo padrão de profTemLivre em saida.ts). Evita mover a sessão pra um
 *  horário em que o profissional simplesmente não atua. */
function profissionalLivre(profissional: string, dia: string, hora: string, unidade: string, cRows: CsvRow[]): boolean {
  return cRows.some(r =>
    r["Status do Agendamento"] === "Livre" &&
    r["Profissional"] === profissional &&
    r["Dia da Semana"] === dia &&
    hiStr(r) === hora &&
    rowUnidade(r) === unidade,
  )
}

/** Primeira hora do HORAS_GRID que (a) mantém `horasBase ∪ {hora}` como uma
 *  sequência contígua de 40min (R5.1) e (b) tem o profissional livre lá. */
function encontrarHoraAdjacenteLivre(
  horasBase: number[], horaExcluirPm: number | null,
  profissional: string, diaDestino: string, unidadeConflito: string, cRows: CsvRow[],
): string | null {
  for (const hora of HORAS_GRID) {
    const horaPm = pm(hora)
    if (horaPm === null || horaPm === horaExcluirPm || horasBase.includes(horaPm)) continue
    if (!sequenciaValida([...horasBase, horaPm])) continue
    if (!profissionalLivre(profissional, diaDestino, hora, unidadeConflito, cRows)) continue
    return hora
  }
  return null
}

/** Tenta abrir espaço em (dia, horaAlvo) realocando, sem trocar o profissional,
 *  a sessão que já ocupa esse horário — primeiro pra uma ponta adjacente do
 *  MESMO dia; se não houver vaga, pra uma ponta adjacente de OUTRO dia que o
 *  paciente já frequenta. Retorna null se não há sessão ocupando o horário, se
 *  ela não é movível (ex.: Supervisão ABA), ou se não existe destino possível.
 *
 *  Importante: horaAlvo NÃO fica vaga no dia de `pac` — ela passa a ser
 *  ocupada pela nova sessão do candidato à contratação (é esse o ponto de
 *  todo o remanejamento). Por isso a validação de sequência no mesmo dia
 *  sempre inclui horaAlvo: o estado final é as outras sessões do dia + horaAlvo
 *  (nova sessão) + a hora de destino (sessão realocada) — nunca um buraco. */
export function tentarRemanejamento(
  pac: string, dia: string, horaAlvo: string, unidade: string, cRows: CsvRow[],
): RemanejamentoDetalhe | null {
  const horaAlvoPm = pm(horaAlvo)
  if (horaAlvoPm === null) return null

  const conflito = cRows.find(r =>
    r["Status do Agendamento"] === "Agendado" &&
    r["Nome Favorecido"] === pac &&
    r["Dia da Semana"] === dia &&
    pm(hiStr(r)) === horaAlvoPm,
  )
  if (!conflito || !movivel(conflito.Terapia)) return null

  const profissional = conflito.Profissional
  const unidadeConflito = rowUnidade(conflito)

  const outrasSessoesMoviveis = cRows.filter(r =>
    r !== conflito &&
    r["Status do Agendamento"] === "Agendado" &&
    r["Nome Favorecido"] === pac &&
    movivel(r.Terapia),
  )

  // 1) Mesmo dia, ponta adjacente ao que sobra do dia (+ o próprio horaAlvo,
  //    que continua ocupado — agora pela nova sessão do candidato).
  const horasMesmoDia = outrasSessoesMoviveis
    .filter(r => r["Dia da Semana"] === dia)
    .map(r => pm(hiStr(r)))
    .filter((h): h is number => h !== null)
  horasMesmoDia.push(horaAlvoPm)

  const horaMesmoDia = encontrarHoraAdjacenteLivre(horasMesmoDia, horaAlvoPm, profissional, dia, unidadeConflito, cRows)
  if (horaMesmoDia) {
    return {
      pacienteRemanejado: pac, terapiaRemanejada: conflito.Terapia, profissionalMantido: profissional, unidade,
      de: { dia, hora: horaAlvo }, para: { dia, hora: horaMesmoDia },
    }
  }

  // 2) Outro dia que o paciente já frequenta, na ponta adjacente do bloco que
  //    já existe lá — nunca um dia novo/isolado (evita violar R2.1 no destino).
  const diasDestino = [...new Set(outrasSessoesMoviveis.map(r => r["Dia da Semana"]))].filter(d => d !== dia)

  for (const diaDestino of diasDestino) {
    const horasDestino = outrasSessoesMoviveis
      .filter(r => r["Dia da Semana"] === diaDestino)
      .map(r => pm(hiStr(r)))
      .filter((h): h is number => h !== null)
    if (!horasDestino.length) continue

    const horaDestino = encontrarHoraAdjacenteLivre(horasDestino, null, profissional, diaDestino, unidadeConflito, cRows)
    if (horaDestino) {
      return {
        pacienteRemanejado: pac, terapiaRemanejada: conflito.Terapia, profissionalMantido: profissional, unidade,
        de: { dia, hora: horaAlvo }, para: { dia: diaDestino, hora: horaDestino },
      }
    }
  }

  return null
}

export interface CandidatoRemanejamento {
  hora: string
  candidato: CandidatoNaSugestao
}

/** Para cada horário do turno sem candidato por adjacência (bloqueado só
 *  porque o paciente com gap já tem outra sessão exatamente nesse horário),
 *  tenta liberar espaço via tentarRemanejamento. */
export function encontrarCandidatosRemanejamento(
  dia: string, turno: Turno, unidade: string, especialidade: string,
  cRows: CsvRow[], gapMap: Record<string, GapItem>,
): CandidatoRemanejamento[] {
  const frequentam = pacientesDaUnidadeNoDia(dia, unidade, cRows)
  const resultados: CandidatoRemanejamento[] = []

  for (const hora of HORAS_GRID.filter(h => turnoFromHora(h) === turno)) {
    for (const pac of frequentam) {
      const g = gapMap[`${pac}|||${especialidade}`]
      if (!g) continue

      const temConflito = cRows.some(r =>
        r["Status do Agendamento"] === "Agendado" && r["Nome Favorecido"] === pac &&
        r["Dia da Semana"] === dia && hiStr(r) === hora,
      )
      if (!temConflito) continue // sem conflito nesse horário — já seria candidato por adjacência, não remanejamento

      // tentarRemanejamento já valida sozinho R2.1/R5.1 pro estado FINAL (sessões
      // do dia menos o conflito, mais o conflito na nova posição, mais a nova
      // sessão em horaAlvo) — não pré-filtrar aqui com slotValidoParaPaciente
      // sobre "sessões sem o conflito": isso rejeitava incorretamente pacientes
      // cuja ÚNICA sessão do dia era a conflitante (R2.1 via essa checagem
      // parcial via zero sessões), mesmo quando o remanejamento resultaria em
      // 2 sessões válidas e contíguas no dia.
      const detalhe = tentarRemanejamento(pac, dia, hora, unidade, cRows)
      if (!detalhe) continue

      resultados.push({
        hora,
        candidato: {
          paciente: pac, gap: g.gap, aut: g.aut, of: g.of, turno, hora,
          modalidade: "remanejamento", remanejamento: detalhe,
          valorSessaoProjetado: null,
          ordemNaVaga: 1,
        },
      })
    }
  }
  return resultados
}
