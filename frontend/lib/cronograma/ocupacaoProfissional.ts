// ─── Ocupação de um profissional específico ────────────────────────────────
// Compõe o motor já existente (disponibilidadeInterna.ts + remanejamento.ts)
// pra responder: "dado o profissional P, quais pacientes com sessão pendente
// eu poderia colocar nos horários 'Livre' REAIS dele?" — direto (horário já
// livre) ou via remanejamento (outro profissional Q tem uma sessão
// conflitante nesse horário com um paciente candidato; essa sessão pode ser
// movida pra uma ponta adjacente da agenda do PRÓPRIO paciente, mantendo Q,
// liberando o horário pra P). Nunca mexe na agenda de P nem na de Q além de
// mover a sessão conflitante — P só ganha, nunca perde.

import { listarOportunidadesDiretas, listarSlotsLivres, unidadeDominanteDoDia } from "./disponibilidadeInterna"
import { encontrarCandidatosRemanejamento } from "./remanejamento"
import { listarOportunidadesNovoDia, type OportunidadeNovoDia } from "./novoDia"
import { turnoFromHora } from "./helpers"
import type { GapItem, Turno } from "./simulacaoNovoPrestador"
import type { RemanejamentoDetalhe } from "./sugestaoContratacaoTypes"
import type { CsvRow } from "@/types/cronograma"

export interface OportunidadeProfissional {
  dia: string
  turno: Turno
  hora: string
  unidade: string
  terapia: string
  especialidade: string
  modalidade: "direto" | "remanejamento" | "novo-dia"
  paciente: { pac: string; gap: number; aut: number; of: number }
  /** Só presente quando modalidade === "remanejamento" — antes/depois da agenda do PACIENTE candidato. */
  remanejamento?: RemanejamentoDetalhe
  /** Só presente quando modalidade === "novo-dia". */
  novoDia?: OportunidadeNovoDia
}

/** Profissionais com pelo menos 1 horário "Livre" na semana de referência —
 *  só esses têm alguma oportunidade real de crescer. */
export function listarProfissionaisComOportunidade(cRows: CsvRow[]): string[] {
  return [...new Set(
    listarSlotsLivres(cRows)
      .filter(s => s.especialidade && s.profissional)
      .map(s => s.profissional),
  )].sort()
}

/** Gera as oportunidades de ocupação de UM profissional específico, direto +
 *  via remanejamento, com teto de gap combinando as duas modalidades (um
 *  paciente não aparece como oportunidade além do que o gap dele permite,
 *  considerando só as oportunidades DESTE profissional). */
export function gerarOportunidadesProfissional(
  profissional: string, cRows: CsvRow[], gapMap: Record<string, GapItem>,
): OportunidadeProfissional[] {
  // R5.4: a unidade da vaga precisa ser a que já concentra a maioria das
  // sessões do paciente nesse dia — ver unidadeDominanteDoDia
  // (disponibilidadeInterna.ts) e o mesmo filtro em ocupacaoCategoria.ts.
  const diretas: OportunidadeProfissional[] = listarOportunidadesDiretas(cRows, gapMap)
    .filter(o => o.profissional === profissional)
    .filter(o => {
      const dominante = unidadeDominanteDoDia(o.paciente.pac, o.dia, cRows)
      return !dominante || dominante === o.unidade
    })
    .map(o => ({
      dia: o.dia, turno: o.turno, hora: o.hora, unidade: o.unidade, terapia: o.terapia, especialidade: o.especialidade,
      modalidade: "direto" as const,
      paciente: { pac: o.paciente.pac, gap: o.paciente.gap, aut: o.paciente.aut, of: o.paciente.of },
    }))

  const livresDoProf = listarSlotsLivres(cRows).filter(s => s.profissional === profissional && s.especialidade)
  const terapiaPorHora = new Map<string, string>()
  for (const s of livresDoProf) terapiaPorHora.set(`${s.dia}|||${s.hora}`, s.terapia)

  interface Grupo { dia: string; turno: Turno; unidade: string; especialidade: string; horas: Set<string> }
  const grupos = new Map<string, Grupo>()
  for (const s of livresDoProf) {
    const turno = turnoFromHora(s.hora)
    const chave = `${s.dia}|||${turno}|||${s.unidade}|||${s.especialidade}`
    let g = grupos.get(chave)
    if (!g) {
      g = { dia: s.dia, turno, unidade: s.unidade, especialidade: s.especialidade as string, horas: new Set() }
      grupos.set(chave, g)
    }
    g.horas.add(s.hora)
  }

  const horasComDireta = new Set(diretas.map(o => `${o.dia}|||${o.hora}`))
  const remanejamentoBruto: OportunidadeProfissional[] = []
  for (const g of grupos.values()) {
    const candidatos = encontrarCandidatosRemanejamento(g.dia, g.turno, g.unidade, g.especialidade, cRows, gapMap)
    for (const { hora, candidato } of candidatos) {
      if (!g.horas.has(hora)) continue // profissional não está livre exatamente aí
      if (horasComDireta.has(`${g.dia}|||${hora}`)) continue // já resolvido direto, remanejar seria redundante
      if (!candidato.remanejamento) continue
      const dominante = unidadeDominanteDoDia(candidato.paciente, g.dia, cRows)
      if (dominante && dominante !== g.unidade) continue
      remanejamentoBruto.push({
        dia: g.dia, turno: g.turno, hora, unidade: g.unidade,
        terapia: terapiaPorHora.get(`${g.dia}|||${hora}`) ?? candidato.remanejamento.terapiaRemanejada,
        especialidade: g.especialidade,
        modalidade: "remanejamento",
        paciente: { pac: candidato.paciente, gap: candidato.gap, aut: candidato.aut, of: candidato.of },
        remanejamento: candidato.remanejamento,
      })
    }
  }

  // Novo Dia: só tentada nas horas que sobraram sem Direto nem Remanejamento —
  // mesma ordem de prioridade de gerarVagasCategoria (ocupacaoCategoria.ts).
  const horasResolvidas = new Set([...diretas, ...remanejamentoBruto].map(o => `${o.dia}|||${o.hora}`))
  const novoDiaBruto: OportunidadeProfissional[] = listarOportunidadesNovoDia(cRows, gapMap)
    .filter(o => o.ancora.profissional === profissional && !horasResolvidas.has(`${o.dia}|||${o.ancora.hora}`))
    .map(o => {
      const g = o.gapPorEspecialidade[o.ancora.especialidade]
      return {
        dia: o.dia, turno: o.turno, hora: o.ancora.hora, unidade: o.unidade,
        terapia: o.ancora.terapia, especialidade: o.ancora.especialidade,
        modalidade: "novo-dia" as const,
        paciente: { pac: o.paciente, gap: (g?.aut ?? 0) - (g?.of ?? 0), aut: g?.aut ?? 0, of: g?.of ?? 0 },
        novoDia: o,
      }
    })

  return limitarPorGap([...diretas, ...remanejamentoBruto, ...novoDiaBruto], gapMap)
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.hora.localeCompare(b.hora))
}

/** Mesmo princípio de limitarCandidatosPorGap/limitarCandidatosPorGapNaSugestao
 *  (simulacaoNovoPrestador.ts / sugestaoContratacao.ts): um paciente não pode
 *  aparecer como oportunidade além do que o gap dele permite — corta primeiro
 *  onde ele tem mais alternativas (mais fácil de substituir). Escopo: só as
 *  oportunidades DESTE profissional (não coordena com o que outras telas
 *  possam estar oferecendo ao mesmo paciente com outro profissional). */
function limitarPorGap(
  oportunidades: OportunidadeProfissional[], gapMap: Record<string, GapItem>,
): OportunidadeProfissional[] {
  interface Ocorrencia { idx: number; alternativas: number }

  const porVaga = new Map<string, number>()
  for (const o of oportunidades) {
    const chave = `${o.dia}|||${o.turno}|||${o.hora}`
    porVaga.set(chave, (porVaga.get(chave) ?? 0) + 1)
  }

  const ocorrenciasPorPacienteEsp = new Map<string, Ocorrencia[]>()
  oportunidades.forEach((o, idx) => {
    const chaveVaga = `${o.dia}|||${o.turno}|||${o.hora}`
    const chavePac = `${o.paciente.pac}|||${o.especialidade}`
    const lista = ocorrenciasPorPacienteEsp.get(chavePac) ?? []
    lista.push({ idx, alternativas: (porVaga.get(chaveVaga) ?? 1) - 1 })
    ocorrenciasPorPacienteEsp.set(chavePac, lista)
  })

  const remover = new Set<number>()
  for (const [chavePac, ocorrencias] of ocorrenciasPorPacienteEsp) {
    const separador = chavePac.indexOf("|||")
    const pac = chavePac.slice(0, separador)
    const especialidade = chavePac.slice(separador + 3)
    const gap = gapMap[`${pac}|||${especialidade}`]?.gap ?? 0
    if (ocorrencias.length <= gap) continue
    const excedentes = [...ocorrencias].sort((a, b) => a.alternativas - b.alternativas).slice(gap)
    for (const e of excedentes) remover.add(e.idx)
  }
  if (!remover.size) return oportunidades

  return oportunidades.filter((_, idx) => !remover.has(idx))
}
