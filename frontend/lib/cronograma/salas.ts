// ─── LÓGICA DE CÁLCULO: OCUPAÇÃO DE SALAS ────────────────────────────────────
// Adaptado de calculadora-remuneracao/src/utils/salas.js (calcularResumoSalas,
// cruzarSalasComGradeProfissionais) + ocupacao.js (corFaixaOcupacao). Reescrito
// em TypeScript para cruzar o cadastro estrutural de salas (cronograma_salas)
// com dados de agendamento REAIS já existentes em csv_grades_profissionais, em
// vez de CSV importado manualmente + localStorage.

import { normalizarUnidadeOcupacao, turnoDoHorario, corFaixaOcupacao } from "./ocupacaoProf"
import { pm, cleanTxt } from "./helpers"
import { normTxt } from "./constants"
import { capacidadeProjetadaSala } from "./salasTypes"
import type {
  Sala,
  AgendaSalaRow,
  AlocacaoSala,
  AlocacaoCardSlot,
  SlotOcupacaoSala,
  SalaComOcupacao,
  ResumoUnidadeSalas,
  ResumoTurnoUnidadeSalas,
  StatusOcupacaoSlot,
} from "./salasTypes"

export { corFaixaOcupacao }

// ─── DIA DA SEMANA ────────────────────────────────────────────────────────────

const DOW_POR_NOME: Record<string, number> = {
  "segunda-feira": 1, "segunda": 1,
  "terca-feira": 2, "terça-feira": 2, "terca": 2, "terça": 2,
  "quarta-feira": 3, "quarta": 3,
  "quinta-feira": 4, "quinta": 4,
  "sexta-feira": 5, "sexta": 5,
}

export function dowDeDiaSemana(diaSemana: string | null | undefined): number | null {
  const n = normTxt(diaSemana)
  return DOW_POR_NOME[n] ?? null
}

// ─── CRUZAMENTO: SALA × AGENDAMENTO ───────────────────────────────────────────
//
// O texto livre `sala_nome` da agenda real (ex.: "Unid. Realengo - Sala 18
// (Coordenação de caso)") tem variações de observação/capitalização entre
// registros do mesmo cômodo físico. Uma comparação por substring simples é
// insegura (ex.: "Sala 1" é substring de "Sala 10", "Sala 11" ... "Sala 19"),
// então o cruzamento é feito de forma estrutural: extrai-se {unidade, número}
// do texto e compara-se com os campos já normalizados de `cronograma_salas`,
// em vez de comparar as strings inteiras.

/** Extrai {unidade, numeroSala} de um `sala_nome` livre vindo da agenda (ex.: "Unid. Realengo - Sala 18 (Coordenação de caso)"). */
export function parseSalaAgenda(salaNomeRaw: string | null | undefined): { unidade: string; numeroSala: string } | null {
  const raw = cleanTxt(salaNomeRaw)
  if (!raw) return null
  const m = raw.match(/^Unid\.?\s*([^-–—]+?)\s*[-–—]\s*Sala\s*0*(\d+)\b/i)
  if (!m) return null
  return { unidade: normalizarUnidadeOcupacao(m[1]), numeroSala: m[2] }
}

/** Normaliza número de sala para comparação (remove zeros à esquerda: "09" -> "9"). */
export function normNumeroSala(numero: string | null | undefined): string {
  const raw = cleanTxt(numero)
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? String(n) : raw
}

function salaCasaComAgenda(sala: Sala, salaNomeAgenda: string | null): boolean {
  const parsed = parseSalaAgenda(salaNomeAgenda)
  if (!parsed) return false
  return normalizarUnidadeOcupacao(sala.unidade_nome) === parsed.unidade
    && normNumeroSala(sala.numero_sala) === parsed.numeroSala
}

/** Filtra linhas de agenda cuja `sala_nome` corresponde estruturalmente (unidade + número) à sala. */
export function linhasDaSala(sala: Sala, linhas: AgendaSalaRow[]): AgendaSalaRow[] {
  return linhas.filter(r => salaCasaComAgenda(sala, r.sala_nome))
}

// Uma sala "única" atende, ao longo de um turno inteiro, VÁRIOS pacientes/
// profissionais diferentes em sequência (blocos de 40min) — isso é normal,
// não é ocupação simultânea. `capacidadeProjetadaSala` representa capacidade
// POR BLOCO de horário (1/2/3 pacientes ao mesmo tempo), não por turno inteiro.
// O nº de blocos de 40min por turno segue a mesma grade fixa já usada em todo
// o módulo Cronograma (manhã 08:00–12:00 = 6 blocos; tarde = 7 blocos — ver
// `agenda.service.ts`/legado `slotsTurno()`).
const BLOCOS_POR_TURNO: Record<"Manhã" | "Tarde", number> = { "Manhã": 6, "Tarde": 7 }

function statusDoSlot(
  status: Sala["status"],
  capacidadeProjetada: number,
  numAlocacoes: number,
): StatusOcupacaoSlot {
  if (status === "adm") return "adm"
  if (status === "bloqueada") return "bloqueado"
  if (numAlocacoes === 0) return "livre"
  if (numAlocacoes >= capacidadeProjetada) return "ocupado"
  return "parcial"
}

/**
 * Calcula os 10 slots (5 dias × 2 turnos) de uma sala a partir das ALOCAÇÕES
 * (planejamento — quem é o "dono" recorrente do bloco), cruzando cada
 * alocação com as sessões reais dessa pessoa nesse sala/dia/turno apenas para
 * exibir a proporção "X/Y com paciente" (informativo, não valida nada).
 */
export function calcularSlotsDaSala(
  sala: Sala,
  alocacoesSala: AlocacaoSala[],
  linhasSala: AgendaSalaRow[],
): SlotOcupacaoSala[] {
  const capacidadeProjetada = capacidadeProjetadaSala(sala.capacidade, sala.status)

  // sessões reais "Agendado" agrupadas por profissional (normalizado) + dow + turno
  const sessoesPorProfissional = new Map<string, number>()
  linhasSala.forEach(r => {
    const dow = dowDeDiaSemana(r.dia_semana)
    if (!dow) return
    if (!normTxt(r.status_agendamento).includes("agendado")) return
    const turno = turnoDoHorario(pm(r.hora_inicial))
    const prof = cleanTxt(r.profissional_nome)
    if (!prof) return
    const key = `${dow}|${turno}|${normTxt(prof)}`
    sessoesPorProfissional.set(key, (sessoesPorProfissional.get(key) ?? 0) + 1)
  })

  const alocacoesPorSlot = new Map<string, AlocacaoSala[]>()
  alocacoesSala.forEach(a => {
    const key = `${a.dow}-${a.turno}`
    if (!alocacoesPorSlot.has(key)) alocacoesPorSlot.set(key, [])
    alocacoesPorSlot.get(key)!.push(a)
  })

  const slots: SlotOcupacaoSala[] = []
  for (let dow = 1; dow <= 5; dow++) {
    for (const turno of ["Manhã", "Tarde"] as const) {
      const key = `${dow}-${turno}`
      const alocacoesDoSlot = alocacoesPorSlot.get(key) ?? []
      const capacidadeBloco = BLOCOS_POR_TURNO[turno]

      const cards: AlocacaoCardSlot[] = alocacoesDoSlot.map(a => {
        const sessoesReais = sessoesPorProfissional.get(`${dow}|${turno}|${normTxt(a.profissional_nome)}`) ?? 0
        const sessoesLimitadas = Math.min(sessoesReais, capacidadeBloco)
        return {
          alocacaoId: a.id,
          profissionalNome: a.profissional_nome,
          terapiaNome: a.terapia_nome,
          sessoesReais: sessoesLimitadas,
          sessoesCapacidadeTurno: capacidadeBloco,
          pctOcupacao: capacidadeBloco > 0 ? sessoesLimitadas / capacidadeBloco : null,
          semCruzamentoCsv: sessoesReais === 0,
        }
      })

      const status = statusDoSlot(sala.status, capacidadeProjetada, cards.length)
      const inconsistente = sala.status === "ativa" && cards.length > capacidadeProjetada

      slots.push({
        salaId: sala.id,
        dow,
        turno,
        capacidadeProjetada,
        alocacoes: cards,
        status,
        inconsistente,
      })
    }
  }

  return slots
}

export function calcularOcupacaoDaSala(sala: Sala, alocacoes: AlocacaoSala[], linhas: AgendaSalaRow[]): SalaComOcupacao {
  const linhasSala = linhasDaSala(sala, linhas)
  const alocacoesSala = alocacoes.filter(a => a.sala_id === sala.id)
  const slots = calcularSlotsDaSala(sala, alocacoesSala, linhasSala)
  const relevantes = slots.filter(s => s.status !== "adm" && s.status !== "bloqueado")
  const ocupados = relevantes.filter(s => s.status === "ocupado" || s.status === "parcial").length
  const pctOcupacaoSemanal = relevantes.length > 0 ? ocupados / relevantes.length : null
  return { sala, slots, pctOcupacaoSemanal }
}

// ─── RESUMO POR UNIDADE (adaptado de calcularResumoSalas) ────────────────────

export function calcularResumoUnidades(salas: Sala[], alocacoes: AlocacaoSala[], linhas: AgendaSalaRow[]): ResumoUnidadeSalas[] {
  const porUnidade = new Map<string, Sala[]>()
  salas.forEach(s => {
    const unidade = normalizarUnidadeOcupacao(s.unidade_nome)
    if (!porUnidade.has(unidade)) porUnidade.set(unidade, [])
    porUnidade.get(unidade)!.push(s)
  })

  const resumos: ResumoUnidadeSalas[] = []

  porUnidade.forEach((salasUnidade, unidade) => {
    let slotsTotal = 0, slotsOcupados = 0, slotsLivres = 0, slotsBloqueados = 0
    let capacidadeSimultanea = 0
    let salasAtivas = 0, salasBloqueadas = 0, salasAdm = 0
    let inconsistencias = 0
    const porTurnoAcc: Record<"Manhã" | "Tarde", ResumoTurnoUnidadeSalas> = {
      Manhã: { turno: "Manhã", slotsTotal: 0, slotsOcupados: 0, slotsLivres: 0, slotsBloqueados: 0, pct: null },
      Tarde: { turno: "Tarde", slotsTotal: 0, slotsOcupados: 0, slotsLivres: 0, slotsBloqueados: 0, pct: null },
    }
    const terapiaAcc = new Map<string, number>()

    salasUnidade.forEach(sala => {
      if (sala.status === "ativa") salasAtivas++
      else if (sala.status === "bloqueada") salasBloqueadas++
      else if (sala.status === "adm") salasAdm++
      capacidadeSimultanea += capacidadeProjetadaSala(sala.capacidade, sala.status)

      const { slots } = calcularOcupacaoDaSala(sala, alocacoes, linhas)
      slots.forEach(slot => {
        if (slot.status === "adm") return
        const turnoBucket = porTurnoAcc[slot.turno]
        if (slot.status === "bloqueado") {
          slotsBloqueados++
          turnoBucket.slotsBloqueados++
          return
        }
        slotsTotal++
        turnoBucket.slotsTotal++
        if (slot.status === "ocupado" || slot.status === "parcial") {
          slotsOcupados++
          turnoBucket.slotsOcupados++
        } else {
          slotsLivres++
          turnoBucket.slotsLivres++
        }
        if (slot.inconsistente) inconsistencias++
        slot.alocacoes.forEach(card => {
          const terapia = cleanTxt(card.terapiaNome) || "Sem especialidade"
          terapiaAcc.set(terapia, (terapiaAcc.get(terapia) ?? 0) + Math.max(card.sessoesReais, 1))
        })
      })
    })

    ;(["Manhã", "Tarde"] as const).forEach(t => {
      const b = porTurnoAcc[t]
      b.pct = b.slotsTotal > 0 ? b.slotsOcupados / b.slotsTotal : null
    })

    resumos.push({
      unidade,
      salasTotal: salasUnidade.length,
      salasAtivas,
      salasBloqueadas,
      salasAdm,
      capacidadeSimultanea,
      slotsTotal,
      slotsOcupados,
      slotsLivres,
      slotsBloqueados,
      pct: slotsTotal > 0 ? slotsOcupados / slotsTotal : null,
      porTurno: [porTurnoAcc.Manhã, porTurnoAcc.Tarde],
      porTerapia: [...terapiaAcc.entries()]
        .map(([terapia, sessoes]) => ({ terapia, sessoes }))
        .sort((a, b) => b.sessoes - a.sessoes),
      inconsistencias,
    })
  })

  return resumos.sort((a, b) => a.unidade.localeCompare(b.unidade))
}

/**
 * Sugere números de sala livres para uma unidade, a partir dos números já em
 * uso (`uq_cronograma_salas_unidade_numero` é único por unidade+número, então
 * digitar um número ocupado sempre falha no salvar). Prioriza os "buracos" na
 * sequência (ex.: já tem 1,2,3,5 → sugere o 4 primeiro) e complementa com os
 * próximos números seguidos após o maior já cadastrado, até `maxSugestoes`.
 * Números de sala não numéricos (texto livre) são ignorados na sequência —
 * não têm como participar de um "próximo número".
 */
export function sugerirNumerosSalaDisponiveis(numerosUsados: string[], maxSugestoes = 10): number[] {
  const usados = new Set(
    numerosUsados
      .map(n => parseInt(normNumeroSala(n), 10))
      .filter((n): n is number => Number.isFinite(n) && n > 0),
  )
  if (!usados.size) return Array.from({ length: maxSugestoes }, (_, i) => i + 1)

  const maior = Math.max(...usados)
  const buracos: number[] = []
  for (let i = 1; i < maior; i++) {
    if (!usados.has(i)) buracos.push(i)
  }

  const seguintes: number[] = []
  for (let i = maior + 1; seguintes.length < maxSugestoes; i++) {
    seguintes.push(i)
  }

  return [...buracos, ...seguintes]
}

export function textoFaixaOcupacaoSala(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "Sem base"
  const p = Number(pct) > 1 ? Number(pct) / 100 : Number(pct)
  if (p >= 0.8) return "80% a 100%"
  if (p >= 0.6) return "60% a 79%"
  if (p >= 0.4) return "40% a 59%"
  return "0% a 39%"
}