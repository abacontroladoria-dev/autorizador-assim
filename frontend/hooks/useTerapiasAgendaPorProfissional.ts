"use client"

import { useEffect, useState } from "react"
import { getRefWeek } from "@/lib/cronograma/helpers"
import { buscarGradeComoCSVRows } from "@/lib/cronograma/gradeService"
import { normKey } from "@/lib/remuneracao/constants"

/**
 * Terapias reais da agenda TiTa de cada profissional — mesma janela (1ª
 * semana completa do mês subsequente) e mesma fonte (csv_grades_profissionais
 * via buscarGradeComoCSVRows) que Saída de Profissional usa. Conta tanto
 * horário ocupado quanto livre (a busca não filtra por status_agendamento):
 * o que importa aqui é em que terapia o profissional está escalado na
 * agenda, não se o horário está preenchido por um paciente agora.
 *
 * Usa "Terapia" (a clínica/de ação), não "Terapia Exibição" (rótulo de
 * calendário — ver mappings.ts em services/tita, onde uma mesma terapia
 * clínica pode aparecer sob 3 exibições diferentes).
 */
export function useTerapiasAgendaPorProfissional() {
  const [porProfissional, setPorProfissional] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    async function carregar() {
      try {
        const { inicio, fim } = getRefWeek()
        const rows = await buscarGradeComoCSVRows(inicio, fim)
        const mapa: Record<string, Set<string>> = {}
        rows.forEach(r => {
          const prof = r["Profissional"]
          const terapia = r["Terapia"]
          if (!prof?.trim() || !terapia?.trim()) return
          const key = normKey(prof)
          if (!mapa[key]) mapa[key] = new Set()
          // Uma linha da grade às vezes traz a terapia como combo numa string só
          // ("Aplicador ABA (PS), Coordenador de Caso") — sem separar por vírgula
          // aqui, esse combo inteiro entra no Set como um valor à parte de
          // "Aplicador ABA (PS)" sozinho, e o profissional aparecia com a mesma
          // terapia repetida na lista final.
          terapia.split(",").map(t => t.trim()).filter(Boolean).forEach(t => mapa[key].add(t))
        })
        if (!isMounted) return
        const final: Record<string, string[]> = {}
        Object.entries(mapa).forEach(([key, set]) => {
          final[key] = [...set].sort((a, b) => a.localeCompare(b, "pt-BR"))
        })
        setPorProfissional(final)
      } catch (e) {
        if (isMounted) setError(e instanceof Error ? e.message : "Não foi possível carregar as terapias da agenda.")
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    carregar()
    return () => { isMounted = false }
  }, [])

  return { terapiasPorProfissional: porProfissional, loading, error }
}
