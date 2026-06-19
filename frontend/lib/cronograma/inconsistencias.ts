import { pm, getTurno, isLaudoComAlta } from "./helpers"
import {
  EXCLUIR_OCUP, PACS_ADMIN,
  ABA_EXIB_PSICO_NAMES, EXIB_ID, EXIB_NOME, TERAPIA_ID,
  AE_LAUDO_ESP, HS_LAUDO_ESP,
} from "./constants"
import type { CsvRow, LaudoRow } from "@/types/cronograma"

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type IncTipo =
  | "unidade_turno"      // paciente em unidades diferentes no mesmo turno
  | "buraco"             // intervalo ≠ 40 min entre sessões consecutivas
  | "min_sessoes"        // apenas 1 sessão clínica no dia (não Particular)
  | "exibicao_aba"       // PS/SF/AV/EF/Coord/Superv sem "Psicologia ABA"
  | "exibicao_hs"        // HS terapiaExib incorreta (ou ASSIM com HS)
  | "exibicao_ae"        // AE terapiaExib incorreta (ou ASSIM com AE/SF)
  | "prof_unidade_turno" // profissional em unidades diferentes no mesmo turno

export interface IncItem {
  id: string
  tipo: IncTipo
  pac: string
  conv: string
  dia: string
  hora: string
  prof: string
  terapia: string
  terapiaExibAtual: string
  terapiaExibEsperada: string
  detalhe: string
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

// Terapias que NÃO são sessões clínicas do paciente (excluir de buraco/min_sessoes)
const ADMIN_ONLY = new Set([
  "Supervisão ABA", "Coordenador de Caso", "Visita Guiada", "Triagem",
  "Avaliação Neuropsicológica", "Avaliação de Repertório",
])

// Nomes derivados de TERAPIA_ID — ao renomear, atualize apenas TERAPIA_ID em constants.ts
const ID_SF = 2263
const ID_AE = 2260
const ID_HS = 2283
const AE_NOME = (Object.entries(TERAPIA_ID) as [string, number][]).find(([, id]) => id === ID_AE)?.[0] ?? "Aplicador ABA (AE)"
const HS_NOME = (Object.entries(TERAPIA_ID) as [string, number][]).find(([, id]) => id === ID_HS)?.[0] ?? "Aplicador ABA (HS)"

// ─── ALGORITMO PRINCIPAL ──────────────────────────────────────────────────────

export function detectarInconsistencias(cRows: CsvRow[], lRows: LaudoRow[]): IncItem[] {
  const items: IncItem[] = []

  // ── Pre-processamento dos laudos ──────────────────────────────────────────
  // laudoQtd: "pac|||esp" → quantidade máxima autorizada (excluindo alta)
  const laudoQtd: Record<string, number> = {}
  for (const l of lRows) {
    const pac = String(l["Paciente"] || "").trim()
    const esp = String(l["Especialidade"] || "").trim()
    if (!pac || !esp) continue
    if (isLaudoComAlta(l)) continue
    const sit = String(l["Situação"] || "").toLowerCase()
    if (sit !== "vigente") continue
    const qtd = Number(l["Qtd autorizada"] || 0)
    if (qtd <= 0) continue
    const k = `${pac}|||${esp}`
    laudoQtd[k] = Math.max(laudoQtd[k] || 0, qtd)
  }

  // ── Convênio de cada paciente (pela laudo) ────────────────────────────────
  const convMap: Record<string, string> = {}
  for (const l of lRows) {
    const pac = String(l["Paciente"] || "").trim()
    if (!pac) continue
    const plano = String(l["Plano"] || "").trim()
    if (plano && !convMap[pac]) convMap[pac] = plano
  }

  // ── Filtrar sessões agendadas ─────────────────────────────────────────────
  type Sess = {
    pac: string; conv: string; dia: string; hora: string; hMin: number
    terapia: string; terapiaExib: string; prof: string
    unidade: string; turno: "manhã" | "tarde"
    // isAdmin: excluído de buraco/unidade E de min_sessoes (supervisão, triagem…)
    isAdmin: boolean
    // isExclOcup: excluído de buraco/unidade (= EXCLUIR_OCUP, inclui SF/AE)
    // mas NÃO excluído de min_sessoes (paciente ainda comparece)
    isExclOcup: boolean
  }

  const sessoes: Sess[] = []
  for (const r of cRows) {
    const status = String(r["Status do Agendamento"] || "")
    if (status !== "Agendado") continue
    const pac = String(r["Nome Favorecido"] || "").trim()
    if (!pac || PACS_ADMIN.has(pac)) continue
    const hora = String(r["HI_str"] || String(r["Hora Inicial"] || "").slice(0, 5) || "")
    const hMin = pm(hora) ?? -1
    if (hMin < 0) continue
    const terapia = String(r["Terapia"] || "").trim()
    const terapiaExib = String(r["Terapia Exibição"] || r["Terapia Exibicao"] || "").trim()
    const conv = convMap[pac] || String(r["Convênio"] || "").trim()
    sessoes.push({
      pac, conv,
      dia: String(r["Dia da Semana"] || "").trim(),
      hora, hMin,
      terapia, terapiaExib,
      prof: String(r["Profissional"] || "").trim(),
      unidade: String((r as Record<string, unknown>)["Unidade"] || "").trim(),
      turno: getTurno(hora),
      isAdmin: ADMIN_ONLY.has(terapia),
      isExclOcup: EXCLUIR_OCUP.has(terapia),
    })
  }

  function mkId(pac: string, dia: string, hora: string, terapia: string, tipo: IncTipo) {
    return `${pac}|||${dia}|||${hora}|||${terapia}|||${tipo}`
  }

  // ── Agrupar por pac × dia ─────────────────────────────────────────────────
  const byPacDia = new Map<string, Sess[]>()
  for (const s of sessoes) {
    const k = `${s.pac}|||${s.dia}`
    if (!byPacDia.has(k)) byPacDia.set(k, [])
    byPacDia.get(k)!.push(s)
  }

  // ── R1: Unidade diferente no mesmo turno ──────────────────────────────────
  for (const group of byPacDia.values()) {
    // Agrupa por turno — exclui sessões que não envolvem presença física do paciente
    const byTurno = new Map<string, Sess[]>()
    for (const s of group) {
      if (s.isExclOcup) continue
      if (!s.unidade || s.unidade === "AT Externo" || s.unidade === "Desconhecida") continue
      const k = `${s.turno}`
      if (!byTurno.has(k)) byTurno.set(k, [])
      byTurno.get(k)!.push(s)
    }
    for (const turnoSessoes of byTurno.values()) {
      const unidades = new Set(turnoSessoes.map(s => s.unidade))
      if (unidades.size <= 1) continue
      // Maioria
      const cnt: Record<string, number> = {}
      for (const s of turnoSessoes) cnt[s.unidade] = (cnt[s.unidade] || 0) + 1
      const mainU = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]
      for (const s of turnoSessoes) {
        if (s.unidade === mainU) continue
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "unidade_turno"),
          tipo: "unidade_turno",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.unidade, terapiaExibEsperada: mainU,
          detalhe: `Unidade "${s.unidade}" no ${s.turno} — maioria em "${mainU}"`,
        })
      }
    }
  }

  // ── R2: Buraco entre sessões ──────────────────────────────────────────────
  // Usa isExclOcup (= EXCLUIR_OCUP, igual ao saida.ts) — exclui SF/AE além das admin
  for (const group of byPacDia.values()) {
    const clinicas = group.filter(s => !s.isExclOcup).sort((a, b) => a.hMin - b.hMin)
    for (let i = 0; i < clinicas.length - 1; i++) {
      const a = clinicas[i], b = clinicas[i + 1]
      // Só checa dentro do mesmo turno
      if (a.turno !== b.turno) continue
      const diff = b.hMin - a.hMin
      if (diff !== 40) {
        items.push({
          id: mkId(a.pac, a.dia, b.hora, b.terapia, "buraco"),
          tipo: "buraco",
          pac: a.pac, conv: a.conv, dia: a.dia, hora: b.hora,
          prof: b.prof, terapia: b.terapia,
          terapiaExibAtual: "", terapiaExibEsperada: "",
          detalhe: `Intervalo de ${diff} min entre ${a.hora} e ${b.hora} (esperado: 40 min)`,
        })
      }
    }
  }

  // ── R3: Menos de 2 sessões clínicas no dia ────────────────────────────────
  for (const group of byPacDia.values()) {
    const pac = group[0].pac
    const conv = group[0].conv
    const dia = group[0].dia
    if (conv.toLowerCase().includes("particular")) continue
    const clinicas = group.filter(s => !s.isAdmin)
    if (clinicas.length === 1) {
      const s = clinicas[0]
      items.push({
        id: mkId(pac, dia, s.hora, s.terapia, "min_sessoes"),
        tipo: "min_sessoes",
        pac, conv, dia, hora: s.hora,
        prof: s.prof, terapia: s.terapia,
        terapiaExibAtual: "", terapiaExibEsperada: "",
        detalhe: `Apenas 1 sessão clínica no dia (${s.hora}) — responsáveis precisam de pelo menos 2`,
      })
    }
  }

  // ── R4/R5/R6: Regras de terapiaExib, ASSIM e Gratuidade ─────────────────────
  for (const s of sessoes) {
    const isAssim = s.conv.toLowerCase().includes("assim")
    const isGratuidade = s.conv.toLowerCase().includes("gratuidade")

    // R4 — Grupo 1 ABA → sempre Psicologia ABA (IDs: 2269/2317/2262/2261/2248/2353/2263)
    // SF+ASSIM é excluído aqui e tratado separadamente abaixo
    if (ABA_EXIB_PSICO_NAMES.has(s.terapia) && !(isAssim && TERAPIA_ID[s.terapia] === ID_SF)) {
      const esperado = EXIB_NOME[EXIB_ID.PSICOLOGIA_ABA]
      if (s.terapiaExib !== esperado) {
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_aba"),
          tipo: "exibicao_aba",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
          detalhe: `"${s.terapia}" deve exibir "${esperado}"`,
        })
      }
    }

    // R5 — HS (ID 2283)
    if (s.terapia === HS_NOME) {
      const hsQtd = laudoQtd[`${s.pac}|||${HS_LAUDO_ESP}`] ?? 0
      if (isGratuidade) {
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_hs"),
          tipo: "exibicao_hs",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
          detalhe: "Convênio Gratuidade não permite Aplicador ABA (HS)",
        })
      } else if (isAssim) {
        if (hsQtd > 1) {
          // ASSIM com laudo HS > 1: permitido, mas exibição deve ser específica
          const esperado = EXIB_NOME[EXIB_ID.HS_ABA]
          if (s.terapiaExib !== esperado) {
            items.push({
              id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_hs"),
              tipo: "exibicao_hs",
              pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
              prof: s.prof, terapia: s.terapia,
              terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
              detalhe: `ASSIM com laudo "${HS_LAUDO_ESP}" (${hsQtd}x) — exibição deve ser "${esperado}"`,
            })
          }
        } else {
          items.push({
            id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_hs"),
            tipo: "exibicao_hs",
            pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
            prof: s.prof, terapia: s.terapia,
            terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
            detalhe: `Convênio ASSIM não permite HS — laudo "${HS_LAUDO_ESP}" precisa de qtd > 1`,
          })
        }
      } else {
        const esperado = hsQtd > 0 ? EXIB_NOME[EXIB_ID.HS_ABA] : EXIB_NOME[EXIB_ID.PSICOLOGIA_ABA]
        if (s.terapiaExib !== esperado) {
          items.push({
            id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_hs"),
            tipo: "exibicao_hs",
            pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
            prof: s.prof, terapia: s.terapia,
            terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
            detalhe: hsQtd > 0
              ? `HS com laudo "${HS_LAUDO_ESP}" (${hsQtd}x) — exibição deve ser "${esperado}"`
              : `HS sem laudo "${HS_LAUDO_ESP}" vigente — exibição deve ser "${esperado}"`,
          })
        }
      }
    }

    // R6 — AE (ID 2260)
    if (s.terapia === AE_NOME) {
      const aeQtd = laudoQtd[`${s.pac}|||${AE_LAUDO_ESP}`] ?? 0
      if (isGratuidade) {
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
          tipo: "exibicao_ae",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
          detalhe: "Convênio Gratuidade não permite Aplicador ABA (AE)",
        })
      } else if (isAssim) {
        if (aeQtd > 1) {
          // ASSIM com laudo AE > 1: permitido, mas exibição deve ser específica
          const esperado = EXIB_NOME[EXIB_ID.ARTETERAPIA_ABA]
          if (s.terapiaExib !== esperado) {
            items.push({
              id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
              tipo: "exibicao_ae",
              pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
              prof: s.prof, terapia: s.terapia,
              terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
              detalhe: `ASSIM com laudo "${AE_LAUDO_ESP}" (${aeQtd}x) — exibição deve ser "${esperado}"`,
            })
          }
        } else {
          items.push({
            id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
            tipo: "exibicao_ae",
            pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
            prof: s.prof, terapia: s.terapia,
            terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
            detalhe: `Convênio ASSIM não permite AE — laudo "${AE_LAUDO_ESP}" precisa de qtd > 1`,
          })
        }
      } else {
        const esperado = aeQtd > 0 ? EXIB_NOME[EXIB_ID.ARTETERAPIA_ABA] : EXIB_NOME[EXIB_ID.PSICOLOGIA_ABA]
        if (s.terapiaExib !== esperado) {
          items.push({
            id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
            tipo: "exibicao_ae",
            pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
            prof: s.prof, terapia: s.terapia,
            terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
            detalhe: aeQtd > 0
              ? `AE com laudo "${AE_LAUDO_ESP}" (${aeQtd}x) — exibição deve ser "${esperado}"`
              : `AE sem laudo "${AE_LAUDO_ESP}" vigente — exibição deve ser "${esperado}"`,
          })
        }
      }
    }

    // SF (ID 2263) com ASSIM: não permitido
    if (TERAPIA_ID[s.terapia] === ID_SF && isAssim) {
      items.push({
        id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
        tipo: "exibicao_ae",
        pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
        prof: s.prof, terapia: s.terapia,
        terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
        detalhe: "Convênio ASSIM não permite Aplicador ABA (SF)",
      })
    }
  }

  // ── R8: Profissional em unidades diferentes no mesmo turno ────────────────────
  interface SessProf {
    prof: string; dia: string; hora: string; hMin: number
    unidade: string; turno: "manhã" | "tarde"; pac: string; terapia: string
  }
  const sessoesProf: SessProf[] = []
  for (const r of cRows) {
    if (String(r["Status do Agendamento"] || "") !== "Agendado") continue
    const prof = String(r["Profissional"] || "").trim()
    if (!prof) continue
    const pac = String(r["Nome Favorecido"] || "").trim()
    if (!pac || PACS_ADMIN.has(pac)) continue
    const hora = String(r["HI_str"] || String(r["Hora Inicial"] || "").slice(0, 5) || "")
    const hMin = pm(hora) ?? -1
    if (hMin < 0) continue
    const unidade = String((r as Record<string, unknown>)["Unidade"] || "").trim()
    if (!unidade || unidade === "AT Externo" || unidade === "Desconhecida") continue
    sessoesProf.push({
      prof,
      dia: String(r["Dia da Semana"] || "").trim(),
      hora, hMin, unidade,
      turno: getTurno(hora),
      pac, terapia: String(r["Terapia"] || "").trim(),
    })
  }

  const byProfDiaTurno = new Map<string, SessProf[]>()
  for (const s of sessoesProf) {
    const k = `${s.prof}|||${s.dia}|||${s.turno}`
    if (!byProfDiaTurno.has(k)) byProfDiaTurno.set(k, [])
    byProfDiaTurno.get(k)!.push(s)
  }

  for (const group of byProfDiaTurno.values()) {
    const unidades = new Set(group.map(s => s.unidade))
    if (unidades.size <= 1) continue
    // Unidade majoritária = referência
    const cnt: Record<string, number> = {}
    for (const s of group) cnt[s.unidade] = (cnt[s.unidade] || 0) + 1
    const mainU = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]
    for (const s of group) {
      if (s.unidade === mainU) continue
      items.push({
        id: `${s.prof}|||${s.dia}|||${s.hora}|||${s.terapia}|||prof_unidade_turno`,
        tipo: "prof_unidade_turno",
        pac: s.pac,
        conv: "",
        dia: s.dia,
        hora: s.hora,
        prof: s.prof,
        terapia: s.terapia,
        terapiaExibAtual: s.unidade,
        terapiaExibEsperada: mainU,
        detalhe: `${s.prof} — ${s.turno}: agendado em "${s.unidade}" (${s.hora}) mas maioria em "${mainU}"`,
      })
    }
  }

  // Dedup por id (uma sessão pode ter gerado item duplicado)
  const seen = new Set<string>()
  return items.filter(i => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })
}
