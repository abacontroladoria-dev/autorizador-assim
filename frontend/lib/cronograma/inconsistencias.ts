import { pm, getTurno, isLaudoComAlta } from "./helpers"
import { EXCLUIR_OCUP } from "./constants"
import type { CsvRow, LaudoRow } from "@/types/cronograma"

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type IncTipo =
  | "unidade_turno"   // unidades diferentes no mesmo turno
  | "buraco"          // intervalo ≠ 40 min entre sessões consecutivas
  | "min_sessoes"     // apenas 1 sessão clínica no dia (não Particular)
  | "exibicao_aba"    // PS/SF/AV/EF/Coord/Superv sem "Psicologia ABA"
  | "exibicao_hs"     // HS terapiaExib incorreta (ou ASSIM com HS)
  | "exibicao_ae"     // AE terapiaExib incorreta (ou ASSIM com AE/SF)

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

// Terapias que DEVEM ter terapiaExib = "Psicologia ABA" (sem exceções especiais)
const ABA_BASE = new Set([
  "Aplicador ABA (PS)", "Aplicador ABA (SF)", "Aplicador ABA (AV)",
  "Aplicador ABA (EF)", "Coordenador de Caso", "Supervisão ABA",
])

// Terapias que NÃO são sessões clínicas do paciente (excluir de buraco/min_sessoes)
const ADMIN_ONLY = new Set([
  "Supervisão ABA", "Coordenador de Caso", "Visita Guiada", "Triagem",
  "Avaliação Neuropsicológica", "Avaliação de Repertório",
])

// Especialidade no laudo que indica autorização para AE
// (confirmar com usuário — user informou "Arteterapia")
const AE_LAUDO_ESP = "Arteterapia"

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
    if (sit && sit !== "vigente") continue
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
    if (!pac) continue
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

  // ── R4/R5/R6: Regras de terapiaExib e ASSIM ───────────────────────────────
  for (const s of sessoes) {
    const isAssim = s.conv.toLowerCase().includes("assim")

    // R4 — ABA_BASE deve ter "Psicologia ABA"
    // SF+ASSIM é tratado em R6 — evita double-flag
    if (ABA_BASE.has(s.terapia) && !(isAssim && s.terapia === "Aplicador ABA (SF)")) {
      if (s.terapiaExib !== "Psicologia ABA") {
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_aba"),
          tipo: "exibicao_aba",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: "Psicologia ABA",
          detalhe: `"${s.terapia}" deve exibir "Psicologia ABA"`,
        })
      }
    }

    // R5 — HS
    if (s.terapia === "Aplicador ABA (HS)") {
      if (isAssim) {
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_hs"),
          tipo: "exibicao_hs",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
          detalhe: `Convênio ASSIM não permite Aplicador ABA (HS)`,
        })
      } else {
        const hsQtd = laudoQtd[`${s.pac}|||Habilidades Sociais`] ?? 0
        const esperado = hsQtd > 1 ? "(Habilidades Sociais (Psicologia ABA))" : "Psicologia ABA"
        if (s.terapiaExib !== esperado) {
          items.push({
            id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_hs"),
            tipo: "exibicao_hs",
            pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
            prof: s.prof, terapia: s.terapia,
            terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
            detalhe: hsQtd > 1
              ? `HS autorizado (${hsQtd}x) — exibição deve ser "(Habilidades Sociais (Psicologia ABA))"`
              : `HS sem laudo vigente — exibição deve ser "Psicologia ABA"`,
          })
        }
      }
    }

    // R6 — AE
    if (s.terapia === "Aplicador ABA (AE)") {
      if (isAssim) {
        items.push({
          id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
          tipo: "exibicao_ae",
          pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
          prof: s.prof, terapia: s.terapia,
          terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
          detalhe: `Convênio ASSIM não permite Aplicador ABA (AE)`,
        })
      } else {
        const aeAutorizado = (laudoQtd[`${s.pac}|||${AE_LAUDO_ESP}`] ?? 0) > 0
        const esperado = aeAutorizado ? "Aplicador ABA (AE) (Psicologia ABA)" : "Psicologia ABA"
        if (s.terapiaExib !== esperado) {
          items.push({
            id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
            tipo: "exibicao_ae",
            pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
            prof: s.prof, terapia: s.terapia,
            terapiaExibAtual: s.terapiaExib || "(vazio)", terapiaExibEsperada: esperado,
            detalhe: aeAutorizado
              ? `AE autorizado no laudo — exibição deve ser "Aplicador ABA (AE) (Psicologia ABA)"`
              : `AE sem laudo — exibição deve ser "Psicologia ABA"`,
          })
        }
      }
    }

    // SF com ASSIM
    if (s.terapia === "Aplicador ABA (SF)" && isAssim) {
      items.push({
        id: mkId(s.pac, s.dia, s.hora, s.terapia, "exibicao_ae"),
        tipo: "exibicao_ae",
        pac: s.pac, conv: s.conv, dia: s.dia, hora: s.hora,
        prof: s.prof, terapia: s.terapia,
        terapiaExibAtual: s.terapiaExib, terapiaExibEsperada: "—",
        detalhe: `Convênio ASSIM não permite Aplicador ABA (SF)`,
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
