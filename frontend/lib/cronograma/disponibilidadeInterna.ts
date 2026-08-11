// ─── Disponibilidade interna (Tarefa 4) ────────────────────────────────────────
// Um profissional já contratado pode estar livre exatamente no horário que se
// cogitaria abrir vaga de contratação. Mesmo padrão de detecção de "livre" já
// usado em saida.ts (Status do Agendamento === "Livre").
//
// listarOportunidadesDiretas é a FONTE ÚNICA de "quantos pacientes já têm
// cobertura direta" — usada tanto pela tela "Ocupar Profissionais
// Disponíveis" (lista navegável por profissional) quanto pelo desconto de
// disponibilidade interna na simulação de contratação
// (sugestaoContratacao.ts). Antes as duas tinham lógicas independentes que
// podiam divergir: a tela listava TODOS os candidatos elegíveis em CADA linha
// de profissional livre (sem descontar que só 1 paciente ocupa cada vaga), e
// a simulação só contava profissionais livres sem saber se aquela capacidade
// já estava reservada por um paciente real. Consolidado aqui: casa cada
// profissional livre com no máximo 1 paciente, respeitando o gap de cada um
// GLOBALMENTE (mesmo paciente não conta em mais vagas do que pode aceitar).

import { avaliarPeriodo, type CandidatoSlot, type GapItem } from "./simulacaoNovoPrestador"
import { turnoFromHora } from "./helpers"
import { TERAPIA_TO_ESP } from "./constants"
import type { CsvRow } from "@/types/cronograma"

export interface SlotLivre {
  profissional: string
  dia: string
  hora: string
  terapia: string
  especialidade: string | null
  unidade: string
}

export function listarSlotsLivres(cRows: CsvRow[]): SlotLivre[] {
  return cRows
    .filter(r => r["Status do Agendamento"] === "Livre" && r["Profissional"])
    .map(r => ({
      profissional: r["Profissional"],
      dia: r["Dia da Semana"],
      hora: String(r.HI_str || ""),
      terapia: r.Terapia,
      especialidade: TERAPIA_TO_ESP[r.Terapia] ?? null,
      unidade: String(r.Unidade || "Desconhecida"),
    }))
}

export interface OportunidadeDireta {
  profissional: string
  dia: string
  turno: "manha" | "tarde"
  hora: string
  unidade: string
  terapia: string
  especialidade: string
  paciente: CandidatoSlot
}

function chaveGrupo(dia: string, hora: string, unidade: string, especialidade: string): string {
  return `${dia}|||${hora}|||${unidade}|||${especialidade}`
}

/** Casa cada profissional livre (Status "Livre") com no máximo 1 paciente
 *  elegível — nunca lista o mesmo paciente como "coberto" em mais vagas do
 *  que o gap dele permite, e nunca atribui mais pacientes a um horário do que
 *  profissionais realmente livres ali. */
export function listarOportunidadesDiretas(
  cRows: CsvRow[], gapMap: Record<string, GapItem>,
): OportunidadeDireta[] {
  const slotsLivres = listarSlotsLivres(cRows).filter((s): s is SlotLivre & { especialidade: string } => !!s.especialidade)

  const porGrupo = new Map<string, SlotLivre[]>()
  for (const s of slotsLivres) {
    const chave = chaveGrupo(s.dia, s.hora, s.unidade, s.especialidade)
    if (!porGrupo.has(chave)) porGrupo.set(chave, [])
    porGrupo.get(chave)!.push(s)
  }

  const candidatosPorGrupo = new Map<string, CandidatoSlot[]>()
  for (const chave of porGrupo.keys()) {
    const [dia, hora, unidade, especialidade] = chave.split("|||")
    const turno = turnoFromHora(hora)
    const periodo = avaliarPeriodo(dia, turno, unidade, especialidade, cRows, gapMap)
    candidatosPorGrupo.set(chave, periodo.slots.find(sl => sl.hora === hora)?.candidatos ?? [])
  }

  // Teto de gap por paciente+especialidade, GLOBAL entre todos os grupos —
  // mesmo princípio de limitarCandidatosPorGap (simulacaoNovoPrestador.ts):
  // corta primeiro onde o paciente tem mais alternativas (mais substituível).
  interface Ocorrencia { chave: string; alternativas: number }
  const ocorrenciasPorPacienteEsp = new Map<string, Ocorrencia[]>()
  for (const [chave, candidatos] of candidatosPorGrupo) {
    const especialidade = chave.split("|||")[3]
    for (const c of candidatos) {
      const chavePac = `${c.pac}|||${especialidade}`
      const lista = ocorrenciasPorPacienteEsp.get(chavePac) ?? []
      lista.push({ chave, alternativas: candidatos.length - 1 })
      ocorrenciasPorPacienteEsp.set(chavePac, lista)
    }
  }
  const excluir = new Set<string>() // chave|||pac
  for (const [chavePac, ocorrencias] of ocorrenciasPorPacienteEsp) {
    const [pac, especialidade] = chavePac.split("|||")
    const gap = gapMap[`${pac}|||${especialidade}`]?.gap ?? 0
    if (ocorrencias.length <= gap) continue
    const excedentes = [...ocorrencias].sort((a, b) => a.alternativas - b.alternativas).slice(gap)
    for (const e of excedentes) excluir.add(`${e.chave}|||${pac}`)
  }

  const oportunidades: OportunidadeDireta[] = []
  for (const [chave, profissionaisLivres] of porGrupo) {
    const [dia, hora, unidade, especialidade] = chave.split("|||")
    const turno = turnoFromHora(hora)
    const sobreviventes = (candidatosPorGrupo.get(chave) ?? []).filter(c => !excluir.has(`${chave}|||${c.pac}`))
    const n = Math.min(profissionaisLivres.length, sobreviventes.length)
    for (let i = 0; i < n; i++) {
      oportunidades.push({
        profissional: profissionaisLivres[i].profissional,
        dia, turno, hora, unidade,
        terapia: profissionaisLivres[i].terapia,
        especialidade,
        paciente: sobreviventes[i],
      })
    }
  }
  return oportunidades
}

/** Capacidade de cobertura direta AINDA disponível por dia/hora/unidade/
 *  especialidade, descontando o que `listarOportunidadesDiretas` já reservou
 *  pra pacientes reais — é essa sobra que a simulação de contratação pode
 *  considerar (ver filtrarPorDisponibilidadeInterna em
 *  sugestaoContratacao.ts). Sem descontar isso, o mesmo profissional livre
 *  contaria como "cobertura" tanto na tela de disponibilidade interna quanto
 *  no desconto da simulação, como se pudesse atender dois pacientes ao mesmo
 *  tempo. */
export function capacidadeDiretaRestante(
  cRows: CsvRow[], gapMap: Record<string, GapItem>,
): Map<string, number> {
  const slotsLivres = listarSlotsLivres(cRows).filter((s): s is SlotLivre & { especialidade: string } => !!s.especialidade)
  const totalPorGrupo = new Map<string, number>()
  for (const s of slotsLivres) {
    const chave = chaveGrupo(s.dia, s.hora, s.unidade, s.especialidade)
    totalPorGrupo.set(chave, (totalPorGrupo.get(chave) ?? 0) + 1)
  }

  const usadoPorGrupo = new Map<string, number>()
  for (const o of listarOportunidadesDiretas(cRows, gapMap)) {
    const chave = chaveGrupo(o.dia, o.hora, o.unidade, o.especialidade)
    usadoPorGrupo.set(chave, (usadoPorGrupo.get(chave) ?? 0) + 1)
  }

  const restante = new Map<string, number>()
  for (const [chave, total] of totalPorGrupo) {
    restante.set(chave, Math.max(0, total - (usadoPorGrupo.get(chave) ?? 0)))
  }
  return restante
}
